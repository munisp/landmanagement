# Mapping Engine Maturity Assessment

**Author:** Manus AI

**Assessment date:** August 5, 2026

**Repository assessed:** [`munisp/landmanagement` at `d1c0ba1`](https://github.com/munisp/landmanagement/tree/d1c0ba1)

> **Conclusion:** The platform has a **robust, secure, and materially integrated governed mapping lane**, but the **overall mapping engine is not yet fully unified or uniformly polished**. The new MapLibre, CesiumJS, GeoLibre, vector-tile, 3D-asset, and Sedona/Iceberg paths are production-capable subject to normal operator configuration. Reachable legacy Google Maps and Three.js pages materially lower consistency, evidence discipline, and product polish.

## Executive scorecard

| Dimension | Score | Assessment |
|---|---:|---|
| **Overall mapping-engine maturity** | **76 / 100** | Strong governed core; uneven because several first-class routes use legacy, differently governed renderers. |
| **Governed PWA map lane** | **86 / 100** | MapLibre consumes short-lived parcel-scoped MVT grants and renders persisted geometry without inventing a boundary. |
| **Data correctness and evidence discipline** | **84 / 100** | The modern lane preserves polygons/multipolygons, warnings, provenance, evidence state, and Lakehouse job lineage. The legacy parcel route still fabricates a square from a centroid and area. |
| **Security and authorization** | **88 / 100** | Capability-bound delivery, same-origin gateway, strict CSP, constrained GeoLibre origin, validated paths, and cross-language capability verification are mature. |
| **Scalability and performance readiness** | **72 / 100** | Go/PostGIS MVT, pooled connections, timeouts, request limits, cache headers, lazy PWA chunks, and Sedona jobs are good foundations. No demonstrated concurrent-map load benchmark, CDN strategy, or provider resilience plan exists. |
| **Operational maturity** | **73 / 100** | Health/readiness/metrics exist for tile, 3D, Lakehouse, and workers. Prometheus has no rule files or Alertmanager targets, so detection does not yet become actionable alerting. |
| **PWA experience and polish** | **78 / 100** | The routed Geospatial Center coherently joins MapLibre, CesiumJS, GeoLibre, and governed job status with useful evidence/error messages. Parallel legacy pages reduce consistency. |
| **GeoLibre companion maturity** | **76 / 100** | The typed exact-origin embed session, selection updates, focus, and cleanup are strong. It remains conditional on reciprocal configuration and staging handshake testing of the external companion. |
| **CesiumJS 3D evidence maturity** | **74 / 100** | CesiumJS is genuinely integrated, lazy-loaded, authenticated, asset-scoped, and lifecycle-clean. It uses an ellipsoid terrain provider and no imagery base layer, so it is a governed 3D-evidence viewer rather than a complete terrain/imagery globe. |
| **Native mobile mapping parity** | **48 / 100** | Mobile safely presents authenticated provenance markers and governed job state, but lacks MapLibre vector tiles, GeoLibre, Cesium 3D, and offline spatial packages. |

## What is robust and integrated

The new primary PWA route is a genuinely governed mapping system, not a client-only visual surface. `MapLibreParcelWorkbench` requests a short-lived capability for the selected parcel, attaches it only to same-origin MVT requests, refreshes before expiry, and falls back to **persisted local evidence only** if delivery fails. It validates coordinate ranges, preserves polygon and multipolygon geometry, shows a centroid rather than inventing a boundary, cleans up the WebGL lifecycle, and exposes map/tile errors to the user.[1]

Map delivery is backed by a consistent server-to-service trust path. The TypeScript gateway authenticates the user, verifies the audience-bound capability, records use, validates tile coordinates and content paths, applies bounded upstream timeouts, forwards correlation identifiers, and returns private cache semantics. The Go service independently verifies the HMAC scope and generates PostGIS MVT with a parameterized `id = ANY($4)` parcel filter, pooled PostgreSQL connections, health/readiness, and metrics.[2] [3]

CesiumJS is now a real platform capability. The routed viewer discovers only authorized active assets, obtains an asset-bound capability, carries it through the Cesium `Resource` chain, uses bounded retry behavior, refreshes before expiry, preserves evidence status/limitations in the UI, and destroys its viewer on cleanup.[4] The Rust service validates the same scope, manifest, and safe paths before streaming 3D Tiles content. The PWA code-splits Cesium so normal 2D use does not immediately load the 3D engine.

GeoLibre is a genuine companion workflow, not merely an iframe. Its PWA workspace establishes the official typed embed connection against the configured exact origin, adds a governed GeoJSON context layer after the connection is acknowledged, fits true bounds, observes selection changes, supports anchor focus, and disconnects listeners correctly. CSP derives the allowed frame origin from a validated configuration value.[5] [6]

Sedona/Iceberg integration has improved mapping-engine maturity in an important but indirect way. The MapLibre workbench can submit a run-bound GeoParquet job; the GeoAI Operations Center and native screens expose durable status and cancellation. The Lakehouse only reports distributed runtime readiness when its worker SQL probe, PostgreSQL catalog, and private warehouse are ready. This gives advanced spatial outputs a durable, provenance-bearing path rather than returning SQL recipes or synthetic artifacts.[7]

## What prevents a higher score

The largest issue is **engine fragmentation**. `/advanced-geospatial-center` is the modern governed surface, but `/parcels/:id/map` is a reachable Google Maps route with a separate API, editable client-side polygons, unescaped interpolated info-window HTML, and a centroid-and-area square fallback. It also discards all but the first component of a multipolygon. This violates the modern lane’s no-fabricated-boundary standard and creates inconsistent user expectations.[8]

The same fragmentation exists in 3D. The CesiumJS viewer is governed and evidence-bound, while the separately reachable Three.js page constructs a local scene with a default boundary, index-derived positions, a box/cone building, and client-side terrain/flood controls. This is a useful exploratory prototype, but it is not equivalent to the asset-scoped Cesium evidence surface and should not be presented as authoritative parcel or engineering visualization.[9]

MapLibre’s base map is a direct OpenStreetMap raster URL. The application correctly attributes it, but there is no provider availability monitor, policy-controlled alternate source, self-hosted style/tile strategy, or explicit offline strategy. Its protected MVT path currently scopes up to 512 parcel identifiers, but the mounted workbench uses a single selected parcel; there is no demonstrated regional-scale browsing, generalized tile cache, or load/capacity evidence.[1] [3]

The system has telemetry, but not complete operations maturity. Prometheus scrapes the Lakehouse API, Sedona worker, vector-tile service, and Cesium asset service, but `rule_files` is empty and Alertmanager has no targets. Therefore failures can be measured but not yet escalated through a defined response path.[10]

Finally, native mobile deliberately prioritizes safe evidence review. It renders only persisted EPSG:4326 field-observation markers and tells the user when it will not invent a marker or boundary. This is safe and appropriate for its present workflow, but it is not feature parity with the PWA mapping stack.[11]

## Readiness conclusion

The platform is **mature enough for governed PWA parcel review, protected MVT delivery, companion GIS review, evidence-scoped Cesium 3D assets, and provenance-bearing Lakehouse outputs**. Its core architectural quality is substantially better than an ordinary front-end map integration because authorization, geometry integrity, provenance, durable jobs, and cross-language delivery are treated as one system.

It is **not yet a single polished mapping engine across every user route and device**. A defensible product statement is:

> “The platform provides a governed MapLibre-based parcel-review system with authorization-scoped vector tiles, origin-verified GeoLibre companion workflows, evidence-scoped CesiumJS 3D assets, and Sedona/Iceberg-backed spatial jobs. Legacy Google Maps and Three.js pages remain available but are not part of the same evidence and delivery standard.”

The highest-value release gates are to retire or refactor the legacy Google Maps and Three.js routes into the governed MapLibre/Cesium pathway; add an approved basemap/provider resilience strategy; define Prometheus alert rules and Alertmanager routing; run representative authenticated tile and 3D concurrency tests; and decide whether native field work requires true vector-tile/3D/offline package parity.

## Validation evidence

| Gate | Current result |
|---|---|
| Root strict TypeScript check | Passed: `pnpm check` |
| Isolated geospatial tests | Passed: 12 tests across GeoLibre geometry, capability delivery, and Sedona manifest policy |
| Native strict check and contracts | Passed: 5 contracts, including scoped evidence and Sedona job lifecycle |
| Go vector-tile service | Passed: `go test ./...` |
| Rust Cesium asset service | Passed: 4 `cargo test` cases |
| Latest release distributed smoke | Passed: PostGIS, private MinIO, shared Iceberg catalog, Spark/Sedona worker readiness, governed GeoParquet output, and live Lakehouse health |
| Browser UX/load test | Not evidenced in this assessment; no claim is made for cross-browser visual QA, provider outage behavior, or concurrent map-session capacity |

## References

[1]: https://github.com/munisp/landmanagement/blob/d1c0ba1/client/src/components/MapLibreParcelWorkbench.tsx "MapLibre parcel workbench"
[2]: https://github.com/munisp/landmanagement/blob/d1c0ba1/server/geospatialDeliveryHttp.ts "Same-origin geospatial delivery gateway"
[3]: https://github.com/munisp/landmanagement/blob/d1c0ba1/go-services/vector-tile-service/main.go "Go PostGIS vector-tile service"
[4]: https://github.com/munisp/landmanagement/blob/d1c0ba1/client/src/components/CesiumParcelViewer.tsx "CesiumJS parcel viewer"
[5]: https://github.com/munisp/landmanagement/blob/d1c0ba1/client/src/pages/GeoLibreWorkspace.tsx "GeoLibre workspace"
[6]: https://github.com/munisp/landmanagement/blob/d1c0ba1/server/_core/security.ts "CSP and CORS policy"
[7]: https://github.com/munisp/landmanagement/blob/d1c0ba1/SEDONA_LAKEHOUSE_IMPLEMENTATION.md "Sedona and Iceberg Lakehouse implementation record"
[8]: https://github.com/munisp/landmanagement/blob/d1c0ba1/client/src/pages/ParcelMap.tsx "Legacy Google Maps parcel route"
[9]: https://github.com/munisp/landmanagement/blob/d1c0ba1/client/src/pages/Building3DVisualization.tsx "Legacy Three.js visualization route"
[10]: https://github.com/munisp/landmanagement/blob/d1c0ba1/monitoring/prometheus.yml "Prometheus scrape configuration"
[11]: https://github.com/munisp/landmanagement/blob/d1c0ba1/mobile/src/screens/geoai/GeoAiEvidenceMapScreen.tsx "Native evidence map"
