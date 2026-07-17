# End-to-End Audit Working Notes — 2026-04-15

## Workspace and project baseline

The authoritative project for remediation is `/home/ubuntu/work/idlr_audit/idlr-pts-platform`. Existing archives show a large prior delivery footprint, including `/home/ubuntu/upload/pasted_file_gyxczS_idlr-pts-platform-COMPLETE-WITH-DEPS-20260226-030540.tar.gz`, while the corrected rebuilt archive currently present is `/home/ubuntu/work/idlr_audit/idlr-pts-platform-COMPLETE-UPDATED-20260415.tar.gz`.

The project is a Vite + React + TypeScript frontend with an Express + tRPC backend started from `server/_core/index.ts`. Runtime mounting occurs through `server/routers.ts`, which composes many domain routers, including financial, mortgage payment, credit bureau, mortgage insurance, document verification, mortgage broker, secondary market, regulatory compliance, webhook, analytics, search, unified dashboard, phase4, integration health, and cached parcel / transaction routers.

## Initial implementation-risk findings

The codebase surface is very large and contains many feature files, but the first audit pass confirms that breadth does not equal production completeness. Several services still rely on mock, preview, placeholder, or fallback logic. Early high-signal findings include the following:

| Area | Finding | Implication |
| --- | --- | --- |
| `server/routers.ts` | Parcel and related flows include hard-coded mock datasets when microservices are unavailable. | Core search and CRUD experiences are not consistently repository-backed. |
| `server/adminService.ts`, `server/auditLog.ts`, `server/reporting.ts`, `server/propertyPhotoAIService.ts`, `server/_core/security.ts`, `server/gdpr.ts` | Multiple modules explicitly mention mock implementations or placeholders. | Governance, reporting, security, and AI-adjacent features require hardening. |
| `server/api/routers/financial.ts` | Contains seed-oriented mortgage repository procedures, indicating local resilience work is partly present. | Mortgage remediation exists but still needs end-to-end validation against the live runtime path. |
| Deployment assets | `docker-compose.staging.yml` exists, but no top-level application `Dockerfile` was found in the current project scan. | Containerization is incomplete for reproducible end-to-end deployment. |
| Seed assets | SQL seed scripts exist under `scripts/`, but the runtime relationship between those scripts and the application’s fallback repositories remains unclear. | Seed strategy may be fragmented between database-only and file-backed fallback paths. |

## Domain research findings relevant to business rules

A legal workflow overview for Nigerian land registration indicates that title perfection and mortgage-related property transfer workflows should reflect a structured sequence that includes application for Governor’s consent, survey-plan charting through the Surveyor-General, assessment and payment of fees, endorsement of deed, stamping, and final registration at the Land Registry. The source further states that, in Lagos State, mortgage or transfer by deed is only complete after registration at the Land Registry, and that stamping is a precondition to acceptance for registration.

> "...the mode of transfer of an interest in land, sub-lease or mortgage must be by deed, such transfers shall be deemed to be complete only after the deeds have been registered at the Land Registry." — Mondaq summary of Lagos State Lands Registration Law 2015

These workflow stages should drive lifecycle states, validations, document requirements, and approval gates across parcel, title, mortgage, and transaction modules.

## Immediate audit priorities for next pass

The next audit pass should examine the active mortgage, parcel, title, transaction, document, and integration routers in detail; verify which UI pages are route-wired versus decorative; inspect Docker, nginx, scripts, and workflow assets for missing runtime pieces; and then implement repository-backed CRUD, search, seeded demo data, and lifecycle rules where mock or placeholder logic remains.

## Additional audit findings — middleware, deployment, UI, and service realism

A closer review of the active runtime confirms that the application starts from `server/_core/index.ts`, mounts tRPC at `/api/trpc`, initializes notification and dashboard WebSockets, starts an email queue processor, and launches an aggregation scheduler. However, there is no explicit Express `/health` or `/api/health` route in that entrypoint even though `nginx/nginx.conf` assumes those endpoints exist. This is a direct deployment-contract gap because the reverse proxy and CI smoke checks expect health endpoints that the app may not currently expose outside static or framework behavior.

| Area | Finding | Recommended remediation |
| --- | --- | --- |
| Runtime health contract | Nginx expects `/health` and `/api/health`, but the main server entrypoint visibly mounts only OAuth and `/api/trpc`. | Add first-class app and dependency health endpoints aligned with the proxy and CI expectations. |
| Middleware integrations | `server/_core/externalClients.ts` provides wrappers for Fabric, Mojaloop, TigerBeetle, Kafka, Temporal, and Elasticsearch, but several clients still rely on placeholder credentials, insecure defaults, or environment-only conditional initialization. | Harden client initialization, add graceful offline behavior, and surface config readiness in health responses and deployment assets. |
| Frontend UX | The router in `client/src/App.tsx` wires a very broad page surface, but the placeholder scan still finds explicit preview or static-only messaging in areas such as report preview, liveness verification, parcel map nearby-parcel behavior, and several search / builder components. | Replace placeholder-only interactions with real repository-backed or workflow-backed operations where feasible, and normalize empty states where a full external service is unavailable. |
| Backend service realism | Backend grep confirms many production gaps remain in admin activity logs, audit logging, reporting query execution, GDPR handling, MFA WebAuthn, alert notifications, executive analytics, commission statements, and general parcel fallback data. | Prioritize repository-backed persistence and operational fallbacks for user-visible services; document non-trivial external integrations that cannot be fully materialized locally. |
| Search and parcel domain | The main router still contains large mock parcel responses when microservices are unavailable. | Introduce local seeded repository-backed search data so parcel browsing, detail views, and transaction launch flows work without external parcel services. |

