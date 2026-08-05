# Context Globe Release

**Author:** Manus AI

**Release state:** Implementation complete; activation is gated on deployment secrets, migrated PostgreSQL, and live middleware dependencies.

**Scope:** A clean-room, governed Context Globe inspired only by product concepts from WorldwideView. No WorldwideView source code, binaries, or managed-service dependency is included.

## Operating boundary

Context Globe provides **read-only public situational awareness**. It renders official public seismic and weather-alert context beside platform workflows but cannot change parcels, title records, evidence, transactions, payments, permissions, or workflow state. The PWA and mobile clients use only authenticated same-origin endpoints; neither client contacts public data providers directly.

| Layer | Fixed official source | Refresh enforcement | Client rendering | Provenance retained |
|---|---|---:|---|---|
| Seismic activity | USGS all-hour earthquake GeoJSON | 60 seconds | Red Cesium/MapLibre point markers | Source id, timestamps, checksum, ETag, normalized fields, ingestion run, Iceberg snapshot |
| Weather alerts | NWS active alerts GeoJSON | 120 seconds | Amber Cesium/MapLibre polygons and points | Source id, timestamps, checksum, ETag, normalized fields, ingestion run, Iceberg snapshot |

USGS documents the all-hour GeoJSON summary feed as a programmatic interface refreshed every minute, while NWS documents the active-alert API and requires an identifying `User-Agent` for automated access.[1] [2]

> **Decision boundary:** Context Globe is not a cadastral map, site safety assessment, emergency instruction, forecast, legal finding, or authorization to edit any platform record. Operators must confirm conditions with the appropriate authority and approved procedures.

## Delivered architecture

The TypeScript application owns user policy, tRPC control-plane APIs, HMAC capability issuance, delivery audit records, and the authenticated same-origin gateway. A Go service serves bounded SSE streams, and a Rust service serves bounded temporal GeoJSON and mobile summaries. A Python Lakehouse worker fetches only the two fixed upstream sources, conditionally retrieves content with ETag/Last-Modified validators, normalizes valid GeoJSON, persists operational lineage to PostgreSQL, appends immutable snapshots and ingestion runs to Iceberg, and publishes post-commit event notifications through Dapr.

| Component | Implemented responsibility | Readiness/telemetry |
|---|---|---|
| TypeScript middleware | Tenant-scoped layer catalog, event queries, subscriptions, capability issuance, same-origin delivery | Application metrics and authenticated API surface |
| Go `context-stream-gateway` | Signed, layer-scoped SSE fan-out from PostgreSQL | `/health`, `/ready`, `/metrics` on 8091 |
| Rust `context-tiles-service` | Signed temporal GeoJSON and mobile summary delivery | `/health`, `/ready`, `/metrics` on 8092 |
| Python `context-globe-ingestion` | Official-source ingestion, validation, PostgreSQL/Iceberg provenance, Dapr event publication | Prometheus metrics on 8093 |
| Temporal reconciliation | Repeated authenticated verification of Lakehouse Context Globe status | Dedicated `context-globe` task queue |
| PWA | Lazy-loaded Cesium Context Globe route with layer preferences, 1h/24h/7d/30d windows, attribution, and safety notices | `/context-globe` |
| Native mobile | MapLibre overlay plus online-only signed summary, no event cache, layer preferences, and field-safe messaging | Expo route `/context` |

## Persistence and governance

Migration `0033_context_globe.sql` introduces `context_layers`, `context_ingestion_runs`, `context_events`, `context_layer_subscriptions`, and `context_delivery_audits`. It also adds source-time and freshness indexes and seeds only the USGS and NWS layers. The Python connector rejects non-approved layer names, arbitrary URLs, malformed feature collections, oversized responses, unsupported geometries, invalid WGS84 coordinate sets, and invalid Dapr component identifiers.

Iceberg records are initialized in `events.context_globe_snapshots` and `governance.context_globe_ingestion_runs`. Operational PostgreSQL records retain user subscription state, current active events, source validators, quality state, delivery audit metadata, and lineage references. Lakehouse snapshots retain public-source-derived data only; Context Globe does not copy private parcel geometry or evidence.

