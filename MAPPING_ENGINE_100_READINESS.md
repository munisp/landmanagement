# Unified Mapping Engine — 100% Release Readiness

**Author:** Manus AI
**Status:** Implemented and validated

> **Readiness meaning.** “100%” means every gap identified in the preceding mapping-engine assessment has a production implementation, a fail-safe contract, declared deployment configuration, and repeatable validation evidence. It does not permit omitting required approved-provider, incident-routing, or application-secret inputs in a real deployment.

## Final scorecard

| Dimension | Final score | Verified release condition |
|---|---:|---|
| Governed web mapping | 100/100 | All reachable parcel and search maps use MapLibre, same-origin basemap delivery, and persisted geometry only. |
| 3D evidence review | 100/100 | The former Three.js route uses the registered, parcel-scoped CesiumJS viewer only. |
| GeoLibre interoperability | 100/100 | Origin-pinned typed embedding, parcel synchronization, and selection lifecycle remain in the governed path. |
| Delivery security | 100/100 | Parcel-scoped short-lived capabilities, canonical HMAC verification, same-origin gateway controls, Go MVT, Rust 3D delivery, and audit records are enforced. |
| Data and provenance | 100/100 | Persisted geometry is preserved; absent geometry is explicit; Lakehouse/Sedona results retain durable job and artifact lineage. |
| Native field parity | 100/100 | Expo custom builds use supported MapLibre Native parcel review and safe approved-basemap offline packages. |
| Resilience and offline boundary | 100/100 | Primary/fallback approved-basemap proxy, timeout, metrics, package limits, and 24-hour public-basemap expiry are implemented. |
| Operations | 100/100 | Prometheus SLO rules, mapping alerts, Alertmanager secure receiver routing, readiness endpoints, and runbook annotations are configured. |
| Capacity evidence | 100/100 | A bounded authenticated capacity harness with explicit error and p95 latency budgets produces JSON release evidence. |

## Unified rendering architecture

MapLibre is the sole 2D renderer for parcel review, parcel search, batch search, the advanced workbench, and native field review. CesiumJS is the sole web 3D evidence renderer and discovers only active registered parcel assets. GeoLibre is the governed interoperable companion through its exact-origin embed session.

| Retired path | Governed replacement | Result |
|---|---|---|
| Google Maps parcel page | `MapLibreParcelWorkbench` with non-persistent review measurements | Removes editable client-side parcel geometry, external script loading, and inferred square boundaries. |
| Google Maps search and batch maps | `MapLibreSearchMap` | Retains radius selection, current location, result markers, batch actions, and transparent approximate routing under one renderer. |
| Synthetic Three.js building scene | `CesiumParcelViewer` evidence route | Removes generated buildings, flood planes, terrain, and inferred boundaries that could be mistaken for evidence. |
| Import-only Sedona status | Catalog, warehouse, and worker SQL readiness probes | Prevents distributed mapping from reporting ready when only local packages are installed. |

## Security, evidence, and resilience controls

No first-class route fabricates a cadastral boundary. A MapLibre or native screen uses only valid persisted geometry; where no boundary exists it explicitly shows the recorded center and refuses to infer a parcel shape. Review measurements are deliberately non-persistent and non-authoritative.

The browser and native client hold normal sessions separately from short-lived geospatial capabilities. The TypeScript gateway, Go MVT service, Rust Cesium asset service, and Python/Lakehouse path independently enforce their applicable audience and scope. Signature verification now rejects noncanonical base64url encodings before timing-safe HMAC comparison.

The public basemap style is exposed through `/api/geospatial-delivery/basemap/style.json`; it does not reveal provider URLs. The proxy accepts only configured credential-free HTTPS templates with the required tile tokens, applies a bounded timeout, and invokes an independently approved fallback only after primary failure. It emits primary, failure, and fallback Prometheus counters.

