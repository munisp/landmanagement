from pathlib import Path

import yaml

root = Path(__file__).resolve().parents[2]
compose = yaml.safe_load((root / "docker-compose.production.yml").read_text())
prometheus = yaml.safe_load((root / "monitoring" / "prometheus.yml").read_text())

services = compose.get("services", {})
required_services = {"app", "lakehouse-api", "vector-tile-service", "cesium-asset-service"}
missing_services = required_services - services.keys()
if missing_services:
    raise SystemExit(f"missing required services: {sorted(missing_services)}")

app_environment = services["app"].get("environment", {})
for name in ("GEO_DELIVERY_CAPABILITY_SECRET", "GEO_TILE_SERVICE_URL", "GEO_CESIUM_ASSET_SERVICE_URL", "GEO_SPATIAL_AUTHORITY_URL"):
    if name not in app_environment:
        raise SystemExit(f"app missing {name}")

lakehouse_environment = services["lakehouse-api"].get("environment", {})
if lakehouse_environment.get("GEO_3D_PREPARATION_ROOT") != "/data/geo-3d-assets":
    raise SystemExit("lakehouse must prepare 3D assets in the shared root")
if not any(str(volume).startswith("geo_3d_assets:/data/geo-3d-assets") for volume in services["lakehouse-api"].get("volumes", [])):
    raise SystemExit("lakehouse lacks shared geo_3d_assets volume")
if not any(str(volume) == "geo_3d_assets:/data/geo-3d-assets:ro" for volume in services["cesium-asset-service"].get("volumes", [])):
    raise SystemExit("cesium asset service must mount the shared asset volume read-only")
if "geo_3d_assets" not in compose.get("volumes", {}):
    raise SystemExit("shared geo_3d_assets volume is undeclared")

scrape_jobs = {entry.get("job_name") for entry in prometheus.get("scrape_configs", [])}
for job in ("vector-tile-service", "cesium-asset-service", "lakehouse-api"):
    if job not in scrape_jobs:
        raise SystemExit(f"prometheus missing {job} scrape job")

print("geospatial production deployment YAML is structurally valid")
