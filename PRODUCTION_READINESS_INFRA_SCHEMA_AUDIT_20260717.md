# Infrastructure and Schema Audit — 2026-07-17

## Current repository state

The restored repository is materially more complete than the initially visible checkout. The production-readiness archive contains the full frontend, backend, Drizzle schema, migrations, infrastructure scripts, and deployment assets. The current working repository has therefore been restored from the latest comprehensive archive before continuing the audit.

## Integration coverage audit

| Integration / dependency | Current status | Evidence | Audit conclusion |
| --- | --- | --- | --- |
| **PostgreSQL** | Present and materially integrated | `server/db.ts`, `server/_core/database.ts`, `drizzle/schema.ts`, `drizzle.config.ts`, `docker-compose.yml` | **Integrated**, but still needs validation against the newly added feature domains and missing account / integration governance tables. |
| **Drizzle ORM** | Present and heavily used | `drizzle/schema.ts`, multiple routers/services import Drizzle tables and queries | **Integrated**, with broad schema coverage; audit focus should shift from wholesale absence to targeted missing tables and consistency gaps. |
| **Redis** | Present and integrated | `server/_core/cache.ts`, `server/health.ts`, `server/rateLimit.ts`, `docker-compose.yml` | **Integrated**, but not yet uniformly represented in the integration monitoring surface requested by the user. |
| **Temporal** | Present and integrated | `server/temporalClient.ts`, `temporal/workflows/propertyTransactionWorkflow.ts`, `temporal/worker.ts`, integration health references | **Integrated**, but should be included in the broader end-to-end infrastructure matrix and smoke validations. |
| **TigerBeetle** | Present but partial | `server/tigerBeetleClient.ts`, `server/_core/externalClients.ts`, `tigerbeetle-service/`, deployment docs | **Partially integrated**. Runtime client and health visibility exist, but deeper platform-wide accounting usage and schema-backed governance need review. |
| **Lakehouse / Iceberg** | Present but incomplete | `server/lakehouseClient.ts`, `lakehouse/api/main.py`, `lakehouse/catalog/iceberg_catalog.py`, deployment docs | **Partially integrated**. The Python API still returns mock data or TODO placeholders when real catalog-backed queries are unavailable. |
| **Keycloak** | Absent | No runtime code, env vars, router, or infrastructure definitions found in code scan | **Missing integration**. Existing auth is centered on Manus OAuth; no Keycloak adapter or provider abstraction is present. |
| **APISIX** | Absent | No runtime code, env vars, compose service, router integration, or health checks found | **Missing integration**. Gateway-level routing and policy integration are not implemented. |
| **Permify** | Absent | No runtime code, env vars, router integration, or authorization adapter found | **Missing integration**. Fine-grained policy decision service is not wired. |
| **Dapr** | Absent | No runtime code, env vars, sidecar assumptions, pubsub/state usage, or service invocation integration found | **Missing integration**. No Dapr sidecar/client abstraction is present. |
| **Fluvio** | Absent | No runtime code or infrastructure references found | **Missing integration**. Event streaming is currently Kafka-oriented, not Fluvio-backed. |
| **OpenAppSec** | Absent | No runtime code, deployment manifests, or operational checks found | **Missing integration**. WAF / security enforcement integration is not represented. |
| **Open-source security / observability stack** | Partial | Prometheus/Grafana and some security infra exist; broader user-requested stack is incomplete | **Partially integrated**. Security and observability are present in pieces, but not across the full requested middleware set. |

## Schema coverage audit

The primary Drizzle schema is extensive and currently defines at least **62 tables**, covering core users, comments, activity logs, saved searches, verification, reporting, webhooks, security events, field data, blockchain records, parcels, transactions, API keys, Mojaloop payments, mortgages, tax, insurance, legal, survey, environmental, marketplace, brokers, and secondary-market workflows.

That means the schema problem is **not** broad domain absence. Instead, the main schema risks now cluster around:

| Schema area | Current status | Gap |
| --- | --- | --- |
| **Identity federation / SSO governance** | No Keycloak-specific identity, realm, client, mapper, or external principal linkage tables found | Needs schema support if Keycloak is to be integrated cleanly alongside the current OAuth-backed user model. |
| **Authorization policy sync / decision audit** | No Permify-oriented authorization relation tuples, policy sync records, or decision audit tables found | Needs schema support for durable policy synchronization and authorization traceability. |
| **Gateway / API management governance** | No APISIX route, upstream, consumer, plugin, or sync-status tables found | Needs persistence for managed gateway resources if APISIX integration is implemented. |
| **Dapr state / workflow integration metadata** | No Dapr component registry, pubsub topic subscriptions, state-sync, or invocation audit tables found | Needs persistence for platform-managed Dapr usage. |
| **Fluvio streaming governance** | No Fluvio topic, producer/consumer, offset checkpoint, or dead-letter tracking tables found | Needs schema support if Fluvio is added as a first-class streaming option. |
| **OpenAppSec policy / event tracking** | No WAF policy deployment, enforcement status, blocked-request, or incident audit tables found | Needs persistence if OpenAppSec is to be integrated as requested. |
| **Lakehouse ingestion / export audit** | Existing platform schema is rich, but no clearly dedicated lakehouse ingestion job, sync cursor, export batch, or query audit tables were confirmed in the current pass | Needs explicit persistence to make lakehouse synchronization deterministic and auditable. |
| **Integration registry / health snapshots** | Several health utilities exist, but there is no unified schema-owned integration catalog covering all requested external systems | Needs durable integration inventory and sync-state tracking. |
| **Account sessions / MFA governance expansion** | Account settings and MFA logic exist, but the primary schema review should confirm session, trusted-device, and factor-challenge persistence consistency | May require targeted schema additions or normalization. |

## Immediate remediation priorities

| Priority | Work item | Rationale |
| --- | --- | --- |
| 1 | Add missing infrastructure client abstractions and health-check coverage for **Keycloak, APISIX, Permify, Dapr, Fluvio, OpenAppSec, and Lakehouse** | These are the clearest user-requested gaps and the largest current integration absences. |
| 2 | Add schema tables for **integration registry, sync jobs, auth federation, authorization audit, gateway resources, streaming checkpoints, WAF incidents, and lakehouse ingestion audit** | This closes the most obvious persistence gaps across the requested middleware set. |
| 3 | Extend deployment and environment assets to provision or describe the missing services | Current compose and env assets cover PostgreSQL, Redis, and some existing services, but not the full requested stack. |
| 4 | Re-run compile and smoke validation once the missing runtime modules and schema additions are implemented | The repository must be validated again after the new integrations are wired. |

## Working conclusion

The platform is **not yet fully integrated** for the complete requested stack. PostgreSQL, Drizzle, Redis, and Temporal are real integrations. TigerBeetle and the lakehouse are only **partial**. Keycloak, APISIX, Permify, Dapr, Fluvio, and OpenAppSec are currently **missing** as first-class runtime integrations. The schema is already broad for product domains, but it still lacks several governance, federation, streaming, gateway, lakehouse, and security-policy tables needed to support the requested infrastructure comprehensively.
