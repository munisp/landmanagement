"""Fixed, governed Apache Sedona spatial job program.

This program accepts only a worker-generated manifest. It never accepts SQL, shell
arguments, output URIs, or Spark configuration from an end user.
"""

from __future__ import annotations

import argparse
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple
from urllib.parse import unquote, urlparse
from uuid import uuid4

import numpy as np
import rasterio
from rasterio.mask import mask as raster_mask
from pyspark.sql import DataFrame, SparkSession, functions as F, types as T
from sedona.spark import SedonaContext
from shapely import wkt as shapely_wkt
from shapely.geometry import Point, mapping
from shapely.ops import transform as shapely_transform
from pyproj import Transformer


MAX_RASTER_CELLS = int(os.getenv("SEDONA_MAX_RASTER_CELLS", "20000000"))


class GovernedJobError(RuntimeError):
    pass


ARTIFACT_WRITE_SCHEMA = T.StructType([
    T.StructField("artifact_id", T.StringType(), nullable=False),
    T.StructField("job_id", T.StringType(), nullable=False),
    T.StructField("analysis_run_id", T.LongType(), nullable=True),
    T.StructField("parcel_id", T.LongType(), nullable=True),
    T.StructField("operation", T.StringType(), nullable=False),
    T.StructField("artifact_uri", T.StringType(), nullable=False),
    T.StructField("media_type", T.StringType(), nullable=False),
    T.StructField("checksum_sha256", T.StringType(), nullable=False),
    T.StructField("geometry_column", T.StringType(), nullable=True),
    T.StructField("output_crs", T.StringType(), nullable=True),
    T.StructField("feature_count", T.LongType(), nullable=True),
    T.StructField("area_square_meters", T.DoubleType(), nullable=True),
    T.StructField("metadata_json", T.StringType(), nullable=True),
    T.StructField("created_at", T.TimestampType(), nullable=False),
])

EVENT_WRITE_SCHEMA = T.StructType([
    T.StructField("event_id", T.StringType(), nullable=False),
    T.StructField("job_id", T.StringType(), nullable=False),
    T.StructField("event_type", T.StringType(), nullable=False),
    T.StructField("attempt", T.LongType(), nullable=False),
    T.StructField("spark_application_id", T.StringType(), nullable=True),
    T.StructField("payload_json", T.StringType(), nullable=True),
    T.StructField("occurred_at", T.TimestampType(), nullable=False),
])


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise GovernedJobError(f"{name} must be configured for governed Sedona execution")
    return value


