# Map Stack Robustness and Integration Audit

**Author:** Manus AI
**Assessment date:** 2026-08-05
**Scope:** Runnable PWA, server, native mobile source, runtime configuration, dependency graph, and focused regression validation for **MapLibre GL JS**, **GeoLibre**, and **CesiumJS**.

## Executive assessment

The platform has a **real but uneven geospatial visualization stack**. MapLibre is the only one of the three requested technologies that is operationally integrated into the PWA and connected to protected server-side parcel data. GeoLibre is now integrated as a governed companion session rather than only an iframe/export launch, but it remains dependent on a correctly configured trusted GeoLibre deployment. CesiumJS is **not integrated**: it is neither installed nor imported, and the routed 3D page uses Three.js instead.

> **Production posture:** MapLibre is suitable for bounded 2D parcel review after the remediations in this audit. GeoLibre is conditionally suitable for governed companion GIS exploration once its reciprocal origin allow-list is configured and tested in the target deployment. CesiumJS cannot be claimed as a platform capability until a real 3D globe/terrain/3D-Tiles implementation is built and validated.

| Technology | Executable integration | Robustness score | Operational conclusion |
|---|---:|---:|---|
| **MapLibre GL JS** | PWA parcel workbench, PMTiles protocol registration, protected GeoJSON/analytics APIs, 2D/terrain/extrusion-capable advanced component | **70 / 100** | Real integration for parcel review; stronger after geometry, XSS, and topology fixes. Not yet a fully scalable vector-tile-first map platform. |
| **GeoLibre** | Protected launch context, GeoJSON bundle, origin-pinned iframe, official typed embed client, acknowledged layer synchronization | **64 / 100** | Real governed companion integration, contingent on the upstream deployment setting `GEOLIBRE_EMBED_ORIGINS` to the platform origin. |
| **CesiumJS** | No dependency, import, viewer, terrain, imagery, 3D Tiles, or server endpoint | **0 / 100** | Not integrated. The current 3D visualization is a separate Three.js implementation, not CesiumJS. |
| **Cross-platform map parity** | PWA MapLibre; mobile uses `react-native-maps` for provenance marker viewing | **42 / 100** | Native clients preserve field-observation provenance but do not have MapLibre Native, GeoLibre, or Cesium parity. |

The scores evaluate six dimensions: executable product wiring, spatial correctness, security and privacy, lifecycle resilience, scalable data delivery, and validation depth. They do **not** certify legal-cadastral accuracy or availability of external tile/GIS providers.

## Confirmed architecture

| Layer | MapLibre | GeoLibre | CesiumJS |
|---|---|---|---|
| **PWA** | `MapLibreParcelWorkbench` is mounted by the Advanced Geospatial Center. It renders persisted parcel geometry and recorded centroids/nearby context. | `GeoLibreWorkspace` is routed and now uses the official typed embed client to add a governed parcel-context layer, fit its actual bounds, focus the anchor parcel, observe selections, and disconnect on cleanup. | No routed implementation. |
| **Server** | Protected geospatial procedures build parcel/flood/admin/topology GeoJSON; PostGIS MVT generation exists as a helper. | Protected launch-context API prepares a polygon-only parcel bundle. The configured base URL is validated as an http(s) URL with no embedded credentials. | No server-side terrain, imagery, 3D Tiles, or Cesium token/asset service exists. |
| **Security boundary** | Map error state is visible; parcel properties in advanced popups are rendered as text rather than injected HTML. | CSP now admits only the exact configured GeoLibre frame origin; the official client verifies that same origin and correlates acknowledgements. | Not applicable because no runtime exists. |
| **Native mobile** | No MapLibre Native integration. | No GeoLibre native or WebView integration. | No Cesium integration. `react-native-maps` displays only verified EPSG:4326 field-observation markers. |

MapLibre GL JS is a browser WebGL mapping library designed around style documents, source/layer data, and vector/raster tile rendering.[1] GeoLibre’s current browser embed model offers an origin-checked, acknowledgement-based `postMessage` client; it must be enabled by the GeoLibre deployment’s allow-list.[2] CesiumJS is a distinct WebGL globe/map engine that expects a viewer plus imagery, terrain, 3D Tiles, entities, and camera integration—none of which are present here.[3]

## Remediations completed in this audit