The active project therefore appears to be **buildable but not yet uniformly production-grade**. The strongest next implementation targets are: (1) local repository-backed parcel/title/transaction data and search to replace mock service responses, (2) health endpoint and deployment contract completion, (3) stronger integration health and middleware fallback wiring, and (4) removal of the most visible UI placeholder behaviors in user-facing dashboards and workflows.

## Live smoke verification update

The local application is serving successfully on port 3000 even while PostgreSQL and Redis are unavailable. Browser verification confirms that the landing page renders, the operational dashboard route loads, and the transaction launcher route at `/transactions/new` now resolves correctly instead of falling through to a broken path.

The borrower mortgage dashboard at `/mortgage-dashboard` also renders successfully. In the current offline local environment it presents continuity records and a disconnected-state banner, confirming that the fallback borrower experience remains usable for workflow verification when infrastructure services are unavailable.

A remaining production-readiness gap is still visible on the operational dashboard for the preview user: summary counts and linked-record panels remain empty, which indicates that seeded account-to-record linkage or dashboard aggregation fallback logic should still be strengthened before final packaging.

## Live smoke verification update — corrected runtime

After further diagnosis, the earlier mismatch was traced to two local runtime problems rather than the dashboard source itself: a stale production server (`node dist/index.js`) was still occupying port 3000, and the development server’s custom realtime/background services were interfering with local smoke verification.

The stale process was removed, and the development startup path was hardened so custom WebSocket services and background processors are disabled by default in development unless explicitly enabled by environment variables. This preserves production capability while preventing local Vite/HMR conflicts and noisy offline job failures during browser verification.

With that correction in place, the operational dashboard at `/dashboard` now renders correctly in the live browser with the new continuity fallback data visible. Verified live elements include populated summary cards showing **24 parcels**, **12 titles**, **8 transactions**, and **2 owned titles**, plus continuity-linked records such as `TL-CONT-2026-0001`, `TL-CONT-2026-0002`, `TXN-CONT-2026-001`, and `TXN-CONT-2026-002`.

The borrower mortgage dashboard at `/mortgage-dashboard` also renders successfully in the live browser with seeded continuity records. Verified live elements include a credit-score summary, lifecycle counts showing **3 total applications**, **1 approved**, **1 rejected**, and borrower application cards spanning `Under_review`, `Approved`, and `Rejected` workflow states.

This closes the previously observed operational-dashboard empty-state regression and materially improves the reliability of the local smoke-test environment for the remaining end-to-end verification pass.

## Additional browser smoke verification

Further live browser checks after runtime stabilization confirm that the transaction launcher at `/transactions/new` renders successfully. The page presents the transaction-initiation workflow, route-safe guidance for starting from a known parcel or title, and actionable paths back to parcel search or document verification. In the current preview-user context, the launcher gracefully reports that no linked title records were returned instead of failing or routing to a broken page.

The document workflow route at `/document-validation` also renders successfully in the live browser. The page shows a usable seeded document list, processing actions, and a result panel scaffold, confirming that the route is live and the user-facing workflow surface is accessible for smoke-test purposes.

## Restored full-project smoke verification update (2026-04-25)

The restored full project now starts successfully with `npm run dev` on port `3000`. PostgreSQL connectivity is available in the current environment, while Redis remains unavailable locally; the application continues to boot with degraded optional middleware behavior.

The landing page renders correctly. The operational dashboard also renders for the preview admin user and shows populated summary cards plus linked title and transaction records. The transaction launcher route at `/transactions/new` renders correctly, but still shows an empty linked-title state for the current preview account, which is now a business-data continuity gap rather than a routing failure.

The document validation route at `/document-validation` renders successfully after the latest implementation changes. The latest code changes also passed both TypeScript validation and a production build on the restored full project.

The borrower mortgage dashboard at `/mortgage-dashboard` was also re-verified on the restored full platform. It renders successfully in the current environment with the disconnected-state indicator, a credit score summary of **650**, application metrics showing **3 total applications**, **1 approved**, and **1 rejected**, and seeded borrower application cards covering `under_review`, `approved`, and `rejected` lifecycle states. This confirms that the mortgage continuity path remains intact after the latest reporting and bulk-import changes.

## Final smoke verification update — 2026-04-25

A final runtime verification pass was completed on the restored full project after the latest security, reporting, analytics, and deterministic workflow hardening.

| Route | Result | Notes |
| --- | --- | --- |
| `/` | Pass | Landing page rendered correctly with preview entry points. |
| `/dashboard` | Pass | Operational dashboard loaded with populated summary cards and linked records. |
| `/transactions/new` | Pass with expected empty-state continuity | Launcher rendered successfully and provided search-first guidance when the preview account had no linked title records. |
| `/document-validation` | Pass | Page resolved from loading state and displayed seeded documents with process actions. |
| `/mortgage-dashboard` | Pass with expected offline indicator | Borrower dashboard rendered successfully with seeded applications, lifecycle counts, and the disconnected local-environment banner. |

The current restored full project also completed a fresh production build successfully after the latest changes.
