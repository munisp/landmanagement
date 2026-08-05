# Identity, Authorization, Verification, and Workflow Integration Release

**Author:** Manus AI

**Scope:** Deployment-hardening release for Keycloak, Permify, provider-verified identity and documents, Dapr delivery, and Temporal activation.
**Status:** Repository implementation validated; target-environment activation remains intentionally fail-closed until approved service endpoints, credentials, and secrets are supplied.

## Delivered controls

| Area | Implemented control | Safety boundary |
|---|---|---|
| Keycloak | The bootstrap script now requires explicit approved web origins and redirect URIs, rejects wildcard origins, verifies the role catalogue, and confines the provisioning client to the target realm. | A realm mismatch or absent configuration stops bootstrap rather than granting cross-realm administration. |
| Permify | The application waits for the private authorization service, publishes/validates the versioned model through administrator preflight, and pins the deployed Permify image to `v1.7.2`. | Tenant ID and database secret are mandatory; authorization ports are no longer published by Compose. |
| Integration preflight | `integrationReadiness.preflight` is administrator-only and checks configured Keycloak, Permify, private verification endpoints, Dapr components, and Temporal configuration. | Diagnostic detail is not exposed to ordinary participants. |
| Document verification | Simulated OCR, sample documents, heuristic auto-approval, and mock outcomes were removed. The server calls a private verifier at `/v1/documents/analyze` with an idempotency key and validates the returned provider evidence. | Documents can never be auto-approved by a provider result; an administrator must record a reviewed decision with notes. |
| Provider callbacks | `/api/v1/verification/webhook` validates an HMAC SHA-256 signature over the raw request body, deduplicates `eventId`, stores evidence hashes/references, and records an outbox event. | Callback callers cannot activate a stakeholder or submit unverified identity state. |
| Dapr delivery | The app declares verification subscriptions, persists every CloudEvent in a PostgreSQL inbox, and starts a deterministic Temporal workflow per event. | At-least-once pub/sub delivery cannot create duplicate activation workflows. Failed starts are persisted and returned for retry/dead-letter handling. |
| Temporal activation | A dedicated onboarding-activation worker reconciles the existing Keycloak, Permify, identity, document, and invitation prerequisites. | It activates only when every existing prerequisite is true; unmet prerequisites return a non-failing pending reason. |

## Deployment sequence

| Order | Operator action | Acceptance evidence |
|---|---|---|
| 1 | Apply migrations `0041_onboarding_verification_integration.sql` and `0042_dapr_verification_inbox.sql` after the earlier ordered migrations. | `verification_provider_events`, `onboarding_verification_evidence`, and `dapr_inbox_deliveries` exist; `verification-control` product is seeded. |
| 2 | Configure Keycloak realm, target-realm administration client, exact HTTPS origins, callback URLs, and database secret. | `keycloak-bootstrap` completes successfully; administrator preflight reports the OIDC and role checks ready. |
| 3 | Configure Permify tenant, token where enabled, database secret, and private endpoint. | The service is healthy and administrator preflight reports the model version published. |
| 4 | Configure approved identity and document-verifier private URLs, their credentials, and `VERIFICATION_WEBHOOK_SECRET`. | Health probes pass; a provider callback with a valid HMAC creates a deduplicated evidence record. |
| 5 | Configure Dapr app ID, pub/sub, state store, Kafka connectivity, and dead-letter topic monitoring. | `GET /dapr/subscribe` returns the verification subscriptions and Dapr metadata lists the configured components. |
| 6 | Configure the onboarding activation Temporal task queue and start `onboarding-activation-temporal-worker`. | A verification CloudEvent creates one inbox delivery and one deterministic workflow; only complete prerequisites activate the stakeholder. |

## Validation evidence

| Gate | Result |
|---|---|
| TypeScript compiler | Passed after Keycloak/Permify preflight, provider verification, Dapr inbox, and Temporal worker changes. |
| Production PWA/server build | Passed. |
| Keycloak bootstrap syntax | Passed with `sh -n`. |
| Production Compose structure | Passed with no interpolation/startup; the only warning is the pre-existing obsolete Compose `version` field. |
| PostgreSQL 16 smoke database | Passed after correcting the verification product seed to the actual commercial-product schema; all three new tables and the product seed were verified. |
| Integration marker audit | Passed: no simulated verification, mock result, sample-document, placeholder, or random-result marker remains in the active integration files. |

## Required target-environment evidence before enabling stakeholder activation

The implementation cannot prove a real provider connection without operator-controlled credentials and service endpoints. Before enabling onboarding activation for live users, the deployment owner must retain evidence of the following: a successful Keycloak bootstrap; a successful Permify schema and tuple check; an approved verifier health probe; an HMAC-signed provider callback with a non-production test subject; Dapr delivery into the persistent inbox; the corresponding Temporal workflow execution; and an administrator-reviewed document decision. Any failed preflight check must keep the account out of the active state.
