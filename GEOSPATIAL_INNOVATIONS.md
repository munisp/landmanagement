# Governed Geospatial Innovations

**Status:** Implemented and validated on the platform validation stack
**Scope:** Server, Lakehouse processing service, PostgreSQL/PostGIS schema, Temporal orchestration, PWA, and Expo native application
**Release principle:** Every result is traceable to declared evidence and policy-gated. No innovation creates, certifies, or changes a legal title, cadastral boundary, regulatory eligibility, or other authoritative decision automatically.

## Purpose and design boundary

This release adds ten interoperable, evidence-led geospatial capabilities to the land-management platform. It converts spatial inputs, governed imagery, declared network data, and field observations into reviewable operational evidence. The implementation deliberately rejects undeclared source data, unsuitable coordinate reference systems, incomplete provenance, and unsafe publication requests. It therefore improves discovery, quality control, monitoring, and decision support without presenting derived output as legal proof.

The release implements a STAC-compatible metadata catalog because STAC defines a common structure for describing and cataloging spatiotemporal assets, including Items, Catalogs, Collections, and an API pattern for asset search.[1] It also exposes governed discovery through an OGC API Features-style HTTP surface. OGC describes this standard as a web interface for creating, modifying, and querying spatial data, with read access as the core capability.[2] Durable monitor timing is delegated to Temporal rather than an in-process timer, following the durable-execution model in which workflow state can resume after process failures.[3]

| Layer | Implemented responsibility | Primary files |
| --- | --- | --- |
| PostgreSQL/PostGIS | Persists catalog, item, monitor, alert, and public-release records with operational indexes | `drizzle/0030_geo_innovation_catalog_and_monitoring.sql`, `drizzle/schema.ts` |
| Policy and orchestration | Validates supported innovation types, enforces GeoAI policy, executes approved runs, records alerts, and starts durable schedules | `server/geoaiPolicy.ts`, `server/geoaiExecutionService.ts`, `server/geoInnovationService.ts`, `server/geoInnovationMonitorService.ts` |
| Lakehouse | Performs evidence-led geometry, raster, network, catalog, field, and privacy operations | `lakehouse/api/geo_innovations_service.py` |
| Application API | Provides protected tRPC operations and authenticated HTTP interoperability discovery | `server/api/routers/geo-innovations.ts`, `server/geoInteroperabilityHttp.ts`, `server/routers.ts`, `server/_core/index.ts` |
| PWA | Provides catalog, monitor, alert, release, and interoperability workspace | `client/src/pages/GeospatialInnovationHub.tsx`, `client/src/App.tsx` |
| Native iOS/Android | Provides the same governed hub, monitor lifecycle, alerts, releases, protected feature discovery, and push deep link | `mobile/src/screens/GeoInnovationScreen.tsx`, `mobile/src/services/api.ts`, `mobile/app/innovation.tsx` |
| Workflow runtime | Maintains resilient monitor evaluation and dispatch behavior | `temporal/workflows/geoaiAnalysisWorkflow.ts`, `temporal/activities/geoai.ts`, `temporal/geoInnovationScheduler.ts` |

## Innovation inventory