| Risk corrected | Implemented control | Result |
|---|---|---|
| Fabricated parcel boundary from a centroid | The mounted MapLibre parcel workbench now renders only persisted polygons/multipolygons. When only a centroid is available, it displays a point and an explicit evidence notice. | The map no longer invents a cadastral boundary from area or centroid values. |
| Multipolygon loss | Parcel geometry preserves `MultiPolygon` records. The server uses `@terraformer/wkt` for persisted WKT and preserves multipolygons and polygon holes. | WKT is no longer reduced to the first polygon or a false point at `[0, 0]`. |
| Invalid nearby source updates | Nearby parcels are always updated as a GeoJSON feature collection rather than a raw parcel array. | MapLibre source updates remain valid after data refresh. |
| Mislocated topology conflicts | The protected topology procedure returns parsed overlap geometry; the advanced workbench draws true persisted polygon/multipolygon footprints. | No hardcoded Lagos placeholder point remains in the topology layer. |
| Persisted-property XSS | Advanced parcel popups now use MapLibre `setText`, not interpolated `setHTML`. | Parcel values cannot become executable popup markup. |
| Placeholder satellite credential | The unusable MapTiler placeholder style was removed from the basemap choices. | Users are no longer offered a knowingly broken satellite style. |
| Launch/export-only GeoLibre iframe | The PWA uses `@geolibre/embed` to establish an exact-origin connection, add the prepared GeoJSON layer, fit bounds, focus the anchor feature, subscribe to selection changes, and tear down listeners. | GeoLibre is now a synchronized companion experience rather than a disconnected iframe. |
| Weak iframe/worker CSP coverage | CSP has explicit `worker-src 'self' blob:` and an exact `frame-src` entry derived from `GEOLIBRE_BASE_URL`. | MapLibre/GeoLibre capabilities are enabled without allowing arbitrary frames or remote workers. |
| Unvalidated GeoLibre endpoint | `GEOLIBRE_BASE_URL` is validated as an absolute http(s) URL without credentials. | The browser cannot receive a malformed or credential-bearing configured launch endpoint. |

## Remaining gaps and release gates

The following limitations are material. None should be represented as complete functionality until the stated release gate is met.

| Priority | Remaining gap | Required production gate |
|---|---|---|
| **P0** | **CesiumJS does not exist in the runtime.** The 3D page is Three.js and constructs simplified local scene geometry. | Either remove CesiumJS claims from product collateral or build a separate CesiumJS viewer with governed WGS84 data, imagery/terrain/3D-Tiles sources, resource policy, performance budgets, and end-to-end tests. |
| **P0** | GeoLibre requires reciprocal configuration outside this repository. | Set `GEOLIBRE_BASE_URL` to the trusted GeoLibre deployment and set that deployment’s `GEOLIBRE_EMBED_ORIGINS` to the platform’s exact public origin. Verify the `ready` handshake and acknowledgements in staging. |
| **P1** | The advanced MapLibre workbench remains an unmounted specialist component and includes several analysis modes whose server implementations are explicitly approximate or operator-assisted. | Do not expose it as an authoritative decision surface until isochrone, viewshed, 3D extrusion, and GeoParquet workflows use governed real engines/artifacts and their evidence status is displayed. |
| **P1** | Direct GeoJSON delivery is bounded, but a completed HTTP MVT/vector-tile serving path is not wired as the primary client data source. | Publish an authenticated HTTP MVT endpoint, use it for regional parcel layers, retain GeoJSON only for parcel-scale context, and load-test realistic concurrent map sessions. |
| **P1** | Parcel/resource authorization is authenticated at the tRPC boundary, but this audit did not establish record-level authorization for every map/query procedure. | Enforce and test the same ownership/role/territorial authorization policy used by the land registry before returning any parcel, topology, or release geometry. |
| **P1** | The base map uses a direct public raster provider. | Define provider terms, availability/attribution monitoring, rate controls, and a compliant fallback or self-hosted style/tile strategy. |
| **P2** | Native mobile mapping is intentionally minimal and lacks MapLibre/GeoLibre/Cesium feature parity. | Adopt MapLibre Native or a governed map WebView only if the mobile field workflow requires vector-tile/offline/advanced GIS capabilities; preserve the current provenance-only boundary until then. |
| **P2** | Browser smoke testing could not start locally because the platform correctly fails closed without the full microservice/OAuth/Elasticsearch deployment contract. | Run the UI handshakes in staging with real, non-placeholder service configuration; the production build and strict type validation already passed. |

## Required operations configuration

The repository now documents this setting in `.env.example`:

```bash
GEOLIBRE_BASE_URL=https://your-trusted-geolibre.example
```

The GeoLibre deployment must independently set:

```bash
GEOLIBRE_EMBED_ORIGINS=https://your-land-platform.example
```

The exact application origin must be used; wildcard origin access is inappropriate for a land-registry environment. GeoLibre’s published guide states that its embed API is off by default and that origin allow-listing is enforced in both directions.[2]

## Validation evidence

| Check | Result |
|---|---|
| Strict TypeScript validation | Passed: `pnpm check` |
| Production PWA/server build | Passed: `pnpm build` |
| Isolated WKT geometry regression suite | Passed: `pnpm test:geospatial-geometry` — 3 tests |
| Patch integrity | Passed: `git diff --check` |
| Browser smoke startup | Blocked by missing required local microservice/OAuth/Elasticsearch configuration; this was a correct fail-closed startup behavior, not a mapping compilation failure. |

## Recommended product language

Use the following statement until the remaining release gates are completed:

> “The platform provides MapLibre-based 2D parcel review and a governed, origin-verified GeoLibre companion workspace for persisted parcel context. Advanced analyses are evidence-gated and may require configured backend services. CesiumJS is not currently part of the deployed platform.”

## References

[1]: https://maplibre.org/maplibre-gl-js/docs/ "MapLibre GL JS Documentation"
[2]: https://geolibre.app/user-guide/embedding/ "GeoLibre Embedding and Sharing"
[3]: https://cesium.com/learn/cesiumjs-fundamentals/ "CesiumJS Fundamentals"
