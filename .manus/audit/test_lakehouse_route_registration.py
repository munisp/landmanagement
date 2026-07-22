from lakehouse.api.main import app

expected_paths = {
    "/analytics/title-risk/score",
    "/ml/title-risk/examples",
    "/ml/title-risk/train",
    "/ml/title-risk/model",
    "/analytics/geospatial/workbench",
}
registered_paths = {route.path for route in app.routes}
missing = expected_paths - registered_paths
assert not missing, f"Missing lakehouse routes: {sorted(missing)}"
print({"status": "ok", "route_count": len(registered_paths), "ai_routes": sorted(expected_paths)})
