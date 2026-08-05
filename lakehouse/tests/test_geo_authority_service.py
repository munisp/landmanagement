import asyncio
import base64
import hashlib
import hmac
import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import numpy as np
import rasterio
from fastapi import HTTPException
from pyproj import CRS, Transformer
from rasterio.io import MemoryFile
from rasterio.transform import from_origin

from api.geo_authority_service import (
    AuthorityCapability,
    RouteProvenance,
    RouteRequest,
    ThreeDTilesPreparationRequest,
    ViewshedRequest,
    authoritative_route,
    calculate_authoritative_route,
    calculate_viewshed,
    prepare_three_d_tiles,
    verify_authority_capability,
)
from api.geoai_service import NetworkEdge, NetworkNode, RasterAssetRequest

SECRET = "0123456789abcdef0123456789abcdef"
CHECKSUM = "a" * 64


def capability(parcel_ids=(7,), audience="geo_analysis"):
    now = int(datetime.now(timezone.utc).timestamp())
    return AuthorityCapability(
        iss="idlr-geospatial-platform",
        ver=1,
        aud=audience,
        sub="12",
        jti="f44dc52a-5a14-45b1-bd9b-f9d0b2a79b53",
        iat=now - 1,
        exp=now + 300,
        parcels=list(parcel_ids),
        purpose="map.authoritative-analysis",
    )


def signed_payload(payload):
    encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).rstrip(b"=").decode()
    signature = base64.urlsafe_b64encode(hmac.new(SECRET.encode(), encoded.encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
    return f"Bearer {encoded}.{signature}"


def signed_header(value: AuthorityCapability):
    return signed_payload(value.model_dump())


class GeoAuthorityServiceTests(unittest.TestCase):
    def setUp(self):
        self.previous_secret = os.environ.get("GEO_DELIVERY_CAPABILITY_SECRET")
        os.environ["GEO_DELIVERY_CAPABILITY_SECRET"] = SECRET

    def tearDown(self):
        if self.previous_secret is None:
            os.environ.pop("GEO_DELIVERY_CAPABILITY_SECRET", None)
        else:
            os.environ["GEO_DELIVERY_CAPABILITY_SECRET"] = self.previous_secret

    def test_capability_verifies_and_rejects_wrong_audience(self):
        accepted = verify_authority_capability(signed_header(capability()))
        self.assertEqual(accepted.parcels, [7])
        invalid_payload = capability().model_dump()
        invalid_payload["aud"] = "vector_tiles"
        with self.assertRaises(HTTPException) as context:
            verify_authority_capability(signed_payload(invalid_payload))
        self.assertEqual(context.exception.status_code, 401)

    def test_route_uses_only_declared_network_and_scope(self):
        request = RouteRequest(
            parcel_id=7,
            nodes=[
                NetworkNode(id="a", longitude=3.0, latitude=6.0),
                NetworkNode(id="b", longitude=3.001, latitude=6.0),
                NetworkNode(id="c", longitude=3.002, latitude=6.0),
            ],
            edges=[
                NetworkEdge(source="a", target="b", travel_time_s=10, distance_m=50, modes=["drive"]),
                NetworkEdge(source="b", target="c", travel_time_s=10, distance_m=50, modes=["drive"]),
                NetworkEdge(source="a", target="c", travel_time_s=100, distance_m=300, modes=["drive"]),
            ],
            origin_node_id="a",
            destination_node_id="c",
            mode="drive",
            impedance="travel_time",
            provenance=RouteProvenance(
                network_asset_id="road-network-001",
                network_checksum_sha256=CHECKSUM,
                declared_router_source="verified road graph",
                network_evidence_status="verified",
            ),
        )
        result = calculate_authoritative_route(request, capability())
        self.assertEqual(result["route"]["node_path"], ["a", "b", "c"])
        self.assertEqual(result["route"]["travel_time_s"], 20.0)
        with self.assertRaises(HTTPException) as context:
            calculate_authoritative_route(request, capability((8,)))
        self.assertEqual(context.exception.status_code, 403)

    def test_viewshed_returns_raster_derived_provisional_geometry(self):
        data = np.zeros((20, 20), dtype=np.float32)
        data[10, 11] = 100.0
        transform = from_origin(500000, 200, 10, 10)
        to_wgs84 = Transformer.from_crs(CRS.from_epsg(32631), CRS.from_epsg(4326), always_xy=True)
        longitude, latitude = to_wgs84.transform(500105, 95)
        request = ViewshedRequest(
            parcel_id=7,
            dem=RasterAssetRequest(
                uri="https://assets.example/dem.tif",
                asset_id="dem-asset-001",
                checksum_sha256=CHECKSUM,
                declared_source_crs="EPSG:32631",
            ),
            observer={"longitude": longitude, "latitude": latitude, "height_above_ground_m": 1.7},
            analysis_crs="EPSG:32631",
            maximum_distance_m=70,
            sampling_resolution_m=10,
        )
        with MemoryFile() as memory:
            with memory.open(driver="GTiff", height=20, width=20, count=1, dtype="float32", crs="EPSG:32631", transform=transform, nodata=-9999) as dataset:
                dataset.write(data, 1)
                result = calculate_viewshed(request, capability(), dataset)
        self.assertEqual(result["evidence_status"], "provisional")
        self.assertEqual(result["dem"]["crs"], "EPSG:32631")
        self.assertGreater(result["method"]["considered_cells"], 0)
        self.assertIn("features", result["visibility"])

    def test_three_d_preparation_writes_real_tileset_and_b3dm(self):
        request = ThreeDTilesPreparationRequest(
            parcel_id=7,
            asset_key="parcel-7-buildings",
            source_asset_id="lidar-asset-001",
            source_checksum_sha256=CHECKSUM,
            source_crs="EPSG:4326",
            vertical_reference="EGM96",
            footprints=[{
                "building_id": "building-001",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[3.0, 6.0], [3.0001, 6.0], [3.0001, 6.0001], [3.0, 6.0001], [3.0, 6.0]]],
                },
                "height_m": 12,
            }],
        )
        with tempfile.TemporaryDirectory() as directory, patch("api.geo_authority_service._register_prepared_asset") as register:
            previous = os.environ.get("GEO_3D_PREPARATION_ROOT")
            os.environ["GEO_3D_PREPARATION_ROOT"] = directory
            try:
                result = prepare_three_d_tiles(request, capability())
            finally:
                if previous is None:
                    os.environ.pop("GEO_3D_PREPARATION_ROOT", None)
                else:
                    os.environ["GEO_3D_PREPARATION_ROOT"] = previous
            root = Path(directory) / "parcel-7-buildings"
            self.assertTrue((root / "tileset.json").is_file())
            self.assertTrue((root / "tiles" / "0.b3dm").is_file())
            self.assertEqual((root / "tiles" / "0.b3dm").read_bytes()[:4], b"b3dm")
            self.assertEqual(result["status"], "prepared_and_registered")
            register.assert_called_once()


if __name__ == "__main__":
    unittest.main()