def load_manifest(path: str) -> Dict[str, Any]:
    candidate = Path(path)
    if not candidate.is_file() or candidate.stat().st_size > 10_000_000:
        raise GovernedJobError("Job manifest is unavailable or exceeds the maximum size")
    payload = json.loads(candidate.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise GovernedJobError("Job manifest must be an object")
    for field in ("jobId", "jobKey", "operation", "input", "warehousePath", "outputPrefix"):
        if field not in payload:
            raise GovernedJobError(f"Job manifest is missing {field}")
    if not isinstance(payload["input"], dict):
        raise GovernedJobError("Job input must be an object")
    return payload


def s3a_path(s3_uri: str) -> str:
    parsed = urlparse(s3_uri)
    if parsed.scheme != "s3" or not parsed.netloc:
        raise GovernedJobError("Expected an S3 URI")
    return f"s3a://{parsed.netloc}{parsed.path}"


def output_uri(manifest: Dict[str, Any]) -> str:
    warehouse = str(manifest["warehousePath"]).rstrip("/")
    prefix = str(manifest["outputPrefix"]).strip("/")
    parsed = urlparse(warehouse)
    warehouse_prefix = parsed.path.strip("/")
    if not prefix.startswith(f"{warehouse_prefix}/spatial/jobs/"):
        raise GovernedJobError("Worker output prefix escapes the approved Lakehouse warehouse")
    return f"s3://{parsed.netloc}/{prefix}/data"


def output_spark_path(manifest: Dict[str, Any]) -> str:
    return s3a_path(output_uri(manifest))


def spark_session() -> SparkSession:
    catalog_uri = required_env("ICEBERG_CATALOG_URI")
    parsed_catalog = urlparse(catalog_uri)
    if parsed_catalog.scheme not in {"postgres", "postgresql"} or not parsed_catalog.hostname:
        raise GovernedJobError("ICEBERG_CATALOG_URI must be PostgreSQL")
    endpoint = urlparse(required_env("S3_ENDPOINT"))
    if endpoint.scheme not in {"http", "https"} or not endpoint.netloc:
        raise GovernedJobError("S3_ENDPOINT must be an absolute HTTP(S) URL")
    hostname = parsed_catalog.hostname
    port = parsed_catalog.port or 5432
    database = parsed_catalog.path.lstrip("/")
    if not database:
        raise GovernedJobError("ICEBERG_CATALOG_URI requires a database")
    builder = (
        SedonaContext.builder()
        .appName("idlr-governed-sedona-job")
        .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions,org.apache.sedona.sql.SedonaSqlExtensions")
        .config("spark.serializer", "org.apache.spark.serializer.KryoSerializer")
        .config("spark.kryo.registrator", "org.apache.sedona.core.serde.SedonaKryoRegistrator")
        .config("spark.sql.catalog.idlr", "org.apache.iceberg.spark.SparkCatalog")
        .config("spark.sql.catalog.idlr.type", "jdbc")
        .config("spark.sql.catalog.idlr.uri", f"jdbc:postgresql://{hostname}:{port}/{database}")
        .config("spark.sql.catalog.idlr.jdbc.user", unquote(parsed_catalog.username or ""))
        .config("spark.sql.catalog.idlr.jdbc.password", unquote(parsed_catalog.password or ""))
        .config("spark.sql.catalog.idlr.warehouse", s3a_path(required_env("ICEBERG_WAREHOUSE_PATH")))
        .config("spark.hadoop.fs.s3a.endpoint", endpoint.netloc)
        .config("spark.hadoop.fs.s3a.access.key", required_env("S3_ACCESS_KEY"))
        .config("spark.hadoop.fs.s3a.secret.key", required_env("S3_SECRET_KEY"))
        .config("spark.hadoop.fs.s3a.path.style.access", "true")
        .config("spark.hadoop.fs.s3a.connection.ssl.enabled", "true" if endpoint.scheme == "https" else "false")
        .config("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")
        # PyIceberg writes standard s3:// metadata locations; bind that scheme
        # to the same hardened S3A client instead of relying on an AWS SDK default.
        .config("spark.hadoop.fs.s3.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")
        .config("spark.hadoop.fs.s3.impl.disable.cache", "true")
        .config("spark.hadoop.fs.s3a.aws.credentials.provider", "org.apache.hadoop.fs.s3a.SimpleAWSCredentialsProvider")
    )
    session = builder.getOrCreate()
    SedonaContext.create(session)
    return session


def features_dataframe(spark: SparkSession, manifest_input: Dict[str, Any]) -> DataFrame:
    features = manifest_input.get("features")
    if not isinstance(features, list) or not features:
        raise GovernedJobError("Input must contain a non-empty bounded feature list")
    rows: List[Dict[str, Any]] = []
    for feature in features:
        if not isinstance(feature, dict):
            raise GovernedJobError("Each feature must be an object")
        rows.append({
            "feature_id": feature["featureId"],
            "geometry_wkt": feature["geometryWkt"],
            "source_crs": feature["sourceCrs"],
            "source_asset_id": feature.get("sourceAssetId"),
            "source_checksum_sha256": feature.get("sourceChecksumSha256"),
            "properties_json": json.dumps(feature.get("properties", {}), sort_keys=True, separators=(",", ":")),
        })
    raw = spark.createDataFrame(rows)
    analysis_crs = manifest_input["analysisCrs"]
    return raw.withColumn("geometry", F.expr(f"ST_Transform(ST_GeomFromWKT(geometry_wkt), source_crs, '{analysis_crs}')"))


def write_geoparquet(frame: DataFrame, path: str, *, allow_empty: bool = False) -> int:
    count = frame.count()
    if count <= 0 and not allow_empty:
        raise GovernedJobError("A governed Sedona operation must produce at least one output feature")
    frame.write.format("geoparquet").mode("overwrite").save(path)
    return count


def export_geoparquet(spark: SparkSession, manifest_input: Dict[str, Any], path: str) -> Dict[str, Any]:
    frame = features_dataframe(spark, manifest_input)
    requested_properties = manifest_input.get("includeProperties", [])
    selected = frame
    if requested_properties:
        selected = selected.withColumn("properties_json", F.col("properties_json"))
    count = write_geoparquet(selected, path)
    return {"operation": "geoparquet_export", "featureCount": count, "outputCrs": manifest_input["analysisCrs"], "geometryColumn": "geometry"}


def topology_validation(spark: SparkSession, manifest_input: Dict[str, Any], path: str) -> Dict[str, Any]:
    frame = features_dataframe(spark, manifest_input)
    tolerance = float(manifest_input.get("overlapToleranceSquareMeters", 0.0))
    left = frame.alias("left")
    right = frame.alias("right")
    overlaps = (
        left.join(right, F.col("left.feature_id") < F.col("right.feature_id"))
        .where(F.expr("ST_Intersects(left.geometry, right.geometry)"))
        .select(
            F.col("left.feature_id").alias("feature_a_id"),
            F.col("right.feature_id").alias("feature_b_id"),
            F.expr("ST_Intersection(left.geometry, right.geometry)").alias("geometry"),
            F.expr("ST_Area(ST_Intersection(left.geometry, right.geometry))").alias("overlap_square_meters"),
        )
        .where(F.col("overlap_square_meters") > F.lit(tolerance))
    )
    count = write_geoparquet(overlaps, path, allow_empty=True)
    total_area = overlaps.agg(F.sum("overlap_square_meters").alias("area")).first()["area"]
    return {"operation": "topology_validation", "violationCount": count, "overlapAreaSquareMeters": float(total_area or 0.0), "outputCrs": manifest_input["analysisCrs"], "geometryColumn": "geometry"}


def spatial_workbench(spark: SparkSession, manifest_input: Dict[str, Any], path: str) -> Dict[str, Any]:
    frame = features_dataframe(spark, manifest_input)
    anchor_id = manifest_input["anchorFeatureId"]
    distance = float(manifest_input.get("neighborDistanceMeters", 5_000))
    anchors = frame.where(F.col("feature_id") == F.lit(anchor_id)).alias("anchor")
    if anchors.limit(1).count() != 1:
        raise GovernedJobError("anchorFeatureId is not present in the governed feature set")
    neighbors = (
        frame.alias("candidate")
        .crossJoin(anchors)
        .where(F.col("candidate.feature_id") != F.col("anchor.feature_id"))
        .withColumn("distance_meters", F.expr("ST_Distance(candidate.geometry, anchor.geometry)"))
        .where(F.col("distance_meters") <= F.lit(distance))
        .select(
            F.col("candidate.feature_id").alias("feature_id"),
            F.col("candidate.geometry").alias("geometry"),
            F.col("distance_meters"),
            F.lit(anchor_id).alias("anchor_feature_id"),
        )
    )
    count = write_geoparquet(neighbors, path)
    return {"operation": "spatial_workbench", "neighborCount": count, "neighborDistanceMeters": distance, "outputCrs": manifest_input["analysisCrs"], "geometryColumn": "geometry"}


def raster_path(uri: str) -> str:
    parsed = urlparse(uri)
    if parsed.scheme == "s3":
        return f"/vsis3/{parsed.netloc}{parsed.path}"
    if parsed.scheme == "https":
        return f"/vsicurl/{uri}"
    raise GovernedJobError("Raster assets must use registered s3:// or https:// URIs")


def transformed_shape(geometry_wkt: str, source_crs: str, target_crs: str):
    geometry = shapely_wkt.loads(geometry_wkt)
    if source_crs.upper() == target_crs.upper():
        return geometry
    transformer = Transformer.from_crs(source_crs, target_crs, always_xy=True)
    return shapely_transform(transformer.transform, geometry)


def zonal_statistics(spark: SparkSession, manifest_input: Dict[str, Any], path: str) -> Dict[str, Any]:
    raster = manifest_input.get("raster")
    if not isinstance(raster, dict):
        raise GovernedJobError("Zonal statistics requires a registered raster asset")
    rows: List[Dict[str, Any]] = []
    with rasterio.open(raster_path(str(raster["uri"]))) as dataset:
        if dataset.width * dataset.height > MAX_RASTER_CELLS:
            raise GovernedJobError("Raster exceeds the governed maximum cell count")
        for feature in manifest_input["features"]:
            shape = transformed_shape(feature["geometryWkt"], feature["sourceCrs"], str(dataset.crs))
            data, _ = raster_mask(dataset, [mapping(shape)], crop=True, indexes=int(raster.get("band", 1)), filled=False)
            values = np.asarray(data.compressed(), dtype=np.float64)
            if values.size == 0:
                continue
            rows.append({
                "feature_id": feature["featureId"],
                "geometry_wkt": feature["geometryWkt"],
                "source_crs": feature["sourceCrs"],
                "sample_count": int(values.size),
                "minimum": float(np.min(values)),
                "maximum": float(np.max(values)),
                "mean": float(np.mean(values)),
                "stddev": float(np.std(values)),
            })
    if not rows:
        raise GovernedJobError("No valid raster samples overlap the governed zones")
    frame = spark.createDataFrame(rows).withColumn("geometry", F.expr("ST_Transform(ST_GeomFromWKT(geometry_wkt), source_crs, '%s')" % manifest_input["analysisCrs"]))
    count = write_geoparquet(frame, path)
    return {"operation": "zonal_statistics", "zoneCount": count, "rasterAssetId": raster["assetId"], "outputCrs": manifest_input["analysisCrs"], "geometryColumn": "geometry"}


def _line_visible(elevation: np.ndarray, row0: int, col0: int, row1: int, col1: int, observer_height: float) -> bool:
    dr = row1 - row0
    dc = col1 - col0
    steps = max(abs(dr), abs(dc))
    if steps == 0:
        return True
    observer = float(elevation[row0, col0]) + observer_height
    target = float(elevation[row1, col1])
    for step in range(1, steps):
        ratio = step / steps
        row = int(round(row0 + dr * ratio))
        col = int(round(col0 + dc * ratio))
        expected = observer + (target - observer) * ratio
        if float(elevation[row, col]) > expected:
            return False
    return True


def viewshed(spark: SparkSession, manifest_input: Dict[str, Any], path: str) -> Dict[str, Any]:
    dem = manifest_input.get("dem")
    if not isinstance(dem, dict):
        raise GovernedJobError("Viewshed requires a registered DEM asset")
    observer = manifest_input["observer"]
    maximum_distance = float(manifest_input.get("maximumDistanceMeters", 10_000))
    rows: List[Dict[str, Any]] = []
    with rasterio.open(raster_path(str(dem["uri"]))) as dataset:
        if not dataset.crs or not dataset.crs.is_projected:
            raise GovernedJobError("Viewshed DEM must use a projected CRS with meter units")
        if dataset.width * dataset.height > MAX_RASTER_CELLS:
            raise GovernedJobError("DEM exceeds the governed maximum cell count")
        transform = Transformer.from_crs("EPSG:4326", str(dataset.crs), always_xy=True)
        x, y = transform.transform(float(observer["longitude"]), float(observer["latitude"]))
        observer_row, observer_col = dataset.index(x, y)
        if not (0 <= observer_row < dataset.height and 0 <= observer_col < dataset.width):
            raise GovernedJobError("Viewshed observer is outside the registered DEM extent")
        elevation = dataset.read(int(dem.get("band", 1)), masked=True)
        cell_x = abs(dataset.transform.a)
        cell_y = abs(dataset.transform.e)
        for row in range(dataset.height):
            for col in range(dataset.width):
                if elevation.mask[row, col]:
                    continue
                dx = (col - observer_col) * cell_x
                dy = (row - observer_row) * cell_y
                if math.hypot(dx, dy) > maximum_distance:
                    continue
                if _line_visible(np.asarray(elevation.filled(np.nan)), observer_row, observer_col, row, col, float(observer["heightAboveGroundMeters"])):
                    px, py = dataset.transform * (col + 0.5, row + 0.5)
                    rows.append({"feature_id": f"visible-{row}-{col}", "geometry_wkt": Point(px, py).wkt, "source_crs": str(dataset.crs), "distance_meters": float(math.hypot(dx, dy))})
    if not rows:
        raise GovernedJobError("Viewshed produced no visible cells")
    frame = spark.createDataFrame(rows).withColumn("geometry", F.expr("ST_Transform(ST_GeomFromWKT(geometry_wkt), source_crs, '%s')" % manifest_input["analysisCrs"]))
    count = write_geoparquet(frame, path)
    return {"operation": "viewshed", "visibleCellCount": count, "demAssetId": dem["assetId"], "maximumDistanceMeters": maximum_distance, "outputCrs": manifest_input["analysisCrs"], "geometryColumn": "geometry"}


def append_iceberg_records(spark: SparkSession, manifest: Dict[str, Any], result: Dict[str, Any], data_uri: str) -> None:
    created_at = datetime.now(timezone.utc).replace(tzinfo=None)
    artifact_rows = [{
        "artifact_id": str(uuid4()),
        "job_id": str(manifest["jobId"]),
        "analysis_run_id": manifest.get("analysisRunId"),
        "parcel_id": manifest.get("parcelId"),
        "operation": manifest["operation"],
        "artifact_uri": data_uri,
        "media_type": "application/vnd.apache.parquet",
        "checksum_sha256": manifest["inputChecksumSha256"],
        "geometry_column": result.get("geometryColumn"),
        "output_crs": result.get("outputCrs"),
        "feature_count": int(result.get("featureCount", result.get("zoneCount", result.get("neighborCount", result.get("violationCount", result.get("visibleCellCount", 0)))))),
        "area_square_meters": float(result.get("overlapAreaSquareMeters", 0.0)),
        "metadata_json": json.dumps(result, sort_keys=True, separators=(",", ":")),
        "created_at": created_at,
    }]
    spark.createDataFrame(artifact_rows, schema=ARTIFACT_WRITE_SCHEMA).writeTo("idlr.spatial.job_artifacts").append()
    event_rows = [{
        "event_id": str(uuid4()),
        "job_id": str(manifest["jobId"]),
        "event_type": "sedona.job.spark_completed.v1",
        "attempt": 0,
        "spark_application_id": spark.sparkContext.applicationId,
        "payload_json": json.dumps({"operation": manifest["operation"], "dataUri": data_uri}, sort_keys=True, separators=(",", ":")),
        "occurred_at": created_at,
    }]
    spark.createDataFrame(event_rows, schema=EVENT_WRITE_SCHEMA).writeTo("idlr.governance.spatial_job_events").append()


def execute(manifest: Dict[str, Any]) -> Dict[str, Any]:
    operation = manifest["operation"]
    job_input = manifest["input"]
    if operation != job_input.get("operation"):
        raise GovernedJobError("Manifest operation does not match its typed input")
    spark = spark_session()
    try:
        path = output_spark_path(manifest)
        if operation == "geoparquet_export":
            result = export_geoparquet(spark, job_input, path)
        elif operation == "topology_validation":
            result = topology_validation(spark, job_input, path)
        elif operation == "spatial_workbench":
            result = spatial_workbench(spark, job_input, path)
        elif operation == "zonal_statistics":
            result = zonal_statistics(spark, job_input, path)
        elif operation == "viewshed":
            result = viewshed(spark, job_input, path)
        else:
            raise GovernedJobError("Unsupported governed spatial operation")
        result["sparkApplicationId"] = spark.sparkContext.applicationId
        result["dataUri"] = output_uri(manifest)
        append_iceberg_records(spark, manifest, result, output_uri(manifest))
        return result
    finally:
        spark.stop()


def main() -> None:
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--result", required=True)
    args = parser.parse_args()
    result_file = Path(args.result)
    try:
        manifest = load_manifest(args.manifest)
        result = execute(manifest)
        serialized = json.dumps({"status": "succeeded", **result}, sort_keys=True, separators=(",", ":"))
        result_file.write_text(serialized, encoding="utf-8")
        os.chmod(result_file, 0o600)
        print(serialized, flush=True)
    except Exception as exc:
        serialized = json.dumps({"status": "failed", "error": str(exc)}, sort_keys=True)
        result_file.write_text(serialized, encoding="utf-8")
        os.chmod(result_file, 0o600)
        print(serialized, flush=True)
        raise


if __name__ == "__main__":
    main()