| # | Innovation | Delivered behavior | Evidence and safety contract | User surfaces |
| ---: | --- | --- | --- | --- |
| 1 | **Spatial evidence quality score** | Measures geometry validity, geometry type, positional accuracy against a declared expectation, lineage completeness, metric area, and metric perimeter. | Requires source identifier, SHA-256 checksum, source CRS, suitable projected/equal-area analysis CRS, and declared accuracy. The response labels the score as **not a legal certification**. | GeoAI workflow, PWA hub, native hub |
| 2 | **Multi-hazard profile** | Intersects a declared parcel with declared hazard geometries and returns per-hazard coverage, severity-weighted coverage, source IDs, and checksums. | Requires a positive-area parcel, each hazard’s severity and provenance, and a suitable measurement CRS. It returns overlay evidence rather than a predicted loss, flood depth, or eligibility conclusion. | GeoAI workflow, PWA hub, native hub |
| 3 | **COG readiness inspection** | Inspects a real raster for CRS, tiling, block shapes, overviews, georeferencing, dimensions, and COG-layout readiness. | Reads only the declared governed raster asset. It explicitly does **not** claim HTTP range-read verification from local metadata. | GeoAI workflow, PWA hub, native hub |
| 4 | **STAC-compatible catalog** | Registers collections and items, validates Item geometry, bounding box, time representation, assets, media types, and metadata, then exposes catalog discovery. | Item validation requires explicit geometry, bounding box, temporal metadata, and at least one asset. Persisted metadata remains subject to application access controls and publication policy. | PWA hub, native hub, protected HTTP discovery |
| 5 | **OGC API Features discovery** | Supplies a protected landing page, conformance declaration, collections, collection metadata, and GeoJSON feature responses sourced from persisted platform records. | The route is mounted under `/api/geo`, requires authenticated authorization through the platform boundary, and represents features as persisted operational geometry/reference data—not certified survey or title data. | PWA interoperability tab, native protected feature discovery, HTTP clients |
| 6 | **Change vectorization and alerts** | Compares co-registered before/after rasters, calculates a thresholded difference mask, vectorizes change areas above a minimum mapping unit, persists provisional alerts, and sends in-app/mobile notifications. | Requires distinct assets, matching projected CRS, transform, dimensions, comparison band, seasonal comparability, and declared mutual-valid coverage. Output remains **provisional** pending human review. | PWA alerts, native alerts, notification deep link |
| 7 | **Accessibility equity diagnostic** | Calculates shortest-path impedance to declared destinations by declared operational group and reports reachability, group statistics, a weighted mean, and an inter-group gap. | Requires explicit graph nodes, edges, modes, impedance basis, group membership, and router source. It does not infer protected or sensitive characteristics. | GeoAI workflow, PWA hub, native hub |
| 8 | **Field geofence verification** | Compares accuracy-filtered device track samples to a buffered parcel geofence and reports inside/outside counts, rejected samples, and median accuracy. | Requires declared parcel lineage, a suitable measurement CRS, time-stamped WGS 84 track points, a buffer, and an accuracy threshold. It is evidence provenance—not a certified survey. | Field workflow, PWA hub, native hub |
| 9 | **Evidence-led zonal statistics** | Masks a declared raster to a declared zone and returns pixel accounting plus descriptive statistics: minimum, maximum, mean, median, standard deviation, fifth percentile, and ninety-fifth percentile. | Requires both source records and checksums, a declared zone CRS, an overlapping raster extent, valid pixels, and an existing band. | GeoAI workflow, PWA hub, native hub |
| 10 | **Privacy-governed public release** | Produces a generalized centroid, grid centroid, or minimum bounding box for a completed privacy-release analysis; supports approval, publication, and revocation lifecycle states. | Requires source lineage, analysis/output CRS, declared method and grid size when applicable, license, and legal notice. A human approval record is mandatory before publication, and output is marked not for legal or regulatory boundary use. | PWA releases, native releases, governed release API |

## Data model and performance design

Migration `0030_geo_innovation_catalog_and_monitoring.sql` introduces five production tables. They are modeled in Drizzle and are included in the ordered migration journal. All five were successfully applied to an empty PostgreSQL/PostGIS validation database.

| Table | Business purpose | Operational indexes |
| --- | --- | --- |
| `geo_stac_collections` | Catalog collection metadata, extents, licensing, description, and governance state | Primary key and collection-key uniqueness |
| `geo_stac_items` | STAC-compatible item metadata, GeoJSON geometry, temporal extent, assets, provenance, and collection relation | `geo_stac_items_collection_datetime_idx` supports collection and time discovery |
| `geo_monitor_subscriptions` | Authorized evidence monitor settings, schedule, status, next evaluation, and audit relationships | `geo_monitor_subscriptions_status_next_idx` supports bounded due-monitor polling |
| `geo_change_alerts` | Provisional change candidates, severity, evidence/run references, lifecycle status, acknowledgement, and resolution state | `geo_change_alerts_parcel_status_created_idx` supports parcel and operations review queues |
| `geo_public_releases` | Privacy-generalization method, legal notice, license, workflow source, review lifecycle, publication, and revocation state | `geo_public_releases_status_created_idx` supports governed publication queues |

The indexes correspond to the platform’s high-frequency access paths: time-filtered asset discovery, due monitor dispatch, parcel-specific alert triage, and publication state management. They complement existing PostGIS parcel geometry indexes rather than duplicating them.

