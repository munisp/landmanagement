# Identity, Authorization, Verification, and Workflow Integration Checklist

## Operating Principle

Activate the dependencies in the order below. Do **not** activate participants merely because a browser flow is visible. In this platform, the server will allow activation only after Keycloak provisioning, Permify policy synchronization, identity verification, and document verification have completed. Activation is then written with an outbox event for Dapr delivery.

## 1. Prepare the Target Environment

Use a secret manager to populate the production environment; do not copy development values into the deployment. The application already fails closed when its required Keycloak, Permify, PostgreSQL, Redis, and workflow settings are absent.

| Owner | Required work | Relevant configuration | Exit gate |
|---|---|---|---|
| Platform operations | Deploy private PostgreSQL and Redis, apply all migrations, create backups, and test restoration before identity traffic is enabled. | `POSTGRES_URL`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `REDIS_URL`, `REDIS_PASSWORD` | Application can read/write onboarding records and outbox events; restoration test is recorded. |
| Security | Set public origins, TLS termination, CSP/origin rules, application encryption keys, and secret rotation ownership. | `FRONTEND_URL`, `VITE_APP_URL`, `ALLOWED_ORIGINS`, `ENCRYPTION_KEY`, `JWT_SECRET` | Only approved origins can reach the PWA and API; secrets are injected rather than committed. |
| Product operations | Decide the approved stakeholder sectors, role catalogue, verification policy, escalation route, and invitation-delivery channel. | Role model is enforced in `stakeholderOnboardingService.ts`. | Named service owners approve the activation playbook. |

## 2. Integrate Keycloak First

Configure Keycloak before Permify or onboarding mutations. The application provisions users through the Keycloak Admin API with a service-account token, creates users with `UPDATE_PASSWORD`, and assigns validated realm roles.

| Step | Action | Acceptance evidence |
|---|---|---|
| 2.1 | Deploy Keycloak and its private database. Import/bootstrap the target realm, enable HTTPS, configure password policy, MFA policy, session limits, and email delivery. | Keycloak health is green; realm bootstrap completes without default credentials. |
| 2.2 | Create the PWA and native OIDC clients with exact production redirect URIs and allowed web origins. Configure PKCE for the native client. | Browser and native authorization-code flows complete; tokens contain the expected issuer, audience, subject, and realm roles. |
| 2.3 | Create the administrator service account used by the server. Grant only the rights needed to create users, look up users, assign realm roles, update profiles, reset passwords, and require TOTP. | A short-lived client-credentials token succeeds; an intentional unauthorized admin operation fails. |
| 2.4 | Populate `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_ADMIN_REALM`, `KEYCLOAK_ADMIN_CLIENT_ID`, and `KEYCLOAK_ADMIN_CLIENT_SECRET`. | The platform’s Keycloak health/provisioning action succeeds for a non-production test account. |
| 2.5 | Create the sector realm roles exactly as implemented, such as `land_citizen`, `land_surveyor`, `land_registrar`, and `land_admin`, plus the corresponding mining, water, forestry, agriculture, fisheries, energy, and petroleum roles. | Admin onboarding can provision a test user and assign the selected validated role. |

> Do not distribute an invitation token through an unapproved channel. The platform issues one-time random tokens with a seven-day expiry; operations should deliver them through a controlled email, SMS, or identity-proofed service process.

## 3. Integrate Permify Second

Permify is the runtime authorization authority, not a display-only roles database. The service publishes the versioned `permify/landmanagement.perm` schema, removes stale mutable role tuples, writes the current role relation, and performs permission checks against the active schema version.

| Step | Action | Acceptance evidence |
|---|---|---|
| 3.1 | Deploy Permify privately, create a dedicated tenant, enable TLS/authentication where supported, and configure retention/audit logs. | Health probe and authenticated request succeed from the application network only. |
| 3.2 | Populate `PERMIFY_URL`, `PERMIFY_TENANT_ID`, and, where enabled, `PERMIFY_AUTH_TOKEN` and `PERMIFY_TIMEOUT_MS`. | The application rejects missing or invalid configuration rather than bypassing authorization. |
| 3.3 | Publish the repository schema to the target tenant via the application’s schema publication path. Record the returned schema version and PostgreSQL schema-hash record. | The schema hash/version is stored; rerun is idempotent when schema has not changed. |
| 3.4 | Test a role synchronization: provision a user, invoke policy synchronization, inspect the global `member` plus role relation, and confirm global geo relations exist. | A permitted action returns allow; the same action for a disallowed user returns deny. |
| 3.5 | Test a role change/demotion. | Old role tuples are removed and the former privilege is immediately denied. |