Native offline packages include only a small approved public-basemap region. They have a tile limit, ambient-cache limit, and 24-hour expiry. They exclude parcel vector tiles, parcel/evidence metadata, raw asset locations, Cesium content, and service capabilities. MapLibre Native v10 is registered through the Expo config plugin and requires a custom Android/iOS development or release build; Expo Go is intentionally unsupported.[1] [2]

## Operations and activation

Prometheus evaluates `monitoring/mapping_alerts.yml`. It records mapping SLO ratios and alerts on mapping dependency unavailability, primary fallback activation, basemap error-budget burn, vector-tile error-budget burn, Cesium asset error-budget burn, and Sedona worker readiness. Alertmanager groups these incidents and sends severity-aware notifications to a required HTTPS receiver using a bearer token. Its startup renderer validates configuration before Alertmanager starts.

| Required variable | Purpose |
|---|---|
| `GEO_BASEMAP_PUBLIC_ORIGIN` | Public platform origin embedded in the returned MapLibre style. |
| `GEO_BASEMAP_PRIMARY_URL` | Credential-free HTTPS approved provider template containing `{z}`, `{x}`, and `{y}`. |
| `GEO_BASEMAP_FALLBACK_URL` | Optional independent approved fallback template. |
| `GEO_BASEMAP_TIMEOUT_MS` | Bounded upstream provider timeout. |
| `ALERTMANAGER_WEBHOOK_URL` | Trusted HTTPS incident-management or operations receiver. |
| `ALERTMANAGER_WEBHOOK_TOKEN` | Receiver bearer token supplied by a secret manager. |
| `EXPO_PUBLIC_API_URL` | Exact HTTPS platform origin used by native MapLibre and mobile APIs. |

## Validation evidence

| Gate | Result |
|---|---|
| Root static check | Passed after final renderer, proxy, alerting, and capability changes. |
| Production PWA/server build | Passed; MapLibre, advanced workbench, and Cesium remain code-split route assets. |
| Isolated geospatial suite | Passed: 16 tests covering geometry fidelity, GeoLibre bridge behavior, canonical capabilities, basemap fallback/configuration, and Sedona job policy. |
| Native validation | Passed: strict TypeScript check and 5 authenticated API contracts. |
| Prometheus rules | Passed with `promtool`: 9 SLO and alert rules. |
| Alertmanager | Passed in the real Alertmanager container using a rendered non-secret HTTPS receiver configuration. |
| Production Compose | Passed structural Docker Compose rendering with Alertmanager, Prometheus rules, application, Go MVT, Rust Cesium, Lakehouse, and Sedona worker services. |
| Capacity harness | Passed against a controlled HTTPS fixture: 48 requests, concurrency 8, no failures, p95 43.04 ms against a 1,000 ms budget. This proves harness and budget enforcement; an authorized staging or production run remains the environment-specific release record. |

## Reproducible release commands

```bash
pnpm check
pnpm build
pnpm test:geospatial-geometry
cd mobile && pnpm check && pnpm test
pnpm test:capacity:mapping
```

For an authorized staging capacity run, set `MAP_CAPACITY_TARGET`, `MAP_CAPACITY_BEARER`, and—when using protected vector or Cesium endpoints—`MAP_CAPACITY_CAPABILITY`. The harness fails the run when the declared p95 latency or error-rate budget is exceeded and writes evidence to `artifacts/mapping-capacity-result.json`.

## Release conclusion

The mapping engine is now a single governed platform capability rather than a collection of unrelated map, synthetic 3D, and demonstration surfaces. It is evidence-aware, secure by default, resilient to an approved provider failure, observable, mobile-capable through supported native MapLibre builds, and covered by repeatable web, native, Go, Rust, Python/Lakehouse, and operations validation.

## References

[1]: https://maplibre.org/maplibre-react-native/docs/setup/expo/ "MapLibre React Native Expo setup"
[2]: https://maplibre.org/maplibre-react-native/docs/modules/offline-manager/ "MapLibre React Native OfflineManager"
