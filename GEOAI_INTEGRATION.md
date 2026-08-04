# GeoAI Evidence and Governed Decision Integration

**Author:** Manus AI
**Status:** Implemented and validated against the platform’s PostgreSQL/PostGIS schema, TypeScript build, browser application build, protected Lakehouse API, and regression suite.

## Purpose

This implementation brings the platform’s spatial analysis, imagery, LiDAR, routing, model-governance, and GIS-automation capabilities under a single **evidence-first GeoAI control plane**. It does not turn an agent response, raster calculation, or model score into an unqualified legal or operational decision. Each analysis is a versioned record with source-asset provenance, integrity checks, method-specific verification checkpoints, uncertainty, human review, and durable orchestration state.

The design translates the most relevant safeguards from the [GeoAI Skills framework][1] into executable platform contracts, while retaining the platform’s PostgreSQL/PostGIS, Lakehouse, Temporal, Dapr, Fluvio, Keycloak, Permify, APISIX, and frontend architecture.

| Adoption phase | Implemented platform capability | Evidence gate |
|---|---|---|
| **Phase 1 — Spatial correctness** | Typed spatial assets, CRS-aware geometry validation, overlay accounting, metric CRS enforcement, and legal-claim proxy-geometry rejection. | Source checksum, source/measurement CRS, geometry validity, query/accounting artifacts, and review checkpoints. |
| **Phase 2 — Monitoring and field operations** | Authenticated network accessibility, imagery inspection, co-registered change detection, LiDAR metadata/QC through PDAL, and Temporal-backed execution. | Trusted asset URI prefix, declared sensor/vertical CRS, valid-pixel coverage, comparability, point density, and route/snap evidence. |
| **Phase 3 — Governed GeoAI decisions** | Persisted model evidence and deterministic suitability analysis with criteria provenance and sensitivity results. | Spatial/group split evidence, baseline metrics, uncertainty metrics, geographic transfer artifacts, and human review. |
| **Phase 4 — Presentation and guarded GIS control** | Evidence-aware map/report payloads, GeoAI Operations Center, and human-approved ArcGIS control-plane operations with recovery plans. | Provenance and uncertainty displayed with every result; no execution before policy authorization, recovery plan, and explicit approval. |

## Architecture

```text
Browser / GeoAI Operations Center
        │ protected tRPC procedures
        ▼
GeoAI router ── Permify resource policy ── GeoAI evidence service ── PostgreSQL/PostGIS
        │                                             │                     │
        │                                             └── Dapr/Fluvio outbox ┘
        ▼
Temporal GeoAI worker ── authenticated internal Lakehouse client ── Lakehouse GeoAI API
                                                                    │
                                                              GeoAI processing
                                                              • CRS / geometry
                                                              • network routing
                                                              • imagery / change
                                                              • LiDAR PDAL QC
                                                              • model evidence
        ▼
Human reviewer / guarded ArcGIS control plane
```

The `geoai` tRPC namespace is registered in the main application router and exposes asset registration, analysis creation, durable queueing, checkpoint/artifact management, model evidence, suitability evaluation, review, evidence reports, presentation payloads, and guarded ArcGIS operation controls. The `/geoai-operations` route is registered in the browser application and linked from the Advanced Geospatial Center.

## Durable data and policy contract

Migration `0029_geoai_evidence_and_policy.sql` creates the following production records.

| Record | Purpose |
|---|---|
| `geo_asset_catalog` | Immutable asset identifiers, checksums, provenance, CRS, vertical CRS, acquisition time, quality metadata, and evidence state. |
| `geo_analysis_runs` | Versioned request, policy version, workflow ID, input manifest, result summary, uncertainty summary, review state, and failure reason. |
| `geo_analysis_checkpoints` | Method-specific verification gates; required gates must pass before a run can be verified. |
| `geo_analysis_artifacts` | QA maps, query plans, reports, errors, and result products with URIs and optional checksums. |
| `geo_model_evidence` | Training provenance, spatial split evidence, baselines, evaluation metrics, uncertainty, and transfer artifacts. |
| `geo_arcgis_operation_requests` | Inspectable plan, recovery plan, approval state, external job identifier, result, and failure record for guarded automation. |

The versioned GeoAI policy rejects unsupported claims at creation time. Examples include a geographic or Web Mercator CRS for measured area/distance, missing asset checksums, proxy geometry for legal/regulatory use, unregistered or non-comparable change imagery, missing LiDAR vertical CRS/point density, and spatial-model evidence without a leakage-safe split.

## Runtime deployment contract

The application and `geoai-temporal-worker` require the following explicit values. They are present in `.env.example` and the production composition.

| Variable | Required use |
|---|---|
| `LAKEHOUSE_API_URL`, `LAKEHOUSE_API_KEY` | Authenticated service-to-service GeoAI calls. |
| `GEOAI_ALLOWED_ASSET_URI_PREFIXES` | Allow-list for external raster and point-cloud source URIs. |
| `GEOAI_PDAL_BINARY` | Required when a LiDAR QC job is requested. |
| `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_GEOAI_TASK_QUEUE` | Durable GeoAI workflow routing. |
| `TEMPORAL_TLS_ENABLED`, `TEMPORAL_TLS_CERT`, `TEMPORAL_TLS_KEY` | Production Temporal transport security. |
| `ARCGIS_GEOAI_CONTROL_PLANE_URL`, `ARCGIS_GEOAI_CONTROL_PLANE_API_KEY` | Required only to execute or refresh a human-approved ArcGIS operation. |

The production composition starts `geoai-temporal-worker` independently of property-transaction processing and connects it to PostgreSQL, Temporal, Lakehouse, Permify, Keycloak, and the outbox event flow. The worker fails closed for missing configuration and does not fabricate a workflow or processing result.

## Operational lifecycle

A user submits a manifest with trusted assets. The policy validates it before persistence; the service creates a durable run and method-specific checkpoints. Queueing starts an actual Temporal workflow and records its workflow ID. The worker marks the run active, calls the authenticated Lakehouse endpoint, persists result/uncertainty, and moves the run to `awaiting_review`. A reviewer can mark a run `verified` only when every required checkpoint has passed. Otherwise, the result remains provisional, insufficient-evidence, rejected, or failed.

ArcGIS execution follows a separate human-in-the-loop path. An authorized requester submits an operation plan and recovery plan. A separate authorized approver must approve it. Only then may an authorized manager execute the configured external control-plane request. The full operation state is persisted; the platform does not emulate or silently complete desktop-GIS work.

## Validation record

| Validation | Result |
|---|---|
| TypeScript static analysis | Passed: `pnpm check`. |
| Production browser/server build | Passed: `pnpm build`. |
| Ordered migration history | Passed on a fresh PostgreSQL 16/PostGIS validation database. |
| GeoAI schema verification | Confirmed all six GeoAI tables and supporting indexes in PostgreSQL. |
| GeoAI policy and suitability tests | Passed: 6 tests. |
| Full sequential regression suite | Passed: 27 files; 312 passed; 1 skipped. |
| Lakehouse authenticated API smoke test | Passed: rejected unauthenticated request, validated projected geometry, and computed network accessibility. |

The test environment intentionally uses a PGlite-compatible migration subset for portable non-database-specific tests. The complete GeoAI migration remains mandatory and was separately applied and verified on PostgreSQL/PostGIS, which is the production engine.

## References

[1]: https://github.com/muend/geoai-skills "muend/geoai-skills"
