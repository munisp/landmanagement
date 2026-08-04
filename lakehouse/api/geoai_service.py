"""GeoAI processing primitives exposed through the authenticated Lakehouse API.

The service intentionally accepts only supplied, provenance-bearing assets and
network graphs. It does not fabricate geometry, imagery, LiDAR statistics, or
model results when required evidence is unavailable.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import PurePosixPath
from typing import Any, Dict, List, Literal, Optional
import json
import math
import os
import subprocess

import networkx as nx
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from pyproj import CRS, Transformer
from shapely.geometry import shape
from shapely.ops import transform as transform_geometry
from shapely.validation import make_valid

router = APIRouter(prefix="/geoai", tags=["GeoAI"])

_ALLOWED_SCHEMES = {"https", "s3", "gs", "ipfs"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _required_allowed_prefixes() -> List[str]:
    raw = os.getenv("GEOAI_ALLOWED_ASSET_URI_PREFIXES", "").strip()
    prefixes = [item.strip() for item in raw.split(",") if item.strip()]
    if not prefixes:
        raise HTTPException(
            status_code=503,
            detail="GEOAI_ALLOWED_ASSET_URI_PREFIXES must be configured before processing external GeoAI assets",
        )
    return prefixes


def _assert_asset_uri(uri: str) -> None:
    scheme = uri.split("://", 1)[0].lower() if "://" in uri else ""
    if scheme not in _ALLOWED_SCHEMES:
        raise HTTPException(status_code=422, detail="GeoAI asset URI must use HTTPS, S3, GCS, or IPFS")
    if not any(uri.startswith(prefix) for prefix in _required_allowed_prefixes()):
        raise HTTPException(status_code=403, detail="GeoAI asset URI is outside the configured trusted asset prefixes")


def _parse_crs(value: str, field_name: str) -> CRS:
    try:
        return CRS.from_user_input(value)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"{field_name} is not a valid CRS: {exc}") from exc


def _assert_measurement_crs(value: str) -> CRS:
    crs = _parse_crs(value, "analysis_crs")
    normalized = value.strip().upper()
    if crs.is_geographic or normalized in {"EPSG:3857", "EPSG:4326", "CRS:84"}:
        raise HTTPException(
            status_code=422,
            detail="analysis_crs must be an appropriate projected or equal-area CRS; geographic CRS and Web Mercator cannot support measured area or distance claims",
        )
    return crs


def _read_raster(uri: str):
    _assert_asset_uri(uri)
    try:
        import rasterio
        return rasterio.open(uri)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Unable to open declared raster asset: {exc}") from exc


class SpatialValidationRequest(BaseModel):
    geometry: Dict[str, Any]
    source_crs: str = Field(min_length=3, max_length=64)
    analysis_crs: str = Field(min_length=3, max_length=64)
    operation: Literal["area", "distance", "overlay"]
    reference_geometries: List[Dict[str, Any]] = Field(default_factory=list)
    legal_or_regulatory_use: bool = False
    source_asset_id: str = Field(min_length=6, max_length=128)
    source_checksum_sha256: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    is_proxy_geometry: bool = False


@router.post("/spatial/validate")
async def validate_spatial_geometry(request: SpatialValidationRequest):
    if request.legal_or_regulatory_use and request.is_proxy_geometry:
        raise HTTPException(status_code=422, detail="Proxy geometry cannot be used for legal or regulatory spatial claims")

    source_crs = _parse_crs(request.source_crs, "source_crs")
    analysis_crs = _assert_measurement_crs(request.analysis_crs)
    try:
        original = shape(request.geometry)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"geometry is invalid GeoJSON: {exc}") from exc
    if original.is_empty:
        raise HTTPException(status_code=422, detail="geometry cannot be empty")

    repaired = make_valid(original) if not original.is_valid else original
    transformer = Transformer.from_crs(source_crs, analysis_crs, always_xy=True)
    metric_geometry = transform_geometry(transformer.transform, repaired)
    if metric_geometry.is_empty:
        raise HTTPException(status_code=422, detail="Geometry became empty after CRS transformation")

    metric_area_m2 = float(metric_geometry.area) if metric_geometry.geom_type in {"Polygon", "MultiPolygon"} else None
    metric_length_m = float(metric_geometry.length)
    overlays: List[Dict[str, Any]] = []
    for index, reference_payload in enumerate(request.reference_geometries):
        try:
            reference = shape(reference_payload)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"reference_geometries[{index}] is invalid GeoJSON: {exc}") from exc
        reference_metric = transform_geometry(transformer.transform, make_valid(reference) if not reference.is_valid else reference)
        intersection = metric_geometry.intersection(reference_metric)
        overlays.append({
            "reference_index": index,
            "intersects": not intersection.is_empty,
            "intersection_area_m2": float(intersection.area) if not intersection.is_empty else 0.0,
            "intersection_length_m": float(intersection.length) if not intersection.is_empty else 0.0,
        })

    return {
        "status": "validated",
        "generated_at": _utc_now(),
        "source_asset_id": request.source_asset_id,
        "source_checksum_sha256": request.source_checksum_sha256,
        "source_crs": source_crs.to_string(),
        "analysis_crs": analysis_crs.to_string(),
        "geometry": {
            "original_valid": bool(original.is_valid),
            "repair_applied": bool(not original.is_valid),
            "geometry_type": repaired.geom_type,
            "bounds_source_crs": list(repaired.bounds),
            "metric_area_m2": metric_area_m2,
            "metric_length_m": metric_length_m,
        },
        "overlay_row_accounting": {
            "input_geometry_count": 1,
            "reference_geometry_count": len(request.reference_geometries),
            "result_row_count": len(overlays),
            "overlays": overlays,
        },
    }


class NetworkNode(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)


class NetworkEdge(BaseModel):
    source: str = Field(min_length=1, max_length=128)
    target: str = Field(min_length=1, max_length=128)
    travel_time_s: float = Field(gt=0)
    distance_m: float = Field(gt=0)
    modes: List[Literal["drive", "walk", "cycle", "transit"]] = Field(min_length=1)
    bidirectional: bool = True


class NetworkAccessibilityRequest(BaseModel):
    nodes: List[NetworkNode] = Field(min_length=2, max_length=100_000)
    edges: List[NetworkEdge] = Field(min_length=1, max_length=500_000)
    origin_node_ids: List[str] = Field(min_length=1, max_length=10_000)
    destination_node_ids: List[str] = Field(min_length=1, max_length=10_000)
    mode: Literal["drive", "walk", "cycle", "transit"]
    impedance: Literal["travel_time", "distance"]
    max_snap_distance_m: float = Field(gt=0, le=5000)
    declared_router_source: str = Field(min_length=2, max_length=255)

    @model_validator(mode="after")
    def ensure_unique_nodes(self):
        ids = [node.id for node in self.nodes]
        if len(ids) != len(set(ids)):
            raise ValueError("Network node IDs must be unique")
        return self


@router.post("/network/accessibility")
async def network_accessibility(request: NetworkAccessibilityRequest):
    nodes = {node.id: node for node in request.nodes}
    unknown = set(request.origin_node_ids + request.destination_node_ids) - set(nodes)
    if unknown:
        raise HTTPException(status_code=422, detail=f"Origin or destination nodes are missing from the declared network: {sorted(unknown)}")

    graph = nx.DiGraph()
    graph.add_nodes_from(nodes)
    for edge in request.edges:
        if edge.source not in nodes or edge.target not in nodes:
            raise HTTPException(status_code=422, detail="Every network edge must reference declared nodes")
        if request.mode not in edge.modes:
            continue
        weight = edge.travel_time_s if request.impedance == "travel_time" else edge.distance_m
        graph.add_edge(edge.source, edge.target, weight=weight, travel_time_s=edge.travel_time_s, distance_m=edge.distance_m)
        if edge.bidirectional:
            graph.add_edge(edge.target, edge.source, weight=weight, travel_time_s=edge.travel_time_s, distance_m=edge.distance_m)

    if graph.number_of_edges() == 0:
        raise HTTPException(status_code=422, detail="No declared network edges support the requested mode")

    origins: List[Dict[str, Any]] = []
    unreachable_pairs = 0
    total_pairs = len(request.origin_node_ids) * len(request.destination_node_ids)
    for origin in request.origin_node_ids:
        paths = nx.single_source_dijkstra_path_length(graph, origin, weight="weight")
        reachable = []
        unreachable = []
        for destination in request.destination_node_ids:
            value = paths.get(destination)
            if value is None:
                unreachable.append(destination)
                unreachable_pairs += 1
            else:
                reachable.append({"destination_node_id": destination, "impedance": float(value)})
        origins.append({
            "origin_node_id": origin,
            "reachable_destinations": sorted(reachable, key=lambda item: item["impedance"]),
            "unreachable_destination_node_ids": unreachable,
        })

    return {
        "status": "computed",
        "generated_at": _utc_now(),
        "declared_router_source": request.declared_router_source,
        "mode": request.mode,
        "impedance": request.impedance,
        "network": {"node_count": graph.number_of_nodes(), "edge_count": graph.number_of_edges()},
        "snap_policy": {"max_snap_distance_m": request.max_snap_distance_m, "snap_distribution_available": False, "reason": "This endpoint receives already-snapped network node identifiers; clients must attach an external snap-distance artifact for evidence review."},
        "pair_accounting": {"total_pairs": total_pairs, "unreachable_pairs": unreachable_pairs, "reachable_pairs": total_pairs - unreachable_pairs},
        "origins": origins,
    }


class RasterAssetRequest(BaseModel):
    uri: str = Field(min_length=8, max_length=2048)
    asset_id: str = Field(min_length=6, max_length=128)
    checksum_sha256: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    declared_source_crs: str = Field(min_length=3, max_length=64)


class ChangeDetectionRequest(BaseModel):
    before: RasterAssetRequest
    after: RasterAssetRequest
    threshold: float = Field(gt=0)
    seasonal_comparable: bool
    mutual_valid_coverage_pct: float = Field(gt=0, le=100)
    comparison_band: int = Field(default=1, ge=1)


@router.post("/imagery/inspect")
async def inspect_imagery_asset(request: RasterAssetRequest):
    _parse_crs(request.declared_source_crs, "declared_source_crs")
    with _read_raster(request.uri) as dataset:
        if dataset.crs is None:
            raise HTTPException(status_code=422, detail="Raster asset does not declare a CRS")
        if dataset.count < 1:
            raise HTTPException(status_code=422, detail="Raster asset contains no bands")
        mask = dataset.dataset_mask()
        valid_pixels = int(np.count_nonzero(mask))
        total_pixels = int(mask.size)
        return {
            "status": "inspected",
            "generated_at": _utc_now(),
            "asset_id": request.asset_id,
            "checksum_sha256": request.checksum_sha256,
            "dataset": {
                "driver": dataset.driver,
                "width": dataset.width,
                "height": dataset.height,
                "band_count": dataset.count,
                "crs": dataset.crs.to_string(),
                "transform": list(dataset.transform),
                "bounds": list(dataset.bounds),
                "nodata": dataset.nodata,
                "dtypes": list(dataset.dtypes),
                "valid_pixel_count": valid_pixels,
                "total_pixel_count": total_pixels,
                "valid_pixel_coverage_pct": round(valid_pixels / total_pixels * 100, 4) if total_pixels else 0.0,
            },
        }


@router.post("/imagery/change-detection")
async def perform_change_detection(request: ChangeDetectionRequest):
    if not request.seasonal_comparable:
        raise HTTPException(status_code=422, detail="Change detection requires seasonally comparable imagery or a separately approved time-series method")
    if request.before.asset_id == request.after.asset_id:
        raise HTTPException(status_code=422, detail="Before and after imagery assets must be distinct")

    with _read_raster(request.before.uri) as before, _read_raster(request.after.uri) as after:
        if before.crs is None or after.crs is None:
            raise HTTPException(status_code=422, detail="Both imagery assets must declare CRS metadata")
        if before.crs != after.crs or before.transform != after.transform or before.width != after.width or before.height != after.height:
            raise HTTPException(status_code=422, detail="Imagery assets must be co-registered to the same CRS, transform, width, and height before direct change detection")
        if request.comparison_band > before.count or request.comparison_band > after.count:
            raise HTTPException(status_code=422, detail="comparison_band is not present in both imagery assets")

        before_values = before.read(request.comparison_band, masked=True).astype(np.float64)
        after_values = after.read(request.comparison_band, masked=True).astype(np.float64)
        valid = ~(np.ma.getmaskarray(before_values) | np.ma.getmaskarray(after_values))
        valid_count = int(np.count_nonzero(valid))
        if valid_count == 0:
            raise HTTPException(status_code=422, detail="No mutually valid pixels remain after nodata and mask handling")
        actual_coverage = valid_count / valid.size * 100
        if actual_coverage < request.mutual_valid_coverage_pct:
            raise HTTPException(status_code=422, detail=f"Actual mutual valid-pixel coverage {actual_coverage:.3f}% is below declared requirement {request.mutual_valid_coverage_pct:.3f}%")
        delta = np.abs(after_values.filled(np.nan) - before_values.filled(np.nan))
        changed = valid & (delta >= request.threshold)
        changed_count = int(np.count_nonzero(changed))

        pixel_area = abs(before.transform.a * before.transform.e - before.transform.b * before.transform.d)
        if before.crs.is_geographic:
            pixel_area_units = "degree_squared"
        else:
            pixel_area_units = "crs_unit_squared"
        return {
            "status": "computed",
            "generated_at": _utc_now(),
            "before_asset_id": request.before.asset_id,
            "after_asset_id": request.after.asset_id,
            "co_registration": {"crs": before.crs.to_string(), "transform": list(before.transform), "width": before.width, "height": before.height, "passed": True},
            "masking": {"mutual_valid_pixel_count": valid_count, "total_pixel_count": int(valid.size), "mutual_valid_coverage_pct": round(actual_coverage, 4)},
            "change": {"comparison_band": request.comparison_band, "threshold": request.threshold, "changed_pixel_count": changed_count, "changed_pixel_pct_of_valid": round(changed_count / valid_count * 100, 4), "pixel_area": pixel_area, "pixel_area_units": pixel_area_units},
        }


class LidarInspectionRequest(BaseModel):
    asset: RasterAssetRequest
    declared_vertical_crs: str = Field(min_length=3, max_length=128)
    requested_output_resolution_m: float = Field(gt=0, le=100)


@router.post("/lidar/inspect")
async def inspect_lidar_asset(request: LidarInspectionRequest):
    _assert_asset_uri(request.asset.uri)
    binary = os.getenv("GEOAI_PDAL_BINARY", "").strip()
    if not binary:
        raise HTTPException(status_code=503, detail="GEOAI_PDAL_BINARY must be configured for LiDAR inspection")
    command = [binary, "info", "--summary", "--metadata", request.asset.uri]
    try:
        completed = subprocess.run(command, check=True, capture_output=True, text=True, timeout=300)
        payload = json.loads(completed.stdout)
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="PDAL inspection timed out") from exc
    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=422, detail=f"PDAL inspection failed: {exc.stderr[-1000:]}") from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="PDAL inspection returned invalid JSON") from exc

    summary = payload.get("summary") or {}
    bounds = summary.get("bounds") or {}
    point_count = int(summary.get("num_points") or 0)
    if point_count <= 0:
        raise HTTPException(status_code=422, detail="LiDAR inspection found no points")
    minx, maxx = float(bounds.get("minx")), float(bounds.get("maxx"))
    miny, maxy = float(bounds.get("miny")), float(bounds.get("maxy"))
    area = max(0.0, (maxx - minx) * (maxy - miny))
    if area <= 0:
        raise HTTPException(status_code=422, detail="LiDAR bounds do not define a positive horizontal area")
    density = point_count / area
    resolution_supported = density >= 1 / (request.requested_output_resolution_m ** 2)

    return {
        "status": "inspected",
        "generated_at": _utc_now(),
        "asset_id": request.asset.asset_id,
        "checksum_sha256": request.asset.checksum_sha256,
        "vertical_crs": request.declared_vertical_crs,
        "point_count": point_count,
        "bounds": bounds,
        "horizontal_area_crs_units_squared": area,
        "point_density_pts_per_crs_unit_squared": density,
        "requested_output_resolution_m": request.requested_output_resolution_m,
        "density_supports_requested_resolution": resolution_supported,
        "pdal_metadata": payload.get("metadata") or {},
    }


class ModelEvidenceValidationRequest(BaseModel):
    model_name: str = Field(min_length=2, max_length=128)
    model_version: str = Field(min_length=2, max_length=128)
    split_strategy: Literal["spatial_block", "geographic_holdout", "grouped_parcel", "time_series"]
    training_manifest: Dict[str, Any]
    split_manifest: Dict[str, Any]
    baseline_metrics: Dict[str, Any]
    evaluation_metrics: Dict[str, Any]
    uncertainty_metrics: Dict[str, Any]


@router.post("/models/validate-evidence")
async def validate_model_evidence(request: ModelEvidenceValidationRequest):
    errors: List[str] = []
    if not request.training_manifest.get("source_asset_ids"):
        errors.append("training_manifest.source_asset_ids is required")
    if not request.training_manifest.get("label_provenance"):
        errors.append("training_manifest.label_provenance is required")
    if request.split_strategy in {"spatial_block", "geographic_holdout", "grouped_parcel"} and not request.split_manifest.get("holdout_unit_count"):
        errors.append("split_manifest.holdout_unit_count is required for a spatially independent split")
    if not request.baseline_metrics:
        errors.append("baseline_metrics are required")
    if not request.evaluation_metrics:
        errors.append("evaluation_metrics are required")
    if not request.uncertainty_metrics:
        errors.append("uncertainty_metrics are required")
    if errors:
        raise HTTPException(status_code=422, detail={"message": "Model evidence is incomplete", "errors": errors})
    return {
        "status": "evidence_ready_for_human_review",
        "generated_at": _utc_now(),
        "model_name": request.model_name,
        "model_version": request.model_version,
        "split_strategy": request.split_strategy,
        "evidence_status": "provisional",
        "human_review_required": True,
    }
