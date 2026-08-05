"""Evidence-preserving processing primitives for the GeoAI innovation release.

Every endpoint consumes explicit, provenance-bearing input.  It returns measured
results and limitations; it never manufactures parcel geometry, source metadata,
network reachability, imagery, or legal conclusions when those inputs are absent.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional
import math

import networkx as nx
import numpy as np
import rasterio
from rasterio.features import shapes as raster_shapes
from rasterio.mask import mask as raster_mask
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from pyproj import CRS, Transformer
from shapely.geometry import Point, box, mapping, shape
from shapely.ops import transform as transform_geometry
from shapely.validation import make_valid

from api.geoai_service import (
    NetworkEdge,
    NetworkNode,
    RasterAssetRequest,
    _assert_measurement_crs,
    _parse_crs,
    _read_raster,
    _utc_now,
)

router = APIRouter(prefix="/geo-innovations", tags=["GeoAI Innovations"])


def _geojson_geometry(payload: Dict[str, Any], field_name: str):
    try:
        geometry = shape(payload)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"{field_name} is not valid GeoJSON: {exc}") from exc
    if geometry.is_empty:
        raise HTTPException(status_code=422, detail=f"{field_name} cannot be empty")
    return make_valid(geometry) if not geometry.is_valid else geometry


def _transform_geometry(geometry, source_crs: str, destination_crs: str):
    source = _parse_crs(source_crs, "source_crs")
    destination = _parse_crs(destination_crs, "destination_crs")
    transformer = Transformer.from_crs(source, destination, always_xy=True)
    return transform_geometry(transformer.transform, geometry)


def _uuid_like_key(prefix: str, source: str) -> str:
    """Deterministic, disclosure-safe key for pure API outputs.

    Persistence services assign platform keys; this key only allows a caller to
    correlate a response with its declared source asset without exposing a random
    local identifier.
    """
    import hashlib
    return f"{prefix}-{hashlib.sha256(source.encode('utf-8')).hexdigest()[:24]}"


class GeometryQualityRequest(BaseModel):
    geometry: Dict[str, Any]
    source_crs: str = Field(min_length=3, max_length=64)
    analysis_crs: str = Field(min_length=3, max_length=64)
    source_asset_id: str = Field(min_length=6, max_length=128)
    source_checksum_sha256: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    reported_horizontal_accuracy_m: float = Field(gt=0, le=10_000)
    expected_horizontal_accuracy_m: float = Field(gt=0, le=10_000)
    lineage_completeness_pct: float = Field(ge=0, le=100)
    required_geometry_type: Literal["Polygon", "MultiPolygon"] = "Polygon"


@router.post("/geometry/quality")
async def geometry_quality(request: GeometryQualityRequest):
    analysis_crs = _assert_measurement_crs(request.analysis_crs)
    original = _geojson_geometry(request.geometry, "geometry")
    metric = _transform_geometry(original, request.source_crs, analysis_crs.to_string())
    if metric.geom_type not in {"Polygon", "MultiPolygon"}:
        raise HTTPException(status_code=422, detail="Geometry quality requires a Polygon or MultiPolygon")
    required_type_ok = original.geom_type == request.required_geometry_type or (
        request.required_geometry_type == "Polygon" and original.geom_type == "MultiPolygon"
    )
    validity_score = 100.0 if original.is_valid else 50.0
    positional_score = min(100.0, request.expected_horizontal_accuracy_m / request.reported_horizontal_accuracy_m * 100.0)
    component_scores = {
        "validity": round(validity_score, 4),
        "positional_accuracy": round(positional_score, 4),
        "lineage_completeness": round(request.lineage_completeness_pct, 4),
        "required_geometry_type": 100.0 if required_type_ok else 0.0,
    }
    quality_score = round(sum(component_scores.values()) / len(component_scores), 4)
    return {
        "status": "computed",
        "generated_at": _utc_now(),
        "source_asset_id": request.source_asset_id,
        "source_checksum_sha256": request.source_checksum_sha256,
        "analysis_crs": analysis_crs.to_string(),
        "geometry": {
            "original_valid": bool(original.is_valid),
            "repair_applied": bool(not original.is_valid),
            "source_geometry_type": original.geom_type,
            "metric_area_m2": float(metric.area),
            "metric_perimeter_m": float(metric.length),
        },
        "score": {
            "value": quality_score,
            "components": component_scores,
            "calculation": "Unweighted mean of validity, positional accuracy against the declared expectation, lineage completeness, and geometry-type conformance.",
            "not_a_legal_certification": True,
        },
    }


class HazardSource(BaseModel):
    hazard_id: str = Field(min_length=2, max_length=128)
    hazard_type: str = Field(min_length=2, max_length=96)
    severity: float = Field(gt=0, le=5)
    geometry: Dict[str, Any]
    source_asset_id: str = Field(min_length=6, max_length=128)
    source_checksum_sha256: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    acquired_at: Optional[str] = None


class HazardProfileRequest(BaseModel):
    parcel_geometry: Dict[str, Any]
    parcel_source_crs: str = Field(min_length=3, max_length=64)
    analysis_crs: str = Field(min_length=3, max_length=64)
    parcel_asset_id: str = Field(min_length=6, max_length=128)
    parcel_checksum_sha256: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    hazards: List[HazardSource] = Field(min_length=1, max_length=256)


@router.post("/hazards/profile")
async def build_hazard_profile(request: HazardProfileRequest):
    analysis_crs = _assert_measurement_crs(request.analysis_crs)
    parcel = _geojson_geometry(request.parcel_geometry, "parcel_geometry")
    parcel_metric = _transform_geometry(parcel, request.parcel_source_crs, analysis_crs.to_string())
    if parcel_metric.geom_type not in {"Polygon", "MultiPolygon"} or parcel_metric.area <= 0:
        raise HTTPException(status_code=422, detail="Hazard profiling requires a positive-area parcel polygon")

    exposures: List[Dict[str, Any]] = []
    weighted_exposure = 0.0
    for hazard in request.hazards:
        candidate = _geojson_geometry(hazard.geometry, f"hazard {hazard.hazard_id}")
        hazard_metric = _transform_geometry(candidate, request.parcel_source_crs, analysis_crs.to_string())
        intersection = parcel_metric.intersection(hazard_metric)
        area_m2 = float(intersection.area) if not intersection.is_empty else 0.0
        fraction = area_m2 / float(parcel_metric.area)
        contribution = fraction * float(hazard.severity)
        weighted_exposure += contribution
        exposures.append({
            "hazard_id": hazard.hazard_id,
            "hazard_type": hazard.hazard_type,
            "severity": hazard.severity,
            "intersection_area_m2": area_m2,
            "parcel_coverage_pct": round(fraction * 100.0, 6),
            "severity_weighted_coverage": round(contribution, 8),
            "source_asset_id": hazard.source_asset_id,
            "source_checksum_sha256": hazard.source_checksum_sha256,
            "acquired_at": hazard.acquired_at,
        })
    exposures.sort(key=lambda row: row["severity_weighted_coverage"], reverse=True)
    return {
        "status": "computed",
        "generated_at": _utc_now(),
        "parcel_asset_id": request.parcel_asset_id,
        "parcel_checksum_sha256": request.parcel_checksum_sha256,
        "analysis_crs": analysis_crs.to_string(),
        "parcel_area_m2": float(parcel_metric.area),
        "hazard_count": len(exposures),
        "severity_weighted_coverage_sum": round(weighted_exposure, 8),
        "exposures": exposures,
        "limitations": [
            "The result is an evidence-led overlay summary, not a prediction of loss, flood depth, or regulatory eligibility.",
            "Hazard source timeliness, resolution, and suitability remain explicit review requirements.",
        ],
    }


class COGReadinessRequest(BaseModel):
    asset: RasterAssetRequest


@router.post("/raster/cog-readiness")
async def inspect_cog_readiness(request: COGReadinessRequest):
    with _read_raster(request.asset.uri) as dataset:
        if dataset.crs is None:
            raise HTTPException(status_code=422, detail="Raster asset does not declare a CRS")
        tiled = bool(dataset.is_tiled)
        block_shapes = [list(shape_) for shape_ in dataset.block_shapes]
        overview_counts = {str(index): len(dataset.overviews(index)) for index in range(1, dataset.count + 1)}
        has_overviews = any(count > 0 for count in overview_counts.values())
        result = {
            "status": "inspected",
            "generated_at": _utc_now(),
            "asset_id": request.asset.asset_id,
            "checksum_sha256": request.asset.checksum_sha256,
            "driver": dataset.driver,
            "crs": dataset.crs.to_string(),
            "dimensions": {"width": dataset.width, "height": dataset.height, "bands": dataset.count},
            "tiled": tiled,
            "block_shapes": block_shapes,
            "overview_counts": overview_counts,
            "has_reduced_resolution_overviews": has_overviews,
            "georeferencing_declared": dataset.crs is not None and dataset.transform is not None,
            "cog_layout_ready": bool(tiled and has_overviews and dataset.crs is not None),
            "http_range_read_verified": False,
            "http_range_read_note": "HTTP range capability is intentionally not claimed from local raster metadata; verify it separately at the governed distribution endpoint.",
        }
        return result


class StacAssetLink(BaseModel):
    href: str = Field(min_length=6, max_length=2048)
    media_type: str = Field(min_length=2, max_length=128)
    roles: List[str] = Field(default_factory=list, max_length=16)
    title: Optional[str] = Field(default=None, max_length=255)


class StacValidationRequest(BaseModel):
    item_id: str = Field(min_length=1, max_length=128)
    collection_key: str = Field(min_length=1, max_length=128)
    geometry: Dict[str, Any]
    bbox: List[float] = Field(min_length=4, max_length=6)
    datetime: Optional[str] = None
    start_datetime: Optional[str] = None
    end_datetime: Optional[str] = None
    properties: Dict[str, Any] = Field(default_factory=dict)
    assets: Dict[str, StacAssetLink] = Field(min_length=1, max_length=64)

    @model_validator(mode="after")
    def check_temporal(self):
        if not self.datetime and not (self.start_datetime and self.end_datetime):
            raise ValueError("STAC validation requires datetime or both start_datetime and end_datetime")
        return self


@router.post("/catalog/stac-validate")
async def validate_stac_item(request: StacValidationRequest):
    geometry = _geojson_geometry(request.geometry, "geometry")
    if len(request.bbox) not in {4, 6}:
        raise HTTPException(status_code=422, detail="STAC bbox must contain 4 or 6 ordinates")
    west, south, east, north = request.bbox[:4]
    if west > east or south > north:
        raise HTTPException(status_code=422, detail="STAC bbox has inverted axis ordering")
    if not (-180 <= west <= 180 and -180 <= east <= 180 and -90 <= south <= 90 and -90 <= north <= 90):
        raise HTTPException(status_code=422, detail="STAC bbox must be expressed in WGS 84 longitude/latitude")
    bounds = geometry.bounds
    geometry_bbox = [bounds[0], bounds[1], bounds[2], bounds[3]]
    tolerance = 1e-7
    bbox_contains_geometry = west - tolerance <= bounds[0] and south - tolerance <= bounds[1] and east + tolerance >= bounds[2] and north + tolerance >= bounds[3]
    if not bbox_contains_geometry:
        raise HTTPException(status_code=422, detail="STAC bbox does not contain the declared geometry")
    return {
        "status": "validated",
        "generated_at": _utc_now(),
        "item": {
            "type": "Feature",
            "stac_version": "1.0.0",
            "id": request.item_id,
            "collection": request.collection_key,
            "geometry": mapping(geometry),
            "bbox": request.bbox,
            "properties": request.properties,
            "assets": {key: value.model_dump(by_alias=True, exclude_none=True) for key, value in request.assets.items()},
        },
        "validation": {
            "geometry_valid": bool(geometry.is_valid),
            "bbox_contains_geometry": bbox_contains_geometry,
            "temporal_representation": "datetime" if request.datetime else "interval",
            "asset_count": len(request.assets),
            "notes": ["The platform persists validated STAC-compatible metadata; publication and access policy remain governed by the application API."],
        },
    }


class ChangeVectorizationRequest(BaseModel):
    before: RasterAssetRequest
    after: RasterAssetRequest
    threshold: float = Field(gt=0)
    min_mapping_unit_m2: float = Field(gt=0)
    seasonal_comparable: bool
    mutual_valid_coverage_pct: float = Field(gt=0, le=100)
    comparison_band: int = Field(default=1, ge=1)


@router.post("/imagery/change-vectorization")
async def vectorize_change_alerts(request: ChangeVectorizationRequest):
    if not request.seasonal_comparable:
        raise HTTPException(status_code=422, detail="Change vectorization requires seasonally comparable imagery")
    if request.before.asset_id == request.after.asset_id:
        raise HTTPException(status_code=422, detail="Before and after imagery assets must be distinct")
    with _read_raster(request.before.uri) as before, _read_raster(request.after.uri) as after:
        if before.crs is None or after.crs is None or before.crs != after.crs:
            raise HTTPException(status_code=422, detail="Change vectorization requires imagery co-registered to the same declared CRS")
        if before.crs.is_geographic:
            raise HTTPException(status_code=422, detail="Change vectorization requires a projected raster CRS for minimum mapping-unit area claims")
        if before.transform != after.transform or before.width != after.width or before.height != after.height:
            raise HTTPException(status_code=422, detail="Change vectorization requires identical transform, width, and height")
        if request.comparison_band > before.count or request.comparison_band > after.count:
            raise HTTPException(status_code=422, detail="comparison_band is not present in both imagery assets")
        before_values = before.read(request.comparison_band, masked=True).astype(np.float64)
        after_values = after.read(request.comparison_band, masked=True).astype(np.float64)
        valid = ~(np.ma.getmaskarray(before_values) | np.ma.getmaskarray(after_values))
        valid_count = int(np.count_nonzero(valid))
        if valid_count == 0:
            raise HTTPException(status_code=422, detail="No mutually valid pixels remain after masking")
        valid_pct = valid_count / valid.size * 100
        if valid_pct < request.mutual_valid_coverage_pct:
            raise HTTPException(status_code=422, detail="Actual mutual valid-pixel coverage is below the declared threshold")
        delta = np.abs(after_values.filled(np.nan) - before_values.filled(np.nan))
        changed = valid & (delta >= request.threshold)
        pixel_area_m2 = abs(before.transform.a * before.transform.e - before.transform.b * before.transform.d)
        features: List[Dict[str, Any]] = []
        for geometry_payload, _value in raster_shapes(changed.astype(np.uint8), mask=changed, transform=before.transform):
            feature_geometry = _geojson_geometry(geometry_payload, "vectorized_change_geometry")
            area_m2 = float(feature_geometry.area)
            if area_m2 < request.min_mapping_unit_m2:
                continue
            features.append({
                "type": "Feature",
                "geometry": mapping(feature_geometry),
                "properties": {
                    "area_m2": area_m2,
                    "threshold": request.threshold,
                    "comparison_band": request.comparison_band,
                    "evidence_status": "provisional",
                },
            })
        return {
            "status": "computed",
            "generated_at": _utc_now(),
            "before_asset_id": request.before.asset_id,
            "after_asset_id": request.after.asset_id,
            "co_registration": {"crs": before.crs.to_string(), "transform": list(before.transform), "passed": True},
            "masking": {"mutual_valid_pixel_count": valid_count, "mutual_valid_coverage_pct": round(valid_pct, 6)},
            "vectorization": {
                "threshold": request.threshold,
                "min_mapping_unit_m2": request.min_mapping_unit_m2,
                "pixel_area_m2": pixel_area_m2,
                "feature_count": len(features),
                "changed_pixel_count": int(np.count_nonzero(changed)),
            },
            "feature_collection": {"type": "FeatureCollection", "features": features},
            "limitations": ["Vectorized changes are provisional evidence and require human review before a parcel alert is treated as operationally actionable."],
        }


class AccessibilityOriginGroup(BaseModel):
    group_id: str = Field(min_length=1, max_length=128)
    origin_node_ids: List[str] = Field(min_length=1, max_length=10_000)
    weight: float = Field(gt=0, default=1)


class AccessibilityEquityRequest(BaseModel):
    nodes: List[NetworkNode] = Field(min_length=2, max_length=100_000)
    edges: List[NetworkEdge] = Field(min_length=1, max_length=500_000)
    origin_groups: List[AccessibilityOriginGroup] = Field(min_length=2, max_length=100)
    destination_node_ids: List[str] = Field(min_length=1, max_length=10_000)
    mode: Literal["drive", "walk", "cycle", "transit"]
    impedance: Literal["travel_time", "distance"]
    declared_router_source: str = Field(min_length=2, max_length=255)


@router.post("/network/accessibility-equity")
async def accessibility_equity(request: AccessibilityEquityRequest):
    nodes = {node.id: node for node in request.nodes}
    declared_origins = [origin for group in request.origin_groups for origin in group.origin_node_ids]
    unknown = set(declared_origins + request.destination_node_ids) - set(nodes)
    if unknown:
        raise HTTPException(status_code=422, detail=f"Origins or destinations are absent from the declared network: {sorted(unknown)}")
    graph = nx.DiGraph()
    graph.add_nodes_from(nodes)
    for edge in request.edges:
        if edge.source not in nodes or edge.target not in nodes:
            raise HTTPException(status_code=422, detail="Every edge must reference declared nodes")
        if request.mode not in edge.modes:
            continue
        value = edge.travel_time_s if request.impedance == "travel_time" else edge.distance_m
        graph.add_edge(edge.source, edge.target, weight=value)
        if edge.bidirectional:
            graph.add_edge(edge.target, edge.source, weight=value)
    if graph.number_of_edges() == 0:
        raise HTTPException(status_code=422, detail="No declared network edges support the requested mode")
    group_results: List[Dict[str, Any]] = []
    weighted_means: List[tuple[float, float]] = []
    for group in request.origin_groups:
        measurements: List[float] = []
        unreachable: List[str] = []
        for origin in group.origin_node_ids:
            lengths = nx.single_source_dijkstra_path_length(graph, origin, weight="weight")
            destinations = [lengths[destination] for destination in request.destination_node_ids if destination in lengths]
            if not destinations:
                unreachable.append(origin)
            else:
                measurements.append(float(min(destinations)))
        reachable_fraction = len(measurements) / len(group.origin_node_ids)
        mean_impedance = float(np.mean(measurements)) if measurements else None
        if mean_impedance is not None:
            weighted_means.append((mean_impedance, group.weight))
        group_results.append({
            "group_id": group.group_id,
            "origin_count": len(group.origin_node_ids),
            "reachable_origin_count": len(measurements),
            "reachable_origin_fraction": reachable_fraction,
            "mean_nearest_destination_impedance": mean_impedance,
            "median_nearest_destination_impedance": float(np.median(measurements)) if measurements else None,
            "unreachable_origin_node_ids": unreachable,
        })
    means = [row[0] for row in weighted_means]
    total_weight = sum(row[1] for row in weighted_means)
    return {
        "status": "computed",
        "generated_at": _utc_now(),
        "declared_router_source": request.declared_router_source,
        "mode": request.mode,
        "impedance": request.impedance,
        "group_results": group_results,
        "equity_summary": {
            "weighted_mean_nearest_destination_impedance": sum(value * weight for value, weight in weighted_means) / total_weight if total_weight else None,
            "between_group_impedance_gap": max(means) - min(means) if len(means) >= 2 else None,
            "groups_with_reachable_origins": len(means),
            "interpretation": "The gap compares declared operational groups only. It does not infer protected or sensitive characteristics.",
        },
    }


class TrackPoint(BaseModel):
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)
    accuracy_m: float = Field(gt=0, le=10_000)
    recorded_at: str = Field(min_length=10, max_length=64)


class FieldGeofenceRequest(BaseModel):
    parcel_geometry: Dict[str, Any]
    parcel_source_crs: str = Field(min_length=3, max_length=64)
    analysis_crs: str = Field(min_length=3, max_length=64)
    parcel_asset_id: str = Field(min_length=6, max_length=128)
    parcel_checksum_sha256: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    track_points: List[TrackPoint] = Field(min_length=1, max_length=100_000)
    geofence_buffer_m: float = Field(gt=0, le=10_000)
    max_accepted_accuracy_m: float = Field(gt=0, le=10_000)


@router.post("/field/geofence-verify")
async def verify_field_geofence(request: FieldGeofenceRequest):
    analysis_crs = _assert_measurement_crs(request.analysis_crs)
    parcel = _geojson_geometry(request.parcel_geometry, "parcel_geometry")
    parcel_metric = _transform_geometry(parcel, request.parcel_source_crs, analysis_crs.to_string())
    buffered = parcel_metric.buffer(request.geofence_buffer_m)
    transformer = Transformer.from_crs(_parse_crs("EPSG:4326", "track_crs"), analysis_crs, always_xy=True)
    accepted = [point for point in request.track_points if point.accuracy_m <= request.max_accepted_accuracy_m]
    inside = 0
    outside_points: List[Dict[str, Any]] = []
    for point in accepted:
        metric_point = transform_geometry(transformer.transform, Point(point.longitude, point.latitude))
        if buffered.covers(metric_point):
            inside += 1
        else:
            outside_points.append({"longitude": point.longitude, "latitude": point.latitude, "accuracy_m": point.accuracy_m, "recorded_at": point.recorded_at})
    return {
        "status": "computed",
        "generated_at": _utc_now(),
        "parcel_asset_id": request.parcel_asset_id,
        "parcel_checksum_sha256": request.parcel_checksum_sha256,
        "analysis_crs": analysis_crs.to_string(),
        "track_quality": {
            "submitted_sample_count": len(request.track_points),
            "accepted_sample_count": len(accepted),
            "rejected_accuracy_sample_count": len(request.track_points) - len(accepted),
            "median_accuracy_m": float(np.median([point.accuracy_m for point in accepted])) if accepted else None,
        },
        "geofence": {
            "buffer_m": request.geofence_buffer_m,
            "accepted_inside_count": inside,
            "accepted_inside_fraction": inside / len(accepted) if accepted else 0.0,
            "outside_points": outside_points,
        },
        "limitations": ["GPS proximity supports field-evidence provenance; it is not a substitute for a legally certified survey."],
    }


class ZonalStatisticsRequest(BaseModel):
    raster: RasterAssetRequest
    zone_geometry: Dict[str, Any]
    zone_source_crs: str = Field(min_length=3, max_length=64)
    zone_asset_id: str = Field(min_length=6, max_length=128)
    zone_checksum_sha256: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    band: int = Field(default=1, ge=1)


@router.post("/raster/zonal-statistics")
async def zonal_statistics(request: ZonalStatisticsRequest):
    zone = _geojson_geometry(request.zone_geometry, "zone_geometry")
    with _read_raster(request.raster.uri) as dataset:
        if dataset.crs is None:
            raise HTTPException(status_code=422, detail="Raster asset does not declare a CRS")
        if request.band > dataset.count:
            raise HTTPException(status_code=422, detail="Requested band is not present in the raster asset")
        transformed_zone = _transform_geometry(zone, request.zone_source_crs, dataset.crs.to_string())
        try:
            data, _transform = raster_mask(dataset, [mapping(transformed_zone)], indexes=request.band, crop=True, filled=False)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Zone does not overlap the declared raster extent") from exc
        values = data.compressed().astype(np.float64)
        if values.size == 0:
            raise HTTPException(status_code=422, detail="Zone contains no valid raster pixels after nodata masking")
        return {
            "status": "computed",
            "generated_at": _utc_now(),
            "raster_asset_id": request.raster.asset_id,
            "raster_checksum_sha256": request.raster.checksum_sha256,
            "zone_asset_id": request.zone_asset_id,
            "zone_checksum_sha256": request.zone_checksum_sha256,
            "raster_crs": dataset.crs.to_string(),
            "band": request.band,
            "pixel_accounting": {
                "valid_pixel_count": int(values.size),
                "zone_bounds_in_raster_crs": list(transformed_zone.bounds),
            },
            "statistics": {
                "min": float(np.min(values)),
                "max": float(np.max(values)),
                "mean": float(np.mean(values)),
                "median": float(np.median(values)),
                "stddev": float(np.std(values)),
                "p05": float(np.percentile(values, 5)),
                "p95": float(np.percentile(values, 95)),
            },
        }


class PrivacyReleaseRequest(BaseModel):
    geometry: Dict[str, Any]
    source_crs: str = Field(min_length=3, max_length=64)
    analysis_crs: str = Field(min_length=3, max_length=64)
    output_crs: str = Field(default="EPSG:4326", min_length=3, max_length=64)
    method: Literal["centroid", "grid_centroid", "minimum_bbox"]
    grid_size_m: Optional[float] = Field(default=None, gt=0, le=100_000)
    source_asset_id: str = Field(min_length=6, max_length=128)
    source_checksum_sha256: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    license: str = Field(min_length=2, max_length=255)
    legal_notice: str = Field(min_length=20, max_length=4000)

    @model_validator(mode="after")
    def check_grid(self):
        if self.method == "grid_centroid" and self.grid_size_m is None:
            raise ValueError("grid_size_m is required for grid_centroid release")
        return self


@router.post("/privacy/release-feature")
async def prepare_privacy_release(request: PrivacyReleaseRequest):
    analysis_crs = _assert_measurement_crs(request.analysis_crs)
    output_crs = _parse_crs(request.output_crs, "output_crs")
    geometry = _geojson_geometry(request.geometry, "geometry")
    metric = _transform_geometry(geometry, request.source_crs, analysis_crs.to_string())
    if request.method == "centroid":
        released_metric = metric.centroid
    elif request.method == "grid_centroid":
        assert request.grid_size_m is not None
        centroid = metric.centroid
        grid_x = math.floor(centroid.x / request.grid_size_m) * request.grid_size_m + request.grid_size_m / 2
        grid_y = math.floor(centroid.y / request.grid_size_m) * request.grid_size_m + request.grid_size_m / 2
        released_metric = Point(grid_x, grid_y)
    else:
        released_metric = box(*metric.bounds)
    released_output = _transform_geometry(released_metric, analysis_crs.to_string(), output_crs.to_string())
    return {
        "status": "prepared_for_human_approval",
        "generated_at": _utc_now(),
        "release_key_hint": _uuid_like_key("release", f"{request.source_asset_id}:{request.method}:{request.source_checksum_sha256}"),
        "source_asset_id": request.source_asset_id,
        "source_checksum_sha256": request.source_checksum_sha256,
        "privacy_method": request.method,
        "privacy_parameters": {"grid_size_m": request.grid_size_m} if request.method == "grid_centroid" else {},
        "license": request.license,
        "legal_notice": request.legal_notice,
        "feature": {
            "type": "Feature",
            "geometry": mapping(released_output),
            "properties": {
                "evidence_status": "provisional",
                "privacy_method": request.method,
                "not_for_legal_or_regulatory_boundary_use": True,
            },
        },
        "limitations": ["The released geometry is intentionally generalized and must not be used as a title, boundary, survey, or regulatory source of truth."],
    }
