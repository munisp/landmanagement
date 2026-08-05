# Cross-language geospatial implementation references

## PostGIS dynamic vector tiles

PostGIS documents `ST_AsMVT` as an aggregate that produces binary Mapbox Vector Tile data from rows containing tile-coordinate-space geometry. It states that `ST_AsMVTGeom` can transform geometry into that coordinate space and that other row columns become feature attributes. It also documents `ST_TileEnvelope` usage in its example.

Source: https://postgis.net/docs/ST_AsMVT.html

## Cesium 3D Tiles

Cesium documents 3D Tiles as the optimized streaming format for massive 3D geospatial data and describes tiling/hosting terrain, imagery, point clouds, photogrammetry, models, and 3D buildings. The platform will use standard 3D Tiles manifests and a self-hostable service contract rather than claim a proprietary hosted tiling environment.

Source: https://cesium.com/learn/3d-tiling/

## Dapr service invocation

Dapr documents service invocation as standard HTTP or gRPC communication through sidecars, including service discovery, secure service-to-service communication, retries/resiliency, tracing, metrics, mTLS support, and endpoint access policies. The platform preserves internal-only direct service endpoints in the Docker Compose topology while retaining Dapr as an existing platform middleware capability; the geospatial release does not claim a new Dapr sidecar registration that has not been configured.

Source: https://docs.dapr.io/developing-applications/building-blocks/service-invocation/service-invocation-overview/