## Deployment and activation

The production Compose topology defines the Go stream gateway, Rust tiles service, Python ingestion worker, a dedicated Dapr sidecar, a Context Globe Temporal worker, and an idempotent Temporal scheduler. All service traffic remains on the private `idlr_net` network. The application declares the Go and Rust services as health-gated dependencies; the worker is health-checked through its local Prometheus endpoint.

| Variable | Required value or policy |
|---|---|
| `CONTEXT_CAPABILITY_SECRET` | At least 32 random characters; identical in TypeScript, Go, and Rust services |
| `CONTEXT_STREAM_SERVICE_URL` | Internal URL, normally `http://context-stream-gateway:8091` |
| `CONTEXT_TILES_SERVICE_URL` | Internal URL, normally `http://context-tiles-service:8092` |
| `CONTEXT_NWS_USER_AGENT` | Deployment identity plus a monitored operations contact |
| `CONTEXT_DAPR_PUBSUB` | Existing Dapr pub/sub component, normally `idlr-pubsub` |
| `CONTEXT_DELIVERY_TIMEOUT_MS` | Same-origin delivery request budget; default 8000 ms |
| `CONTEXT_INGEST_POLL_SECONDS` | Worker tick, default 15 seconds; source cadence remains hard-enforced at 60/120 seconds |
| `TEMPORAL_CONTEXT_GLOBE_TASK_QUEUE` | Dedicated Temporal task queue, normally `context-globe` |
| `CONTEXT_TEMPORAL_RECONCILE_SECONDS` | Status reconciliation cadence, default 300 seconds |

Before enabling the feature in a deployment, operators must apply all migrations through `0033`, create and protect the Context capability secret, configure the NWS user agent, confirm PostgreSQL and the Iceberg/MinIO warehouse are healthy, confirm Dapr has the configured pub/sub component, and start the Context Globe Compose services. Prometheus must load both `mapping_alerts.yml` and `context_globe_alerts.yml`.

## Validation record

| Gate | Result |
|---|---|
| TypeScript strict check | Passed after PWA, mobile delivery, Temporal, and deployment additions |
| TypeScript Context capability tests | Passed: 3 tests covering HMAC scope normalization, audience confusion, signature/expiry/noncanonical rejection, and header extraction |
| Go stream gateway | Passed: `go test ./...` and `go vet ./...` |
| Rust tiles service | Passed: `cargo test` (3 tests) and `cargo clippy -- -D warnings` |
| Python ingestion | Passed: 9 tests covering approved-source policy, USGS/NWS normalization, geometry rejection, conditional 304 handling, and Dapr guard; modules compiled |
| Mobile static check | Passed: `pnpm check` in `mobile/` |
| Production build | Passed: Vite plus server bundle; Context Globe emitted as a lazy route chunk |
| Compose structural validation | Passed: `docker compose -f docker-compose.production.yml config --no-interpolate` |
| PostgreSQL migration smoke | Passed in isolated PostgreSQL 16: 34 ordered migrations applied; 5 Context Globe tables, 4 indexes, and seeded `seismic,weather-alerts` layers confirmed |
| Browser route transport | Passed deterministically: Vite preview returned HTTP 200 and the application root shell for `/context-globe`; interactive visual inspection was inconclusive because the sandbox browser session reset to `about:blank` after initial navigation |

The release is **code- and configuration-ready**, but live-data readiness cannot be asserted until a target environment supplies the required secrets, public egress, PostgreSQL, Iceberg/MinIO, Dapr, Temporal, and authenticated application sessions. Existing Prometheus alerts cover service unavailability, USGS freshness, NWS freshness, repeated ingestion failures, and Rust temporal-output errors.

## References

[1]: [USGS GeoJSON Summary Format](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php)

[2]: [National Weather Service API Web Service](https://www.weather.gov/documentation/services-web-api)