## 4. Integrate Identity and Document Verification

The application already expects a private `IDENTITY_SERVICE_URL` and fails closed when it is not configured. Its identity router calls `/verify/nin`, `/verify/bvn`, and `/status/:userId` with bounded timeouts; only authorized administrative/registrar roles can list verification records. Document verification must update the onboarding verification fields through a separate authenticated, auditable verifier workflow.

| Stream | Next action | Acceptance gate |
|---|---|---|
| Identity verification | Select and contract an approved jurisdiction-appropriate identity provider or deploy an approved verifier. Implement the private API contract expected by the platform, protect it with service authentication, rate limits, encryption, retention rules, and auditable decisions. | A valid sandbox identity is verified; an invalid/mismatched identity fails; a provider timeout produces a recoverable pending/error state, not an activation. |
| Document verification | Deploy a private document-intake, malware-scan, OCR/extraction, fraud-signal, reviewer-workflow, and immutable-decision pipeline. Store source files in approved encrypted object storage; send only minimum necessary derived evidence to the application. | A reviewer can accept/reject a test document with provenance; duplicate, altered, unsupported, and malware test files are rejected or quarantined. |
| Orchestration | Map successful verified outcomes to the existing onboarding record fields `ninVerified` and `documentsVerified`; do not let the browser set them. | The activation procedure remains denied until both verified values are present. |

For KYB or institutional verification, use a separate business-verification workflow and require human resolution for exceptions. Do not treat OCR extraction alone as a legal or identity decision.

## 5. Integrate Dapr and Durable Workflows Last

Dapr starts only after identity, authorization, and verification produce reliable records. Stakeholder activation is an atomic PostgreSQL update plus an `eventOutbox` record with topic `stakeholder-activated`, event type `stakeholder.activated.v1`, and delivery status `pending`. A Dapr publisher must deliver that outbox event idempotently.

| Step | Action | Configuration / evidence |
|---|---|---|
| 5.1 | Deploy Dapr sidecars on private application/workflow services and configure the approved pub/sub component, state store, secret store, resiliency/retry policy, and tracing. | `DAPR_HTTP_URL`, `DAPR_GRPC_URL`, `DAPR_STATE_STORE`, `DAPR_PUBSUB_NAME`; components pass health probes. |
| 5.2 | Deploy the outbox publisher/worker with a consumer idempotency store keyed by event ID or aggregate/version. Configure dead-letter handling and alerting. | A manually created test activation event is delivered once; retry does not duplicate downstream effects; poison event lands in the dead-letter path. |
| 5.3 | Connect Temporal workers/schedulers after Dapr is healthy. Use the existing queues for commercial billing, Context Globe reconciliation, GeoAI work, and property workflows; retain TLS in production. | `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, task queues, TLS certificate/key; a test workflow starts, executes an activity, completes, and is visible in Temporal history. |
| 5.4 | Observe the whole activation sequence. | Admin invite → Keycloak account → Permify tuples → identity/document verification → activation → outbox event → Dapr delivery → first task is traceable by correlation ID. |

## 6. Final Role-Based Acceptance Test

Use disposable test accounts for each stakeholder class: public/citizen, field surveyor or inspector, registrar, lender, conveyancer, assessor, institutional administrator, provider, and integration client. Verify that each person sees the correct Getting Started state, can complete only their assigned prerequisites, reaches the right first workflow after activation, and is denied from every unauthorized workflow.

Do not enable live participant activation until all steps above pass in a pre-production environment and the following rollback conditions are tested: disable the onboarding mutation feature flag or gateway route; suspend Dapr consumers; revoke the Keycloak service account; disable the affected Permify tenant/schema version; and preserve the PostgreSQL audit and outbox records for investigation.
