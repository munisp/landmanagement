# Change Manifest — 2026-04-25

This manifest records the **actual code and documentation changes** made during the current restored-project implementation pass after recovering the authoritative full archive.

## Source files changed

| File | Change summary |
| --- | --- |
| `server/_core/alertNotifications.ts` | Replaced the remaining alert-email placeholder path with the platform's live email service so integration and system alerts use a real delivery mechanism instead of a TODO branch. |
| `server/bulkImport.ts` | Removed the hardcoded parcel import owner assignment and added a get-or-create imported-owner flow that provisions real user records from imported owner names. |
| `server/reporting.ts` | Replaced mock Excel export behavior with real workbook generation using `exceljs`, replaced mock PDF export behavior with actual PDF generation using `pdfkit`, wired scheduled report delivery to the live email service, and replaced mocked report queries with real database-backed transaction, parcel, and revenue retrieval. |
| `server/adminService.ts` | Replaced the mock user-activity endpoint with a database-backed login-attempt activity query for the admin workspace. |
| `server/auditLog.ts` | Replaced the mock audit trail with file-backed persistent audit logging and filtered retrieval so CRUD and approval events can be retained and exported locally. |
| `server/gdpr.ts` | Replaced the placeholder privacy module with a practical database- and file-backed implementation for export, rectification, erasure, portability, consent logging, breach logging, and retention cleanup. |
| `server/creditBureauService.ts` | Replaced randomized credit bureau simulations with deterministic bureau fallback reports so mortgage underwriting remains reproducible and stable across runs. |
| `server/documentVerificationService.ts` | Removed the remaining random fraud-formatting branch so document-verification outcomes are deterministic and reproducible during validation and smoke testing. |
| `server/executiveAnalyticsService.ts` | Replaced the mock executive revenue breakdown with a real grouped transaction query so analytics totals now reflect actual transaction types and amounts. |
| `server/mfa.ts` | Replaced the WebAuthn verification bypass with a trusted-device credential check so MFA no longer accepts every WebAuthn attempt unconditionally. |
| `server/_core/security.ts` | Replaced the placeholder API-key validation branch with database-backed validation through the existing API key service, plus a deterministic environment-key fallback using constant-time comparison for degraded or offline database conditions. |
| `server/analytics.ts` | Replaced the remaining analytics dashboard mock layer with real database-backed metrics, trends, fraud alerts, AI-style predictions, and CSV exports derived from transactions, parcels, users, activity logs, and security events. |
| `client/src/pages/AnalyticsDashboard.tsx` | Replaced the remaining frontend mock analytics metrics, fraud-alert cards, transaction-type breakdown, revenue history chart, and user-activity placeholders with live backend-driven executive analytics data. |
| `server/services/notificationService.ts` | Replaced the queued-notification mock email sender with the platform’s live email service and added a deterministic offline HTML fallback so notification delivery no longer depends on randomized simulated sends. |
| `client/src/pages/AuditTrail.tsx` | Replaced the static mock audit-log table with live backend-driven audit export and statistics data, including real filtering, CSV export, and summary cards backed by the persistent audit store. |
| `server/brokerCommissionAutomation.ts` | Replaced synthetic commission-statement and tax-document URLs with generated broker document artifacts stored under the project data directory, so payout workflows now produce concrete deliverables instead of placeholders. |
| `client/src/pages/AdminDashboard.tsx` | Replaced static admin summary cards, pending workflow lists, recent activity, and analytics panels with live backend-driven data from admin, transaction, verification, and parcel queries, while preserving resilient fallbacks for partial responses. |
| `END_TO_END_AUDIT_WORKING_NOTES_20260415.md` | Added updated restored-project smoke-test findings covering the live dev server, dashboard rendering, transaction launcher rendering, document workflow rendering, mortgage dashboard rendering, and final validation status. |

## Validation performed after the current changes

| Step | Result |
| --- | --- |
| Direct TypeScript compiler check | Pass (`./node_modules/.bin/tsc --noEmit --pretty false`) |
| Repeated TypeScript validation after each major slice | Pass |
| Production build | Pass (`npm run build`) |
| Local runtime start | Pass (`npm run dev` on port `3000`) |
| Browser smoke verification | Landing page, operational dashboard, transaction launcher, document validation route, and borrower mortgage dashboard all rendered successfully |

## Notes

This manifest intentionally lists only the files changed during the **current restored-project and attachment-driven pass**, not all earlier work already contained in the larger recovered archive.