## End-to-end request and evidence flow

A user begins through a policy-gated GeoAI analysis request. The server validates the actor, authorization, innovation type, evidence manifest, and source references before forwarding a typed request to the Lakehouse. The Lakehouse validates input structure and coordinate-system suitability again before a geometry, raster, network, or field computation can begin. The returned result preserves source identifiers, SHA-256 checksums, metric context, calculation parameters, limitations, and an explicit evidence status.

For change monitoring, an authorized subscription is persisted first. The singleton Temporal monitor workflow evaluates only due, active subscriptions with complete settings. It dispatches the platform analysis workflow rather than invoking Python processing outside the normal policy path. A completed change-vectorization run can create a durable `geo_change_alerts` record and publish a mobile/in-app notification. This keeps the notification as a convenience layer: the persisted alert and its evidence links remain the system of record.

> **Operational rule:** An alert, score, overlay, generalized geometry, or catalog item is reviewable spatial evidence. It does not amend a land record automatically. Human authorization and the existing land-record workflow remain required for any authoritative action.

## Authorization, security, and privacy controls

| Concern | Implementation control |
| --- | --- |
| Identity and session | All application requests remain behind the platform’s authenticated identity and session middleware; native requests carry the current access token through the typed mobile client. |
| Authorization | The innovation tRPC router and HTTP interoperability surface use the existing protected procedure and GeoAI policy enforcement; policy-valid operations cannot be started by an unauthenticated client. |
| Input provenance | Geospatial processors require explicit source asset identifiers and SHA-256 checksums where measurement or release evidence is produced. |
| Measurement correctness | Metric operations reject geographic CRS and Web Mercator where measured area or distance claims would be unsuitable; callers must declare an appropriate projected/equal-area CRS. |
| Raster correctness | Change analysis rejects mismatched CRS, transform, raster shape, bands, seasonal comparability, and insufficient mutual valid-pixel coverage. |
| Catalog correctness | STAC validation rejects empty or invalid geometry, inverted/extents-incompatible bounding boxes, absent temporal representation, and absent assets. |
| Alert safety | Change outputs are persisted as provisional alerts and require review lifecycle actions; they are never treated as autonomous enforcement events. |
| Release safety | Public release generation uses deliberate generalization, retains license/legal notice, requires human approval before publication, and permits revocation. |
| Mobile safety | Native notifications use an explicit deep-link allow-list. Innovation alerts open only `/innovation`; arbitrary server-provided navigation paths are rejected. |

## HTTP interoperability surface

The server mounts the interoperability router at `/api/geo`. It provides discovery-oriented read endpoints for governed clients. These endpoints are intentionally separated from tRPC mutation flows: discovery is HTTP/GeoJSON-oriented, while state changes remain through protected application procedures and audit controls.

| Endpoint family | Purpose |
| --- | --- |
| `/api/geo` | Landing/discovery document for the governed geospatial API |
| `/api/geo/conformance` | Declares the implemented discovery/conformance characteristics |
| `/api/geo/collections` | Lists authorized collections |
| `/api/geo/collections/:collectionId` | Returns authorized collection metadata |
| `/api/geo/collections/:collectionId/items` | Returns authorized STAC-compatible item discovery data |
| `/api/geo/collections/:collectionId/items/:itemId` | Returns an authorized individual catalog item |
| `/api/geo/collections/:collectionId/features` | Returns a protected GeoJSON feature collection sourced from persisted platform records |

The implementation is compatible with the discovery and read-query intent of STAC and OGC API Features; it does not claim external compliance certification. Formal conformance testing and certification remain a separately governed deployment exercise.[1] [2]

## Native mobile parity

The Expo application provides the same governed innovation workspace under the `/innovation` route. It exposes the ten-capability portfolio, protected feature discovery, STAC collection viewing, monitor creation and lifecycle actions, change-alert triage, privacy-release approval/publication/revocation actions, and a policy-gated route to create an evidence analysis run. The native client never fabricates data locally: each view reads from protected server APIs and displays empty states when no persisted records are available.

The native notification handler registers the `idlr-geoai` Android channel and accepts only known routes for response deep links. A Geo Innovation alert maps to `/innovation`; existing GeoAI run and ArcGIS routes remain separately allow-listed. Device token registration is non-blocking and requires a physical device, granted permission, and an EAS project ID. Failure to register push delivery does not prevent durable in-app alert creation.

