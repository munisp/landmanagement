import os

os.environ["LAKEHOUSE_API_KEY"] = "geoai-smoke-key"
os.environ["LAKEHOUSE_CORS_ORIGINS"] = "https://platform.example.test"
os.environ["GEOAI_ALLOWED_ASSET_URI_PREFIXES"] = "s3://trusted-geoai/"

from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)
headers = {"X-Lakehouse-Api-Key": "geoai-smoke-key"}
checksum = "b" * 64

unauthorized = client.post("/geoai/network/accessibility", json={})
assert unauthorized.status_code == 401, unauthorized.text

spatial = client.post(
    "/geoai/spatial/validate",
    headers=headers,
    json={
        "geometry": {"type": "Polygon", "coordinates": [[[3.0, 6.0], [3.001, 6.0], [3.001, 6.001], [3.0, 6.001], [3.0, 6.0]]]},
        "source_crs": "EPSG:4326",
        "analysis_crs": "EPSG:32631",
        "operation": "area",
        "source_asset_id": "parcel-geometry-001",
        "source_checksum_sha256": checksum,
    },
)
assert spatial.status_code == 200, spatial.text
assert spatial.json()["geometry"]["metric_area_m2"] > 0

network = client.post(
    "/geoai/network/accessibility",
    headers=headers,
    json={
        "nodes": [
            {"id": "field-office", "longitude": 3.0, "latitude": 6.0},
            {"id": "parcel-site", "longitude": 3.01, "latitude": 6.01},
            {"id": "clinic", "longitude": 3.02, "latitude": 6.02},
        ],
        "edges": [
            {"source": "field-office", "target": "parcel-site", "travel_time_s": 180, "distance_m": 2200, "modes": ["drive", "walk"], "bidirectional": True},
            {"source": "parcel-site", "target": "clinic", "travel_time_s": 240, "distance_m": 3100, "modes": ["drive"], "bidirectional": True},
        ],
        "origin_node_ids": ["field-office"],
        "destination_node_ids": ["parcel-site", "clinic"],
        "mode": "drive",
        "impedance": "travel_time",
        "max_snap_distance_m": 100,
        "declared_router_source": "verified-road-network-v1",
    },
)
assert network.status_code == 200, network.text
payload = network.json()
assert payload["pair_accounting"] == {"total_pairs": 2, "unreachable_pairs": 0, "reachable_pairs": 2}
assert payload["origins"][0]["reachable_destinations"][0]["destination_node_id"] == "parcel-site"

print("GeoAI Lakehouse authenticated smoke test passed")
