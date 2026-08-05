# Remaining Governed Commercial Portfolio Release

**Release date:** 2026-08-05 EDT
**Scope:** The applications recommended after the first commercial release, including Registry Operations Cloud, Right-of-Way and Land Access Manager, Valuation and Property-Tax Operations, Development and Acquisition Intelligence, Resilience and Exposure Monitor, Property Data and Integration API, Land Market and Planning Analytics, Rural Land and Agribusiness Service Hub, and Trusted Service Directory.

## Implemented Product Contracts

| Product | Durable workflow and commercial control | PWA/API delivery | Explicit boundary |
|---|---|---|---|
| Registry Operations Cloud | Queues, request cases, SLA state, assignment, review, append-only events, product entitlement | `registryOperations` authenticated API and `/registry-operations-cloud` | Does not alter statutory registry records. |
| Right-of-Way Manager | Corridors, bounded findings, agreements, field confirmations, reviewer actions | `rightOfWay` authenticated API and `/right-of-way-manager` | Does not decide land rights, acquisition, easements, or safety. |
| Valuation & Property-Tax Operations | Assessment evidence, human issue, appeals, verified exact payment references | `taxOperations` authenticated API and `/valuation-tax-operations` | Does not generate an automated valuation, tax decision, or appeal outcome. |
| Acquisition Intelligence | Data rooms and source-provenanced due-diligence items | `portfolioProducts` API and `/commercial-portfolio` | Does not provide investment advice or an acquisition decision. |
| Resilience & Exposure Monitor | Exposure portfolios, assets, attributed snapshots, Context Globe-compatible source references | `portfolioProducts` API and `/commercial-portfolio` | Does not provide safety, insurance, underwriting, emergency, or investment decisions. |
| Property Data API | Purpose-bound hashed clients, approved scopes, immutable usage records, minimized factual parcel projection | `/api/property-data/v1/parcels/:parcelNumber` | Does not expose personal data or provide ownership, valuation, legal, credit, or transaction decisions. |
| Planning Analytics | Minimum-cohort suppression and reviewed aggregate reports | `portfolioProducts` API and `/commercial-portfolio` | Suppresses small cohorts and prohibits re-identification. |
| Rural Hub | Consent-referenced rural service cases | `portfolioProducts` API and `/commercial-portfolio` | Does not score rights or make eligibility decisions. |
| Trusted Service Directory | Provider verification lifecycle, consent-backed service requests, disputes | `portfolioProducts` API and `/commercial-portfolio` | Does not sell ownership data or auto-resolve disputes. |

## Cross-Language Middleware

| Language | Implemented service | Production purpose |
|---|---|---|
| TypeScript | Commercial workflow services, typed Drizzle schema, tRPC routers, Property Data HTTP endpoint, PWA routes | Tenant entitlement, input validation, human-review state machines, transaction-safe persistence, and browser delivery. |
| Go | `portfolio-integration-gateway` | HMAC-authenticated bounded integration event ingress, idempotency key propagation, optional private Dapr topic publication, readiness, and metrics. |
| Rust | `portfolio-spatial-engine` | Authenticated bounded WGS84 corridor/asset and asset/event proximity calculation, with explicit non-decision output. |
| Python | `lakehouse/portfolio` and `/portfolio-analytics` | Cohort-suppressed planning aggregates, attributed exposure layer counts, and non-profiling usage rollups. |

## Deployment and Commercial Controls

The release adds migrations `0037` through `0040`, product seeds, common subscriptions/invoices/usage controls, verified commercial payment flow from the prior release, commercial billing Temporal workers, private Go/Rust services, a Dapr sidecar for portfolio events, and a restored primary PostgreSQL and Redis service in production Compose. The deployment template requires `POSTGRES_PASSWORD`, `PORTFOLIO_INTEGRATION_SECRET`, `PORTFOLIO_SPATIAL_ENGINE_SECRET`, and a portfolio Dapr pub/sub component. The configuration is intentionally fail-closed where a secret or provider is absent.

## Validation Evidence

| Gate | Result |
|---|---|
| TypeScript complete compiler check | Passed after all portfolio routers, schemas, HTTP API, and PWA routes were added. |
| Production web/server build | Passed. The bundler emitted existing large-chunk warnings but no build failure. |
| PostgreSQL 16 migrations | Passed. Migrations `0037`–`0040` created all nine inspected product tables and all nine seeded product definitions in the isolated database. |
| Go integration gateway | `GOTOOLCHAIN=local go test ./...` passed using Go 1.22. |
| Rust spatial engine | `cargo check` passed. The sandbox toolchain lacks `rustfmt`, so format/lint cannot be certified from this environment. |
| Python Lakehouse portfolio module | `py_compile` passed; focused Lakehouse suite passed with 13 tests. |
| Production Compose structure | Passed with audit-only required-secret values after restoring missing PostgreSQL and Redis service definitions. Compose reports only its existing obsolete `version` warning. |
| PWA browser check | Passed for `/commercial-portfolio`; the built route displayed all six remaining product selectors and controlled account activation. |

## Release Decision

This is a **repository-ready implementation release**, not a statement that a live customer environment is already operational. A target environment must still supply real Keycloak, PostgreSQL, Redis, MinIO/Iceberg, Dapr, Temporal, payment-provider, Lakehouse, monitoring, backup/recovery, and incident-response configuration. The live Property Data API, payment verification, provider verification, and integration publication must be exercised against those approved external services before a whole-platform production certification can be issued.