## Deployment and operations

The production topology includes `geo-innovation-temporal-scheduler`, which starts the idempotent singleton monitor workflow. The existing Temporal worker must remain deployed because it executes the scheduled monitor activity and downstream GeoAI workflow. The Lakehouse deployment must expose the innovation router through the authenticated service path used by `geoaiLakehouseClient.ts`.

| Configuration | Required use |
| --- | --- |
| `GEO_INNOVATION_MONITOR_POLL_SECONDS` | Durable monitor evaluation cadence; default is `300` seconds. |
| `GEO_INNOVATION_MONITOR_LIMIT` | Maximum due subscriptions evaluated in one bounded cycle; default is `25`. |
| `GEO_INNOVATION_MONITOR_WORKFLOW_ID` | Stable singleton Temporal workflow identity; default is `geo-innovation-monitor-scheduler-v1`. |
| `GEO_INNOVATION_PUBLIC_RELEASE_ORIGIN` | Optional origin for approved public release links; protected catalog and feature discovery continue to use the authenticated platform origin. |
| `EXPO_PUSH_DELIVERY_ENABLED` | Enables optional Expo delivery after durable alert persistence; default is `true`. |
| Existing `TEMPORAL_*`, Lakehouse, Keycloak, Permify, Redis, Dapr, Fluvio, and APISIX/OpenAppSec settings | Continue to supply identity, authorization, durable execution, service connectivity, cache/rate limits, event delivery, ingress, and web-application firewall controls. |

### Recommended operating sequence

1. An authorized administrator registers a catalog collection and validates an item with source lineage and access metadata.
2. A qualified user initiates an innovation analysis using real governed assets and a complete manifest.
3. A reviewer evaluates the result, including method, coordinate system, source checksum, assumptions, limitations, and evidence status.
4. If repeated evaluation is justified, an authorized user creates an active monitor with a policy-valid ISO-8601 interval and settings manifest.
5. The Temporal scheduler evaluates due monitors, and review teams triage persisted provisional alerts in the PWA or native app.
6. For public disclosure, an authorized reviewer prepares a generalized release from a completed privacy-release run, verifies license/legal notice, approves it, and only then publishes it. Revocation is available when source, legal, or policy conditions change.

## Validation record

The following checks were performed against the code and a real local PostgreSQL/PostGIS engine before publication.

| Validation | Result | Evidence |
| --- | --- | --- |
| Root static type check | Passed | `pnpm check` completed with no TypeScript errors. |
| Fresh migration | Passed | Full ordered migrations were applied to `idlr_geo_innovation_validation`; all five new tables and all four operational indexes were confirmed. |
| Lakehouse innovation tests | Passed | `python3 -m unittest lakehouse.tests.test_geo_innovations_service -v`: 4/4 passed. Tests cover metric quality, hazard overlay/source lineage, STAC bounding-box rejection, and privacy generalization. |
| Full server regression | Passed | `pnpm exec vitest run ...`: 27 files passed; 312 tests passed; 1 test skipped. The suite used the fresh PostgreSQL/PostGIS database and optional external integrations were explicitly disabled. |
| Native strict TypeScript | Passed | `pnpm exec tsc --noEmit --project tsconfig.json` completed cleanly after adding the missing Jest test declarations and correcting the supported refresh-control implementation. |
| Native API contracts | Passed | `pnpm test`: 1 suite passed; 3/3 tests passed. |
| Android bundle export | Passed | `npx expo export --platform android --output-dir dist` emitted the Android Hermes bundle and metadata. |
| Production build | Passed | `pnpm build` completed and emitted the PWA/server production artifacts, including a `GeospatialInnovationHub` bundle. |

The production PWA build reported existing large-chunk optimization warnings for broader platform bundles. The new `GeospatialInnovationHub` is emitted as an independently named bundle; the warnings are performance optimization opportunities, not build failures.

## References

[1]: https://stacspec.org/ "STAC Specification"
[2]: https://ogcapi.ogc.org/features/ "OGC API – Features"
[3]: https://temporal.io/blog/what-is-durable-execution "Temporal: The definitive guide to Durable Execution"
