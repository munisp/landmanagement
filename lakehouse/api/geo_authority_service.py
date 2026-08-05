"""Authoritative, provenance-gated spatial operations for the delivery gateway.

The API accepts only a short-lived capability issued by the TypeScript policy
boundary. It independently validates the capability and parcel scope before
running a declared-network route, a DEM-based line-of-sight viewshed, or a
local 3D Tiles preparation operation. Results are evidence products, not title,
legal-boundary, regulatory, or engineering certifications.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import math
import os
import shutil
import struct
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Literal, Optional, Sequence, Tuple

import networkx as nx
import numpy as np
import psycopg2
import rasterio
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from pyproj import CRS, Transformer
from rasterio.features import shapes as raster_shapes
from rasterio.windows import Window, from_bounds, transform as window_transform
from shapely.geometry import Point, Polygon, mapping, shape
from shapely.ops import transform as transform_geometry
from shapely.validation import make_valid

from api.geoai_service import (
    NetworkEdge,
    NetworkNode,
    RasterAssetRequest,
    _assert_measurement_crs,
    _assert_asset_uri,
    _parse_crs,
    _read_raster,
    _utc_now,
)

router = APIRouter(prefix="/geo-authority", tags=["Authoritative Geospatial Operations"])

_CAPABILITY_ISSUER = "idlr-geospatial-platform"
_CAPABILITY_VERSION = 1
_CAPABILITY_AUDIENCE = "geo_analysis"
_MAX_CAPABILITY_TTL_SECONDS = 600
_MAX_VIEWSHED_CELLS = 100_000
_MAX_VIEWSHED_RAY_SAMPLES = 2_000_000
_MAX_BUILDINGS = 5_000
_SAFE_KEY = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.:-"


class AuthorityCapability(BaseModel):
    iss: Literal["idlr-geospatial-platform"]
    ver: Literal[1]
    aud: Literal["geo_analysis"]
    sub: str = Field(pattern=r"^\d+$")
    jti: str = Field(pattern=r"^[0-9a-fA-F-]{36}$")
    iat: int
    exp: int
    parcels: List[int] = Field(min_length=1, max_length=512)
    purpose: str = Field(pattern=r"^[a-z][a-z0-9_.:-]{2,127}$")

    @model_validator(mode="after")
    def validate_time_and_scope(self):
        now = int(datetime.now(timezone.utc).timestamp())
        if self.iat > now + 60 or self.exp <= now or self.exp - self.iat > _MAX_CAPABILITY_TTL_SECONDS:
            raise ValueError("Capability time window is invalid")
        if any(parcel_id <= 0 for parcel_id in self.parcels):
            raise ValueError("Capability parcel IDs must be positive")
        if self.parcels != sorted(set(self.parcels)):
            raise ValueError("Capability parcel IDs must be unique and ascending")
        return self


def _capability_secret() -> bytes:
    secret = os.getenv("GEO_DELIVERY_CAPABILITY_SECRET", "").strip()
    if len(secret) < 32:
        raise HTTPException(status_code=503, detail="GEO_DELIVERY_CAPABILITY_SECRET is not configured for geospatial authority")
    return secret.encode("utf-8")


def _decode_base64url(value: str) -> bytes:
    if not value or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for character in value):
        raise ValueError("Invalid base64url component")
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def verify_authority_capability(authorization: Optional[str]) -> AuthorityCapability:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="A geospatial analysis capability is required")
    token = authorization.removeprefix("Bearer ").strip()
    parts = token.split(".")
    if len(parts) != 2:
        raise HTTPException(status_code=401, detail="Geospatial analysis capability is malformed")
    encoded_payload, encoded_signature = parts
    try:
        provided_signature = _decode_base64url(encoded_signature)
        expected_signature = hmac.new(_capability_secret(), encoded_payload.encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(provided_signature, expected_signature):
            raise ValueError("signature mismatch")
        payload = json.loads(_decode_base64url(encoded_payload).decode("utf-8"))
        capability = AuthorityCapability.model_validate(payload)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Geospatial analysis capability is invalid") from exc
    if capability.iss != _CAPABILITY_ISSUER or capability.ver != _CAPABILITY_VERSION or capability.aud != _CAPABILITY_AUDIENCE:
        raise HTTPException(status_code=401, detail="Geospatial analysis capability audience is invalid")
    return capability


def _require_parcel_scope(capability: AuthorityCapability, parcel_id: int) -> None:
    if parcel_id not in capability.parcels:
        raise HTTPException(status_code=403, detail="The capability does not authorize the requested parcel")


def _safe_key(value: str, field_name: str) -> str:
    normalized = value.strip()
    if not (2 <= len(normalized) <= 128 and normalized[0].isalnum() and all(character in _SAFE_KEY for character in normalized)):
        raise HTTPException(status_code=422, detail=f"{field_name} must be a stable safe asset key")
    return normalized


def _safe_relative_path(value: str, field_name: str) -> str:
    normalized = value.strip()
    if not normalized or len(normalized) > 1024 or normalized.startswith("/") or "\\" in normalized or "\x00" in normalized:
        raise HTTPException(status_code=422, detail=f"{field_name} must be a safe relative POSIX path")
    parts = normalized.split("/")
    if any(not part or part in {".", ".."} or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-" for character in part) for part in parts):
        raise HTTPException(status_code=422, detail=f"{field_name} contains an unsafe path segment")
    return "/".join(parts)


class RouteProvenance(BaseModel):
    network_asset_id: str = Field(min_length=6, max_length=128)
    network_checksum_sha256: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    declared_router_source: str = Field(min_length=2, max_length=255)
    network_observed_at: Optional[datetime] = None
    network_evidence_status: Literal["verified", "provisional", "insufficient_evidence"]


class RouteRequest(BaseModel):
    parcel_id: int = Field(gt=0)
    nodes: List[NetworkNode] = Field(min_length=2, max_length=100_000)
    edges: List[NetworkEdge] = Field(min_length=1, max_length=500_000)
    origin_node_id: str = Field(min_length=1, max_length=128)
    destination_node_id: str = Field(min_length=1, max_length=128)
    mode: Literal["drive", "walk", "cycle", "transit"]
    impedance: Literal["travel_time", "distance"]
    provenance: RouteProvenance

    @model_validator(mode="after")
    def validate_unique_nodes(self):
        identifiers = [node.id for node in self.nodes]
        if len(identifiers) != len(set(identifiers)):
            raise ValueError("Network node identifiers must be unique")
        return self


def calculate_authoritative_route(request: RouteRequest, capability: AuthorityCapability) -> Dict[str, Any]:
    _require_parcel_scope(capability, request.parcel_id)
    nodes = {node.id: node for node in request.nodes}
    if request.origin_node_id not in nodes or request.destination_node_id not in nodes:
        raise HTTPException(status_code=422, detail="Route origin and destination must be present in the declared network")
    graph = nx.DiGraph()
    graph.add_nodes_from(nodes)
    edge_lookup: Dict[Tuple[str, str], NetworkEdge] = {}
    for edge in request.edges:
        if edge.source not in nodes or edge.target not in nodes:
            raise HTTPException(status_code=422, detail="Each route edge must reference declared network nodes")
        if request.mode not in edge.modes:
            continue
        weight = edge.travel_time_s if request.impedance == "travel_time" else edge.distance_m
        prior = graph.get_edge_data(edge.source, edge.target)
        if prior is None or weight < prior["weight"]:
            graph.add_edge(edge.source, edge.target, weight=weight, travel_time_s=edge.travel_time_s, distance_m=edge.distance_m)
            edge_lookup[(edge.source, edge.target)] = edge
        if edge.bidirectional:
            prior_reverse = graph.get_edge_data(edge.target, edge.source)
            if prior_reverse is None or weight < prior_reverse["weight"]:
                graph.add_edge(edge.target, edge.source, weight=weight, travel_time_s=edge.travel_time_s, distance_m=edge.distance_m)
                edge_lookup[(edge.target, edge.source)] = edge
    if graph.number_of_edges() == 0:
        raise HTTPException(status_code=422, detail="No declared network edges support the requested route mode")
    try:
        node_path = nx.shortest_path(graph, request.origin_node_id, request.destination_node_id, weight="weight")
    except nx.NetworkXNoPath as exc:
        raise HTTPException(status_code=422, detail="No route exists in the declared network between the selected nodes") from exc
    edge_path = [(node_path[index], node_path[index + 1]) for index in range(len(node_path) - 1)]
    travel_time_s = sum(float(graph[source][target]["travel_time_s"]) for source, target in edge_path)
    distance_m = sum(float(graph[source][target]["distance_m"]) for source, target in edge_path)
    return {
        "status": "computed",
        "evidence_status": "provisional",
        "generated_at": _utc_now(),
        "parcel_id": request.parcel_id,
        "route": {
            "mode": request.mode,
            "impedance": request.impedance,
            "node_path": node_path,
            "edge_count": len(edge_path),
            "travel_time_s": round(travel_time_s, 6),
            "distance_m": round(distance_m, 6),
            "geometry": {
                "type": "LineString",
                "coordinates": [[nodes[node_id].longitude, nodes[node_id].latitude] for node_id in node_path],
            },
        },
        "provenance": request.provenance.model_dump(mode="json"),
        "limitations": [
            "The route is computed only from the declared, signed-scope network graph; it does not imply live traffic, road legality, emergency access, or regulatory approval.",
            "The output remains provisional evidence until the network source, acquisition time, and operational suitability are reviewed.",
        ],
    }


@router.post("/network/route")
async def authoritative_route(request: RouteRequest, authorization: Optional[str] = Header(default=None)):
    return calculate_authoritative_route(request, verify_authority_capability(authorization))


class ObserverRequest(BaseModel):
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)
    height_above_ground_m: float = Field(ge=0, le=1_000)


class ViewshedRequest(BaseModel):
    parcel_id: int = Field(gt=0)
    dem: RasterAssetRequest
    observer: ObserverRequest
    analysis_crs: str = Field(min_length=3, max_length=64)
    maximum_distance_m: float = Field(gt=1, le=100_000)
    sampling_resolution_m: float = Field(gt=0.1, le=5_000)
    earth_curvature: bool = True
    atmospheric_refraction_coefficient: float = Field(default=0.13, ge=0, le=0.25)
    min_visible_component_m2: float = Field(default=0, ge=0)


def _observer_grid_index(dataset: rasterio.io.DatasetReader, observer_x: float, observer_y: float) -> Tuple[int, int]:
    row, column = dataset.index(observer_x, observer_y)
    if row < 0 or row >= dataset.height or column < 0 or column >= dataset.width:
        raise HTTPException(status_code=422, detail="Observer is outside the declared DEM extent")
    return int(row), int(column)


def _source_to_metric(observer: ObserverRequest, analysis_crs: CRS) -> Tuple[float, float]:
    transformer = Transformer.from_crs(CRS.from_epsg(4326), analysis_crs, always_xy=True)
    return transformer.transform(observer.longitude, observer.latitude)


def _line_of_sight(
    elevations: np.ma.MaskedArray,
    observer_rc: Tuple[int, int],
    target_rc: Tuple[int, int],
    observer_height_m: float,
    target_height_m: float,
    pixel_size_m: float,
    earth_curvature: bool,
    refraction: float,
) -> Tuple[bool, int]:
    observer_row, observer_column = observer_rc
    target_row, target_column = target_rc
    delta_row = target_row - observer_row
    delta_column = target_column - observer_column
    steps = max(abs(delta_row), abs(delta_column))
    if steps == 0:
        return True, 0
    observer_ground = elevations[observer_row, observer_column]
    target_ground = elevations[target_row, target_column]
    if np.ma.is_masked(observer_ground) or np.ma.is_masked(target_ground):
        return False, 0
    observer_elevation = float(observer_ground) + observer_height_m
    target_elevation = float(target_ground) + target_height_m
    distance_m = math.hypot(delta_row, delta_column) * pixel_size_m
    checked = 0
    earth_radius_m = 6_371_000.0
    for step in range(1, steps):
        fraction = step / steps
        row = int(round(observer_row + delta_row * fraction))
        column = int(round(observer_column + delta_column * fraction))
        terrain = elevations[row, column]
        checked += 1
        if np.ma.is_masked(terrain):
            return False, checked
        point_distance_m = distance_m * fraction
        curvature_drop = 0.0
        if earth_curvature:
            curvature_drop = (point_distance_m * (distance_m - point_distance_m)) / (2 * earth_radius_m) * (1 - refraction)
        line_elevation = observer_elevation + (target_elevation - observer_elevation) * fraction - curvature_drop
        if float(terrain) > line_elevation:
            return False, checked
    return True, checked


def calculate_viewshed(
    request: ViewshedRequest,
    capability: AuthorityCapability,
    dataset: rasterio.io.DatasetReader,
) -> Dict[str, Any]:
    _require_parcel_scope(capability, request.parcel_id)
    analysis_crs = _assert_measurement_crs(request.analysis_crs)
    if dataset.crs is None:
        raise HTTPException(status_code=422, detail="DEM does not declare a CRS")
    if CRS.from_user_input(dataset.crs) != analysis_crs:
        raise HTTPException(status_code=422, detail="DEM CRS must exactly match the declared projected analysis CRS")
    observer_x, observer_y = _source_to_metric(request.observer, analysis_crs)
    observer_row, observer_column = _observer_grid_index(dataset, observer_x, observer_y)
    horizontal_pixel_m = max(abs(float(dataset.transform.a)), abs(float(dataset.transform.e)))
    if horizontal_pixel_m <= 0:
        raise HTTPException(status_code=422, detail="DEM affine transform does not expose a positive pixel resolution")
    radius_pixels = int(math.ceil(request.maximum_distance_m / horizontal_pixel_m))
    window = Window(
        max(0, observer_column - radius_pixels),
        max(0, observer_row - radius_pixels),
        min(dataset.width, observer_column + radius_pixels + 1) - max(0, observer_column - radius_pixels),
        min(dataset.height, observer_row + radius_pixels + 1) - max(0, observer_row - radius_pixels),
    )
    if window.width < 1 or window.height < 1:
        raise HTTPException(status_code=422, detail="Requested viewshed window is empty")
    stride = max(1, int(math.ceil(request.sampling_resolution_m / horizontal_pixel_m)))
    candidate_rows = math.ceil(window.height / stride)
    candidate_columns = math.ceil(window.width / stride)
    estimated_cells = candidate_rows * candidate_columns
    max_steps = max(1, int(math.ceil(request.maximum_distance_m / horizontal_pixel_m)))
    if estimated_cells > _MAX_VIEWSHED_CELLS or estimated_cells * max_steps > _MAX_VIEWSHED_RAY_SAMPLES:
        raise HTTPException(status_code=422, detail="Requested viewshed exceeds the governed cell/ray-sample budget; increase sampling_resolution_m or reduce maximum_distance_m")
    elevations = dataset.read(1, window=window, masked=True)
    local_observer = (observer_row - int(window.row_off), observer_column - int(window.col_off))
    visible = np.zeros(elevations.shape, dtype=bool)
    checked_samples = 0
    considered_cells = 0
    visible_cells = 0
    for row in range(0, elevations.shape[0], stride):
        for column in range(0, elevations.shape[1], stride):
            distance_m = math.hypot(row - local_observer[0], column - local_observer[1]) * horizontal_pixel_m
            if distance_m > request.maximum_distance_m or np.ma.is_masked(elevations[row, column]):
                continue
            considered_cells += 1
            is_visible, ray_samples = _line_of_sight(
                elevations,
                local_observer,
                (row, column),
                request.observer.height_above_ground_m,
                0.0,
                horizontal_pixel_m,
                request.earth_curvature,
                request.atmospheric_refraction_coefficient,
            )
            checked_samples += ray_samples
            if is_visible:
                visible[row, column] = True
                visible_cells += 1
    local_transform = window_transform(window, dataset.transform)
    feature_collection: List[Dict[str, Any]] = []
    for geometry, _ in raster_shapes(visible.astype(np.uint8), mask=visible, transform=local_transform):
        geometry_shape = make_valid(shape(geometry))
        if geometry_shape.area < request.min_visible_component_m2:
            continue
        feature_collection.append({
            "type": "Feature",
            "geometry": mapping(geometry_shape),
            "properties": {"visible": True, "area_m2": float(geometry_shape.area)},
        })
    return {
        "status": "computed",
        "evidence_status": "provisional",
        "generated_at": _utc_now(),
        "parcel_id": request.parcel_id,
        "analysis_crs": analysis_crs.to_string(),
        "dem": {
            "asset_id": request.dem.asset_id,
            "checksum_sha256": request.dem.checksum_sha256,
            "crs": dataset.crs.to_string(),
            "pixel_resolution_m": horizontal_pixel_m,
        },
        "method": {
            "algorithm": "raster-grid line-of-sight with terrain occlusion",
            "maximum_distance_m": request.maximum_distance_m,
            "sampling_resolution_m": stride * horizontal_pixel_m,
            "earth_curvature": request.earth_curvature,
            "atmospheric_refraction_coefficient": request.atmospheric_refraction_coefficient if request.earth_curvature else None,
            "considered_cells": considered_cells,
            "visible_cells": visible_cells,
            "ray_samples_checked": checked_samples,
        },
        "visibility": {"type": "FeatureCollection", "features": feature_collection},
        "limitations": [
            "Visibility is evaluated from the declared DEM at the stated sampling resolution; buildings, vegetation, atmospheric conditions, and sensor error are not inferred unless represented in the DEM.",
            "The output is provisional analytical evidence and is not an aviation, surveillance, safety, legal, or engineering certification.",
        ],
    }


@router.post("/viewshed")
async def authoritative_viewshed(request: ViewshedRequest, authorization: Optional[str] = Header(default=None)):
    capability = verify_authority_capability(authorization)
    _assert_asset_uri(request.dem.uri)
    with _read_raster(request.dem.uri) as dataset:
        return calculate_viewshed(request, capability, dataset)


class BuildingFootprint(BaseModel):
    building_id: str = Field(min_length=1, max_length=128)
    geometry: Dict[str, Any]
    height_m: float = Field(gt=0, le=10_000)
    base_height_m: float = Field(default=0, ge=-5_000, le=10_000)

    @field_validator("building_id")
    @classmethod
    def safe_building_id(cls, value: str) -> str:
        return _safe_key(value, "building_id")


class ThreeDTilesPreparationRequest(BaseModel):
    parcel_id: int = Field(gt=0)
    asset_key: str = Field(min_length=2, max_length=128)
    source_asset_id: str = Field(min_length=6, max_length=128)
    source_checksum_sha256: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    source_crs: str = Field(min_length=3, max_length=64)
    vertical_reference: str = Field(min_length=2, max_length=128)
    footprints: List[BuildingFootprint] = Field(min_length=1, max_length=_MAX_BUILDINGS)

    @field_validator("asset_key")
    @classmethod
    def safe_asset_key(cls, value: str) -> str:
        return _safe_key(value, "asset_key")


def _output_root() -> Path:
    configured = os.getenv("GEO_3D_PREPARATION_ROOT", "").strip()
    if not configured:
        raise HTTPException(status_code=503, detail="GEO_3D_PREPARATION_ROOT must be configured for 3D asset preparation")
    root = Path(configured).resolve()
    if not root.exists() or not root.is_dir():
        raise HTTPException(status_code=503, detail="GEO_3D_PREPARATION_ROOT must be an existing directory")
    return root


def _database_url() -> str:
    return (os.getenv("POSTGRES_URL") or os.getenv("DATABASE_URL") or "").strip() or _raise_database_unavailable()


def _raise_database_unavailable() -> str:
    raise HTTPException(status_code=503, detail="POSTGRES_URL or DATABASE_URL must be configured for 3D asset registration")


def _polygon_exterior_coordinates(geometry_payload: Dict[str, Any], source_crs: str) -> List[Tuple[float, float]]:
    try:
        geometry = shape(geometry_payload)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Building footprint is invalid GeoJSON: {exc}") from exc
    geometry = make_valid(geometry) if not geometry.is_valid else geometry
    if geometry.geom_type != "Polygon" or geometry.is_empty:
        raise HTTPException(status_code=422, detail="Each 3D building footprint must be a non-empty Polygon; split MultiPolygons into distinct building records")
    source = _parse_crs(source_crs, "source_crs")
    transformer = Transformer.from_crs(source, CRS.from_epsg(4326), always_xy=True)
    wgs84 = transform_geometry(transformer.transform, geometry)
    coordinates = list(wgs84.exterior.coords)
    if len(coordinates) < 4:
        raise HTTPException(status_code=422, detail="Building footprint exterior has insufficient vertices")
    return [(float(longitude), float(latitude)) for longitude, latitude in coordinates[:-1]]


def _ecef(longitude: float, latitude: float, height: float) -> Tuple[float, float, float]:
    transformer = Transformer.from_crs(CRS.from_epsg(4979), CRS.from_epsg(4978), always_xy=True)
    x, y, z = transformer.transform(longitude, latitude, height)
    return float(x), float(y), float(z)


def _enu_basis(longitude: float, latitude: float) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    lon = math.radians(longitude)
    lat = math.radians(latitude)
    east = np.array([-math.sin(lon), math.cos(lon), 0.0])
    north = np.array([-math.sin(lat) * math.cos(lon), -math.sin(lat) * math.sin(lon), math.cos(lat)])
    up = np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])
    return east, north, up


def _align4(value: bytes) -> bytes:
    return value + b"\x00" * ((4 - len(value) % 4) % 4)


def _glb_from_mesh(positions: List[Tuple[float, float, float]], indices: List[int]) -> bytes:
    if not positions or not indices:
        raise HTTPException(status_code=422, detail="3D preparation produced an empty mesh")
    position_bytes = b"".join(struct.pack("<fff", *position) for position in positions)
    index_component_type = 5123 if max(indices) <= 65535 else 5125
    index_format = "<H" if index_component_type == 5123 else "<I"
    index_bytes = b"".join(struct.pack(index_format, index) for index in indices)
    binary = _align4(position_bytes) + _align4(index_bytes)
    position_min = [min(position[axis] for position in positions) for axis in range(3)]
    position_max = [max(position[axis] for position in positions) for axis in range(3)]
    document = {
        "asset": {"version": "2.0", "generator": "idlr-authoritative-3d-preparation"},
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(position_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": len(_align4(position_bytes)), "byteLength": len(index_bytes), "target": 34963},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(positions), "type": "VEC3", "min": position_min, "max": position_max},
            {"bufferView": 1, "componentType": index_component_type, "count": len(indices), "type": "SCALAR"},
        ],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1, "mode": 4}]}],
        "nodes": [{"mesh": 0}],
        "scenes": [{"nodes": [0]}],
        "scene": 0,
    }
    json_chunk = _align4(json.dumps(document, separators=(",", ":")).encode("utf-8"))
    total_length = 12 + 8 + len(json_chunk) + 8 + len(binary)
    return b"".join([
        struct.pack("<4sII", b"glTF", 2, total_length),
        struct.pack("<I4s", len(json_chunk), b"JSON"),
        json_chunk,
        struct.pack("<I4s", len(binary), b"BIN\x00"),
        binary,
    ])


def _b3dm(glb: bytes) -> bytes:
    byte_length = 28 + len(glb)
    return struct.pack("<4sIIIIII", b"b3dm", 1, byte_length, 0, 0, 0, 0) + glb


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _register_prepared_asset(
    request: ThreeDTilesPreparationRequest,
    capability: AuthorityCapability,
    manifest_checksum: str,
    content_root_relative: str,
    provenance: Dict[str, Any],
) -> None:
    try:
        with psycopg2.connect(_database_url(), connect_timeout=5) as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT asset_id FROM geo_asset_catalog WHERE asset_id = %s AND parcel_id = %s LIMIT 1",
                (request.source_asset_id, request.parcel_id),
            )
            if cursor.fetchone() is None:
                raise HTTPException(status_code=422, detail="3D preparation source asset is not registered for the authorized parcel")
            cursor.execute(
                """
                INSERT INTO geo_3d_assets (
                  asset_key, parcel_id, source_asset_id, asset_kind, evidence_status,
                  content_root_relative, tileset_relative_path, terrain_relative_path,
                  manifest_checksum_sha256, source_checksum_sha256, processing_version,
                  provenance, limitations, active, registered_by, created_at, updated_at
                ) VALUES (
                  %s, %s, %s, 'tileset', 'provisional', %s, 'tileset.json', NULL,
                  %s, %s, %s, %s::jsonb, %s::jsonb, TRUE, %s, now(), now()
                ) ON CONFLICT (asset_key) DO UPDATE SET
                  parcel_id = EXCLUDED.parcel_id,
                  source_asset_id = EXCLUDED.source_asset_id,
                  asset_kind = EXCLUDED.asset_kind,
                  evidence_status = EXCLUDED.evidence_status,
                  content_root_relative = EXCLUDED.content_root_relative,
                  tileset_relative_path = EXCLUDED.tileset_relative_path,
                  terrain_relative_path = EXCLUDED.terrain_relative_path,
                  manifest_checksum_sha256 = EXCLUDED.manifest_checksum_sha256,
                  source_checksum_sha256 = EXCLUDED.source_checksum_sha256,
                  processing_version = EXCLUDED.processing_version,
                  provenance = EXCLUDED.provenance,
                  limitations = EXCLUDED.limitations,
                  active = TRUE,
                  registered_by = EXCLUDED.registered_by,
                  updated_at = now()
                """,
                (
                    request.asset_key,
                    request.parcel_id,
                    request.source_asset_id,
                    content_root_relative,
                    manifest_checksum,
                    request.source_checksum_sha256.lower(),
                    "geo-authority-3d/v1",
                    json.dumps(provenance),
                    json.dumps([
                        "The generated building mesh is a derived visualization product and is not a cadastral boundary, survey, engineering model, or legal certification.",
                        "Vertical accuracy remains limited by the declared source footprint, height attributes, and stated vertical reference.",
                    ]),
                    int(capability.sub),
                ),
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="3D asset catalog registration failed") from exc


def prepare_three_d_tiles(request: ThreeDTilesPreparationRequest, capability: AuthorityCapability) -> Dict[str, Any]:
    _require_parcel_scope(capability, request.parcel_id)
    root = _output_root()
    _parse_crs(request.source_crs, "source_crs")
    asset_directory = root / request.asset_key
    if asset_directory.exists() and not asset_directory.is_dir():
        raise HTTPException(status_code=422, detail="3D asset key conflicts with an existing non-directory output")
    temporary_directory = Path(tempfile.mkdtemp(prefix=f".{request.asset_key}-", dir=root))
    backup_directory = root / f".{request.asset_key}.backup"
    published = False
    if backup_directory.exists():
        shutil.rmtree(backup_directory, ignore_errors=True)
    try:
        tiles_directory = temporary_directory / "tiles"
        tiles_directory.mkdir(parents=True, exist_ok=True)
        all_coordinates: List[Tuple[float, float]] = []
        footprint_records: List[Tuple[BuildingFootprint, List[Tuple[float, float]]]] = []
        for footprint in request.footprints:
            coordinates = _polygon_exterior_coordinates(footprint.geometry, request.source_crs)
            footprint_records.append((footprint, coordinates))
            all_coordinates.extend(coordinates)
        if not all_coordinates:
            raise HTTPException(status_code=422, detail="No valid 3D footprints were supplied")
        center_longitude = sum(coordinate[0] for coordinate in all_coordinates) / len(all_coordinates)
        center_latitude = sum(coordinate[1] for coordinate in all_coordinates) / len(all_coordinates)
        center_ecef = np.array(_ecef(center_longitude, center_latitude, 0.0))
        east, north, up = _enu_basis(center_longitude, center_latitude)
        positions: List[Tuple[float, float, float]] = []
        indices: List[int] = []
        minimum_height = float("inf")
        maximum_height = float("-inf")
        longitudes: List[float] = []
        latitudes: List[float] = []
        for footprint, coordinates in footprint_records:
            base_index = len(positions)
            count = len(coordinates)
            if count < 3:
                raise HTTPException(status_code=422, detail=f"Building {footprint.building_id} has fewer than three footprint vertices")
            for height in (footprint.base_height_m, footprint.base_height_m + footprint.height_m):
                for longitude, latitude in coordinates:
                    delta = np.array(_ecef(longitude, latitude, height)) - center_ecef
                    positions.append((float(np.dot(delta, east)), float(np.dot(delta, north)), float(np.dot(delta, up))))
                    longitudes.append(longitude)
                    latitudes.append(latitude)
            bottom = list(range(base_index, base_index + count))
            top = list(range(base_index + count, base_index + 2 * count))
            for index in range(1, count - 1):
                indices.extend([top[0], top[index], top[index + 1]])
                indices.extend([bottom[0], bottom[index + 1], bottom[index]])
            for index in range(count):
                next_index = (index + 1) % count
                indices.extend([bottom[index], bottom[next_index], top[next_index]])
                indices.extend([bottom[index], top[next_index], top[index]])
            minimum_height = min(minimum_height, footprint.base_height_m)
            maximum_height = max(maximum_height, footprint.base_height_m + footprint.height_m)
        glb = _glb_from_mesh(positions, indices)
        b3dm_path = tiles_directory / "0.b3dm"
        b3dm_path.write_bytes(_b3dm(glb))
        position_array = np.asarray(positions)
        center_local = (position_array.min(axis=0) + position_array.max(axis=0)) / 2
        half_axes = (position_array.max(axis=0) - position_array.min(axis=0)) / 2
        transform = [
            float(east[0]), float(east[1]), float(east[2]), 0.0,
            float(north[0]), float(north[1]), float(north[2]), 0.0,
            float(up[0]), float(up[1]), float(up[2]), 0.0,
            float(center_ecef[0]), float(center_ecef[1]), float(center_ecef[2]), 1.0,
        ]
        manifest = {
            "asset": {"version": "1.1", "generator": "idlr-authoritative-3d-preparation"},
            "geometricError": float(max(half_axes) * 2),
            "root": {
                "boundingVolume": {
                    "box": [
                        float(center_local[0]), float(center_local[1]), float(center_local[2]),
                        float(half_axes[0]), 0.0, 0.0,
                        0.0, float(half_axes[1]), 0.0,
                        0.0, 0.0, float(max(half_axes[2], 0.01)),
                    ]
                },
                "geometricError": 0.0,
                "refine": "ADD",
                "transform": transform,
                "content": {"uri": "tiles/0.b3dm"},
            },
        }
        manifest_path = temporary_directory / "tileset.json"
        manifest_path.write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")
        manifest_checksum = _hash_file(manifest_path)
        b3dm_checksum = _hash_file(b3dm_path)
        if asset_directory.exists():
            asset_directory.rename(backup_directory)
        temporary_directory.rename(asset_directory)
        published = True
        content_root_relative = _safe_relative_path(request.asset_key, "asset_key")
        provenance = {
            "source_asset_id": request.source_asset_id,
            "source_checksum_sha256": request.source_checksum_sha256.lower(),
            "source_crs": request.source_crs,
            "vertical_reference": request.vertical_reference,
            "building_count": len(request.footprints),
            "mesh_vertex_count": len(positions),
            "mesh_triangle_count": len(indices) // 3,
            "wgs84_bounds": [min(longitudes), min(latitudes), max(longitudes), max(latitudes)],
            "height_range_m": [minimum_height, maximum_height],
            "derived_content": {"tileset.json": manifest_checksum, "tiles/0.b3dm": b3dm_checksum},
        }
        _register_prepared_asset(request, capability, manifest_checksum, content_root_relative, provenance)
        shutil.rmtree(backup_directory, ignore_errors=True)
        return {
            "status": "prepared_and_registered",
            "evidence_status": "provisional",
            "generated_at": _utc_now(),
            "parcel_id": request.parcel_id,
            "asset_key": request.asset_key,
            "service_contract": {
                "content_root_relative": content_root_relative,
                "tileset_relative_path": "tileset.json",
                "manifest_checksum_sha256": manifest_checksum,
                "source_checksum_sha256": request.source_checksum_sha256.lower(),
                "processing_version": "geo-authority-3d/v1",
            },
            "provenance": provenance,
            "limitations": [
                "The generated 3D Tiles product is a provisional visualization derived from supplied footprints and heights; it is not a survey, engineering model, or legal boundary.",
                "The Cesium asset service performs a separate checksum and manifest validation before delivery.",
            ],
        }
    except HTTPException:
        shutil.rmtree(temporary_directory, ignore_errors=True)
        if published:
            shutil.rmtree(asset_directory, ignore_errors=True)
            if backup_directory.exists():
                backup_directory.rename(asset_directory)
        raise
    except Exception as exc:
        shutil.rmtree(temporary_directory, ignore_errors=True)
        if published:
            shutil.rmtree(asset_directory, ignore_errors=True)
            if backup_directory.exists():
                backup_directory.rename(asset_directory)
        raise HTTPException(status_code=500, detail="3D Tiles preparation failed") from exc


@router.post("/three-d/prepare")
async def authoritative_three_d_preparation(request: ThreeDTilesPreparationRequest, authorization: Optional[str] = Header(default=None)):
    return prepare_three_d_tiles(request, verify_authority_capability(authorization))
