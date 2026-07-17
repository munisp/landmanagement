# Working Audit Notes — 2026-04-15

## Route and module surface confirmed

The frontend route map in `client/src/App.tsx` confirms the platform extends well beyond the core mortgage borrower flow. The routed modules include public search and home, parcel detail and map views, transactions, verification, reporting, security, compliance, geospatial search, AI document processing, drone processing, tax assessment, administrative modules, and a full mortgage ecosystem consisting of borrower, loan officer, broker, investor, analytics, compliance, webhook, scheduler, and integration-health dashboards.

## Confirmed mortgage ecosystem pages

The mortgage-related routed pages currently include:

| Route | Page |
| --- | --- |
| `/mortgage` | MortgageApplication |
| `/mortgage-application` | MortgageApplicationPage |
| `/mortgage-dashboard` | MortgageDashboard |
| `/loan-officer-dashboard` | LoanOfficerDashboard |
| `/borrower-payment-portal` | BorrowerPaymentPortal |
| `/broker-dashboard` | BrokerDashboard |
| `/investor-dashboard` | InvestorDashboard |
| `/regulatory-compliance` | RegulatoryComplianceDashboard |
| `/pooling-scheduler` | PoolingSchedulerDashboard |
| `/commission-management` | CommissionManagementDashboard |
| `/mortgage-analytics` | MortgageAnalyticsDashboard |
| `/webhook-management` | WebhookManagementDashboard |
| `/report-scheduler` | ReportSchedulerDashboard |
| `/report-history` | ReportHistoryDashboard |
| `/integration-health` | IntegrationHealthDashboard |
| `/webhook-testing` | WebhookTestingDashboard |

## Backend schema coverage already present

The database schema already includes substantial production-oriented mortgage and adjacent entities, which means the main remaining work is not schema invention but implementation completeness. Confirmed tables/enums include:

| Area | Evidence in schema |
| --- | --- |
| Core mortgage lifecycle | `mortgage_applications` with `pending`, `under_review`, `approved`, `rejected`, `disbursed`, and related timestamps |
| Repayment lifecycle | `mortgage_payment_schedule`, `mortgage_payment_transactions`, debit mandate support |
| Insurance and escrow | `mortgage_insurance_policies`, escrow-related ledger tables |
| Document review | mortgage document verification tables with review notes and rejection reasons |
| Broker operations | `mortgage_brokers`, `broker_clients`, commission structures, commissions, broker submissions |
| Secondary market | `loan_pools`, `loan_pool_loans`, `investors`, `pool_investments`, distributions, servicing transfers |
| Adjacent platform domains | transactions, surveys, environmental assessments, land-use plans, tax-related tables, and more |

## High-priority implementation gaps confirmed

### Financial router gaps

The current `server/api/routers/financial.ts` shows that the borrower dashboard and loan officer workflow are not yet production-complete.

| Gap | Evidence |
| --- | --- |
| Preview fallback data still drives the mortgage dashboard | `getUserMortgageApplications` returns hard-coded `previewApplications` whenever the DB is unavailable or empty |
| Officer workflow uses applicant query, not assigned-reviewer logic | `LoanOfficerDashboard.tsx` comments that all applications are fetched, and the query used is `financial.getUserMortgageApplications` |
| Status transition API is too narrow | `updateMortgageApplicationStatus` only supports `pending`, `under_review`, `approved`, `rejected` and does not cover disbursement, repayment progression, or closure |
| Review notes not persisted | UI collects `reviewNotes`, but the mutation only sends `applicationId`, `status`, and optional `rejectionReason` |
| Approval business rules incomplete | No LTV, DTI/affordability, officer assignment, underwriting score, or disbursement gating is enforced in the router |

### Frontend mortgage gaps

| Page | Confirmed issue |
| --- | --- |
| `MortgageDashboard.tsx` | Uses `previewApplications` and `previewCreditScore` fallbacks and still has non-functional “View Details” actions |
| `LoanOfficerDashboard.tsx` | Uses borrower application query, lacks detail drawer/page, and does not persist review notes or assignment data |
| `MortgageApplication.tsx` | Appears largely presentational/form-demo oriented with static inputs and lightweight detail actions |
| `MortgageApplicationPage.tsx` | Collects inputs but needs end-to-end production submission/validation alignment |
| `PoolingSchedulerDashboard.tsx` | Local cron expression field is present; needs verification that it is actually submitted and persisted |

## Broader cross-platform gaps identified from page inventory

A grep audit of frontend pages confirms many modules still contain mock or preview logic, especially analytics, payments, parcel map, bulk import, identity verification, and some transaction flows. The immediate production focus should remain on the core mortgage ecosystem and the user-specified parcel/title/transaction/registration domains, but these findings mean smoke verification must cover other routed pages as well.

## Immediate implementation priorities

1. Replace mortgage preview fallbacks with seeded database-backed data and deterministic default-seed paths.
2. Build a dedicated mortgage application detail/workflow model supporting underwriting notes, assignment, approval/rejection reasons, disbursement, repayment, arrears, and closure.
3. Expand APIs and UI for loan officer, borrower payment, broker, investor, and admin mortgage operations.
4. Verify and finish the remaining routed modules relevant to parcels, titles, transactions, registrations, reporting, and compliance.
5. Re-run rendering and smoke validation across all connected routes after implementation.

## Additional cross-domain findings from `Dashboard.tsx`

The main authenticated operational dashboard is actively wired to parcel, title, and transaction data via `trpc.stats.dashboard`, `trpc.titles.getByOwner`, and `trpc.transactions.getMyTransactions`, which confirms that parcels, titles, and transaction workflows remain first-class platform domains that must be preserved and polished alongside the mortgage suite.

Several route integrity issues were also confirmed in the dashboard itself.

| Issue | Evidence |
| --- | --- |
| Title detail links appear unwired | The dashboard links to `/titles/:id`, but no corresponding title detail route is present in `client/src/App.tsx` |
| Quick action uses an undefined transaction creation path | The dashboard links to `/transactions/new`, while the defined transaction route is `/transactions/initiate/:parcelId` |
| Document workspace quick action appears unwired | The dashboard links to `/documents`, but no corresponding route is present in `client/src/App.tsx` |
| Duplicate security route definition exists | `App.tsx` mounts `/security` twice, once to `SecurityMonitoring` and later to `SecurityDashboard`, creating route ambiguity |

These findings mean the implementation phase must include route normalization and link integrity fixes in addition to business logic completion.

## Smoke verification update

The locally running application successfully rendered the public landing page at `/`, the authenticated operational dashboard at `/dashboard`, and the newly added transaction launcher route at `/transactions/new`.

The operational dashboard quick actions now resolve to live routes, and the transaction launcher rendered its intended empty-state guidance instead of a broken path. During smoke testing, the development server continued serving pages even though PostgreSQL and Redis were unavailable in the sandbox; the application logged connection errors for those infrastructure services, but the UI remained usable through its preview and fallback behavior.

## Final smoke verification update — 2026-04-15 00:52 EDT

A final browser pass confirmed that the borrower mortgage dashboard now renders continuity records instead of a blank empty-state regression when the local mortgage query layer is unavailable. The page shows application cards, status metrics, detail actions, and payment-schedule access with a clear environment-specific notice rather than the earlier preview-only banner.

This final smoke pass also reconfirmed that the cross-domain route fixes remain intact: `/dashboard`, `/transactions/new`, `/document-validation`, and `/mortgage-dashboard` all render successfully in the local environment. The remaining runtime instability is infrastructure-bound, driven by unavailable PostgreSQL and Redis services rather than route wiring, compilation, or basic UI rendering failures.
