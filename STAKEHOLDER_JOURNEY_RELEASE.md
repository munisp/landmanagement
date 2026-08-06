# Stakeholder Journey Engine — Release Evidence

**Release scope:** IDLR-PTS Platform reusable stakeholder journeys, J01–J20, including the protected onboarding and activation journey.

**Status:** Repository implementation and validation complete; production activation remains gated on a controlled live-environment run.

**Prepared by:** Manus AI

## Release Decision

The IDLR-PTS Platform now implements **20 parameterized stakeholder-journey templates** as durable Temporal workflows. A journey is created against a caller-provided subject reference and idempotency key; it is **not** a one-off script. Each run persists its state, ordered steps, immutable evidence, and human interventions in PostgreSQL. The engine composes existing land-management services while retaining each domain service as the authority for rights, legal, registry, tax, lending, identity, or payment decisions.[1] [2]

The prior participant and administrator onboarding release remains part of this scope. The protected `/getting-started` and `/admin/stakeholder-onboarding` surfaces retain server-derived milestone state; administrators alone create invitations, provision identities, synchronize policy, and activate users. The native client exposes only approved field-safe actions and recovery states rather than attempting identity, document, authorization, or activation decisions locally.[1] [10] [11]

> **Coverage statement:** The repository evidence score is **100/100** for the 20 defined template contracts: all 20 are registered, have database-backed subject validation, standard durable adapters, a registered PWA launch route, a native journey hub entry point, and test-verified deployment wiring. This is **not** a claim that 20/20 have been exercised in a live production environment. Live execution remains contingent on the gates in [Live-Environment Gates](#live-environment-gates).

| Evidence dimension | Verified result | Score | Evidence |
|---|---:|---:|---|
| Reusable template catalog | 20 of 20 codes, J01–J20, registered uniquely | 20/20 | Template smoke test; catalog and registry [1] [2] |
| Durable persistence | Four journey tables, three enums, 18 indexes; relational insert and rollback smoke passed | 20/20 | Migration and smoke script [3] [4] |
| Temporal orchestration | Reusable workflow, intervention and cancellation signals, dedicated worker and task queue | 15/15 | Workflow, client, worker [5] [6] [7] |
| Existing-service composition | Go evidence gateway for all templates; optional bounded Rust/Python paths for eligible templates | 15/15 | Middleware and service adapters [8] [9] |
| PWA and native access | PWA hub, navigation, native hub, More-menu launcher, and declared mobile handoffs verified | 15/15 | Client and native source validation [10] [11] |
| Deployment, Dapr, and monitoring | Health-gated worker, `portfolio.events` receipt, readiness probe, worker metrics, and alerts verified | 15/15 | Compose, Dapr, readiness, alerts [12] [13] [14] [15] |

## Template Coverage Matrix

All templates use the same ordered durable adapter chain: `validate_subject`, `domain_handoff`, `human_intervention`, and `completion_evidence`. The standard chain deliberately stops at a human decision boundary; it records evidence and routes work to the authoritative service but does not decide rights, legal outcomes, lending, tax, identity, or payment outcomes.[1] [2]

| Code | Stakeholder journey | Validated subject kind(s) | PWA launch route | Native handoff | Cross-language capability | Repository status |
|---|---|---|---|---|---|---|
| J01 | Parcel discovery and public service request | `parcel` | `/search` | Journey hub | Go/Dapr evidence | Verified |
| J02 | Landholding profile and evidence request | `parcel` | `/getting-started` | `/(tabs)` | Go/Dapr evidence | Verified |
| J03 | Certificate or title registration preparation | `parcel` | `/cofo-applications` | Journey hub | Go/Dapr evidence | Verified |
| J04 | Conveyancing title verification | `conveyancing_matter` | `/conveyancing-workspace` | Journey hub | Go/Dapr evidence | Verified |
| J05 | Mortgage application preparation | `mortgage_application` | `/mortgage-application` | Journey hub | Go/Dapr evidence | Verified |
| J06 | Collateral portfolio review | `collateral_case` | `/lender-collateral-control` | Journey hub | Go/Dapr evidence | Verified |
| J07 | Registry case assignment and resolution | `registry_case` | `/registry-operations-cloud` | Journey hub | Go/Dapr evidence | Verified |
| J08 | Registry integrity exception review | `parcel` | `/registry-integrity` | Journey hub | Go/Dapr evidence | Verified |
| J09 | Field survey assignment and review | `field_assignment` | `/field-survey-operations` | `/field-operations` | Go/Dapr evidence | Verified |
| J10 | Right-of-way corridor review | `row_corridor` | `/right-of-way-manager` | Journey hub | Go/Dapr; Rust corridor inspection when requested | Verified |
| J11 | Human valuation and appeal review | `tax_case` | `/valuation-tax-operations` | Journey hub | Go/Dapr evidence | Verified |
| J12 | Taxpayer assessment, appeal, and payment handoff | `tax_case` | `/tax-assessment` | Journey hub | Go/Dapr evidence | Verified |
| J13 | Acquisition data-room diligence | `acquisition_dataroom` | `/commercial-portfolio` | Journey hub | Go/Dapr evidence | Verified |
| J14 | Resilience exposure monitoring | `exposure_portfolio` | `/commercial-portfolio` | Journey hub | Go/Dapr; Rust exposure summary and Python Lakehouse analytics when requested | Verified |
| J15 | Rural and agribusiness service request | `rural_case` | `/commercial-portfolio` | Journey hub | Go/Dapr evidence | Verified |
| J16 | Verified provider request and dispute | `service_request`, `marketplace_listing` | `/marketplace` | Journey hub | Go/Dapr evidence | Verified |
| J17 | Purpose-bound property data integration | `property_api_client` | `/api-docs` | Journey hub | Go/Dapr; Python Lakehouse usage roll-up when requested | Verified |
| J18 | Sector concession and environmental review | `parcel` | `/mining-rights-center` | Journey hub | Go/Dapr evidence | Verified |
| J19 | Contextual mapping and GeoAI evidence request | `parcel` | `/context-globe` | `/context` | Go/Dapr; Python Lakehouse planning report when requested | Verified |
| J20 | Jurisdictional rollout assurance | `rollout_jurisdiction` | `/admin/nationwide-rollout` | Journey hub | Go/Dapr evidence | Verified |

## Cross-Language and Messaging Evidence

The TypeScript journey activity uses the Go portfolio gateway for minimized, HMAC-signed lifecycle evidence. The gateway allowlists `stakeholder-journey-engine`, publishes `portfolio.event.v1` messages through Dapr to the `portfolio.events` topic, and fails when publication is unavailable. The TypeScript Dapr consumer validates the gateway envelope, records an idempotent receipt as journey evidence, and **never transitions a journey or domain state from the event**. The PostgreSQL-backed journey run remains authoritative for orchestration state.[8] [9] [13]

| Component | Responsibility | Scope | Fail-closed condition |
|---|---|---|---|
| TypeScript / Temporal | Run lifecycle, idempotency, step state, human intervention signals | All J01–J20 | Missing Temporal config, queue, database, or required middleware configuration blocks execution |
| Go gateway / Dapr | Signed, minimized lifecycle evidence | All J01–J20 | Missing HMAC secret or Dapr publish endpoint rejects the handoff |
| Rust spatial engine | Bounded corridor or exposure proximity summaries | J10 and J14 only, when a valid `spatialRequest` is supplied | Missing engine secret, invalid bounded input, or unavailable engine blocks the activity |
| Python Lakehouse | Bounded planning, exposure, and usage aggregates | J14, J17, and J19 only, when a valid `lakehouseRequest` is supplied | Missing bearer token, unsupported endpoint, invalid bounded request, or unavailable Lakehouse blocks the activity |
| Dapr receipt consumer | Idempotent evidence of successful middleware publication | `portfolio.events` | Invalid/replayed-conflicting messages are dropped; transient persistence faults are retried through the dead-letter policy |

## Validation Record

Repository validation was run against the current source tree. The PostgreSQL smoke test used the isolated `context-globe-migration-smoke` container, performed the migration inside a transaction, exercised the relational chain, and rolled test data back. No production database was modified.

| Validation | Result | Notes |
|---|---|---|
| `pnpm check` | Passed | Server, PWA, workers, Dapr subscriber, and coverage test type-check cleanly |
| `mobile: pnpm exec tsc --noEmit` | Passed | Native journey hub, route, menu, and API client compile cleanly |
| `pnpm build` | Passed | Vite PWA build and server bundle complete; existing large-chunk warnings remain non-blocking |
| `GOFLAGS=-mod=mod go build ./... && go test ./...` | Passed | Go gateway compiled; package currently declares no Go unit tests |
| `cargo build --locked && cargo test --locked` | Passed | Rust spatial engine compiled; package currently declares no Rust unit tests |
| `python3 -m py_compile …` | Passed | Lakehouse main, portfolio router, and service modules compiled |
| `bash scripts/release/validate-compose-audit.sh` | Passed | Resolved production Compose topology passed; Compose emits only the pre-existing obsolete-version warning |
| Migration `0044` PostgreSQL smoke | Passed | 4 tables, 3 enum types, and 18 indexes; run/step/event/intervention relational smoke passed then rolled back |
| `pnpm exec tsx scripts/release/validate-stakeholder-journeys.ts` | Passed | 20 templates, 15 subject validators, PWA/native entry points, Dapr subscriber, worker health signal, and alert registration verified |

## Live-Environment Gates

A **live 100/100 operational score cannot be asserted until all gates below pass in a controlled environment with real credentials, actual authorized subjects, and independently observed service health**. The repository deliberately fails closed rather than synthesizing these outcomes.

| Gate | Required proof before production activation | Why it cannot be repository-validated |
|---|---|---|
| Temporal mTLS and workers | Valid Temporal endpoint, namespace, certificate/key pair, queue poller, start/signal/query/cancel test | Requires deployment credentials and a reachable Temporal cluster |
| PostgreSQL migration | Migration application through the production release process and backup/restore confirmation | Must use the target deployment database and change-control procedure |
| Keycloak and Permify | Authenticated user with an allowed role; subject ownership and commercial membership enforcement | Requires real identity realm, authorization schema, and test users |
| Go gateway and Dapr | Signed event accepted, `portfolio.events` subscriber receipt persisted, no duplicate on replay | Requires secret parity, Dapr sidecars, Kafka/pub-sub service, and broker state |
| Rust spatial engine | Bounded J10/J14 request with approved test geometry and correct HMAC secret | Requires a live engine and approved test data |
| Python Lakehouse | Authorized J14/J17/J19 aggregate request with `LAKEHOUSE_INTERNAL_TOKEN`, healthy PostgreSQL/Iceberg/Sedona dependencies | Requires private token and running data plane |
| Human intervention | Authorized reviewer signals continue, block, and cancel paths; audit evidence inspected | Requires regulated workflow owners and real authorization assignments |
| Monitoring | Prometheus targets up; Alertmanager delivery tested for worker, Go, Rust, and Lakehouse alerts | Requires live monitoring and incident-routing credentials |

## Operational Controls

The production Compose contract starts a separate `stakeholder-journey-temporal-worker` only after PostgreSQL, Temporal, the Go gateway, the Rust engine, and the Lakehouse report healthy. It requires the task queue, middleware URLs, HMAC secrets, and Lakehouse token. The worker exposes a private readiness/metrics endpoint; Prometheus alerts on worker unavailability, unexpected activity errors, and Go/Rust/Python dependency loss.[12] [14] [15]

> The journey engine is an evidence-led orchestration layer. It does not grant or amend land rights, accept registry changes, issue certificates, make legal findings, approve credit, determine tax or valuation outcomes, verify identity, confirm payment, or decide a permit. Those decisions remain with the statutory authority, configured provider, or authorized human reviewer named by the relevant domain process.[1] [2]

## References

[1]: ./STAKEHOLDER_JOURNEY_CATALOG.md "Stakeholder Journey Catalog"
[2]: ./JOURNEY_ENGINE_ARCHITECTURE.md "Journey Engine Architecture"
[3]: ./drizzle/0044_stakeholder_journey_engine.sql "Stakeholder Journey Engine Migration"
[4]: ./scripts/release/stakeholder-journey-migration-smoke.sql "Rollback-Only Journey Migration Smoke Test"
[5]: ./temporal/workflows/stakeholderJourneyWorkflow.ts "Reusable Stakeholder Journey Temporal Workflow"
[6]: ./temporal/stakeholderJourneyWorker.ts "Dedicated Stakeholder Journey Temporal Worker"
[7]: ./server/temporalClient.ts "Temporal Client Journey Extensions"
[8]: ./server/stakeholderJourneyMiddleware.ts "Cross-Language Journey Middleware"
[9]: ./go-services/portfolio-integration-gateway/main.go "Go Portfolio Integration Gateway"
[10]: ./client/src/pages/StakeholderJourneyHub.tsx "PWA Stakeholder Journey Hub"
[11]: ./mobile/src/screens/journeys/MobileJourneyHubScreen.tsx "Native Stakeholder Journey Hub"
[12]: ./docker-compose.production.yml "Production Compose Journey Worker Wiring"
[13]: ./server/daprPortfolioEventConsumer.ts "Dapr Portfolio Event Evidence Consumer"
[14]: ./server/integrationReadinessService.ts "Integration Readiness Gates"
[15]: ./monitoring/stakeholder_journey_alerts.yml "Stakeholder Journey Prometheus Alerts"
