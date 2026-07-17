# Remaining Scaffold Remediation Map — 2026-05-13

This note captures the concrete implementation work still required after the restored orphan-remediation pass. It focuses on routed pages that still rely on client-side mock data, simulated delays, or hardcoded records instead of repository-backed and tRPC-driven platform behavior.

| Priority | Surface | Current gap | Required backend work | Required frontend work | Notes |
|---|---|---|---|---|---|
| 1 | `client/src/pages/PaymentProcessing.tsx` | Uses `mockTransaction`, simulated processing delay, fake receipt download, manual fallback reference formatting | Add repository-backed payment domain for offline continuity, or extend existing payment router with file-backed fallback methods: `getByTransaction`, `process`, `confirm`, `downloadReceipt`. Reuse transaction repository and existing report generation to emit a real PDF or report-backed receipt artifact. Generate deterministic payment references and persist payment state. | Replace `mockTransaction` with `trpc.transactions.getById`. Prefill amount from transaction values. Remove artificial delay. Use real payment result reference and downloadable receipt response. Show transaction-based bank transfer and USSD references. | Existing `payments` router currently proxies to a microservice and lacks local fallback and receipt generation. |
| 2 | `client/src/pages/DisputeResolution.tsx` | Entire page uses hardcoded disputes array | Create `server/disputeRepository.ts` with seeded disputes, parties, parcel/title/transaction links, lifecycle states (`open`, `investigating`, `hearing`, `resolved`, `dismissed`), evidence metadata, and resolution notes. Mount a `disputes` router with list, getById, create, assign, transition, and stats procedures. Publish workflow events through middleware orchestrator on create/transition. | Replace local array with `trpc.disputes.list`. Add mutation wiring for creation and status transitions. Show seeded continuity records when offline fallback repository is serving. | High-value domain gap because dispute handling is core registry functionality. |
| 3 | `client/src/pages/GeoAnalytics.tsx` | Uses hardcoded `propertyValueData` and display-only analytics | Add `server/geoAnalyticsService.ts` or extend analytics domain with parcel- and transaction-derived geographic metrics grouped by state/LGA/land-use. Include parcel counts, average valuation proxies, title verification rates, transaction volumes, and hotspots. | Replace mock cards/charts with `trpc.analytics` or `trpc.geoAnalytics` queries. Render state/LGA summaries and transaction activity from backend-driven data. | Should use real parcel/title/transaction repositories rather than synthetic chart series. |
| 4 | `client/src/pages/Marketplace.tsx` and `MarketplaceListing.tsx` | Marketplace list uses hardcoded listings; listing page likely disconnected from real inventory lifecycle | Create `server/marketplaceRepository.ts` with seeded listings linked to parcel/title/owner/transaction data, listing lifecycle (`draft`, `active`, `under_offer`, `sold`, `delisted`), pricing, marketing metadata, and search filters. Mount `marketplace` router with list, getById, search, create, update, delist, and markUnderOffer procedures. | Replace mock listings with `trpc.marketplace.list/search`. Ensure cards and listing details resolve parcel and title context. | Route `/marketplace` currently points to `MarketplaceListing`, while `Marketplace.tsx` also exists; both should be audited and normalized. |
| 5 | `client/src/pages/PropertyValuation.tsx` | Uses hardcoded comparable sales, mock AVM, hardcoded parcel area | Add `server/valuationService.ts` using parcel data, recent transaction history, land-use type, state/LGA factors, parcel area, and title/verification quality. Expose comparable sales, estimated value range, confidence, and factor breakdown. | Replace mock AVM and hardcoded area with parcel search/selection + `trpc.valuations` query/mutation. Use repository-backed comparable transactions. | Must remain deterministic and work offline using seeded transaction history. |
| 6 | `client/src/pages/MortgageApplication.tsx` | Legacy list page still uses hardcoded applications | Reuse `mortgageApplicationRepository.ts` through an explicit list/query router procedure if not already exposed in the expected shape. | Replace hardcoded applications with `trpc.financial.getUserMortgageApplications` or a repository-backed list procedure and normalize UI states. | Lower effort because repository work already exists. |
| 7 | `client/src/pages/ParcelMap.tsx` | Still uses hardcoded `mockBoundaries` keyed by parcel id | No new domain required; extend parcel repository output normalization if needed to include `geometryGeoJSON`, centroid, or coordinate fields consistently. | Parse `parcel.geometryGeoJSON` when present. Otherwise derive polygon bounds from parcel latitude/longitude or seeded centroid and area. Remove hardcoded id-specific polygons. | This page is routed and already partly connected, but still contains scaffold geometry. |
| 8 | `client/src/pages/IdentityVerification.tsx` | Client-side mock NIN/BVN verification logic | Add or extend identity verification procedures with deterministic fallback logic for NIN/BVN/name/DOB matching. Persist verification request history, result reasons, and timestamps. If external APIs are unavailable, use hash/format/rule-based deterministic outcomes rather than random results. | Replace local verification with `trpc.identity.verifyNin` / `verifyBvn` style mutations, plus result history queries. | Needs domain rules consistent with Nigerian KYC workflows. |
| 9 | `client/src/pages/BlockchainExplorer.tsx` | Hardcoded blockchain transaction list | Audit existing blockchain router/service and expose list/history procedures compatible with offline continuity. If no local history store exists, add one seeded from existing blockchain integration metadata. | Replace local array with `trpc.blockchain.getTransactionHistory` and show real escrow / registry-chain events. | Route is user-facing and should reflect Fabric/Polygon workflow activity already integrated elsewhere. |
| 10 | `client/src/pages/AIDocumentProcessing.tsx` | Uses hardcoded processed document list | Extend document verification or AI processing service with list/history procedures returning processed documents, extraction metadata, confidence, and statuses. | Replace mock `processedDocs` with live query/mutation hooks. | Likely can reuse document verification service and stored processing artifacts. |
| 11 | `client/src/pages/BulkImport.tsx` | Mock CSV parsing and sample parsed rows | Backend import flow already exists in `server/bulkImport.ts`; expose or confirm parser/preview endpoint if absent. | Replace mock parse routine with real CSV parsing in browser and/or backend preview validation. Submit parsed data to live import procedures and surface row-level validation errors. | Must avoid fake sample rows. |
| 12 | `client/src/pages/BulkOperations.tsx` | Hardcoded CSV template/export content | Add or expose export/template procedures for parcels, titles, transactions, etc., producing real CSV headers and live exports from repositories. | Replace static template/download content with server-backed blob generation and real dataset export options. | Should align with actual domain schemas. |
| 13 | `client/src/pages/DocumentValidation.tsx` | Hardcoded document list | Expose document verification listing/history procedures from current verification service. | Replace mock list with tRPC query and real validation actions/results. | Route `/document-validation` is already used in smoke testing and still needs production-grade wiring. |
| 14 | `client/src/pages/PerformanceMonitor.tsx` | Fake real-time updates via `setInterval` | Expose performance summary from health/metrics services, including dependency status, queue lag, middleware readiness, and service uptime. | Replace simulated counters with polling against real health/metrics endpoints. | Can use polling rather than WebSockets because dev-mode socket conflicts were intentionally disabled. |
| 15 | `server/analyticsService.ts` | `getTransactionTrends()` and `getTransactionStatusDistribution()` still return mock data | Reimplement both methods using database queries where available and repository/file-backed aggregation fallback otherwise. | Any consumer pages should then receive real backend-driven charts. | Backend gap even if not directly tied to a listed scaffold page. |

## Routed mock-heavy surfaces confirmed in `client/src/App.tsx`

The following routed pages are still user-facing and therefore in scope for mandatory remediation:

- `/payments/:transactionId`
- `/disputes`
- `/geo-analytics`
- `/performance`
- `/identity-verification`
- `/valuation`
- `/mortgage`
- `/marketplace`
- `/ai-document-processing`
- `/document-validation` and `/document-verification`
- `/bulk-import`
- `/bulk-operations`
- `/blockchain`
- `/parcels/:id/map`

## Immediate implementation order

1. Payment processing and receipt generation.
2. Dispute repository and dispute page.
3. Geo analytics service and page.
4. Marketplace repository and routed marketplace normalization.
5. Property valuation service and page.
6. Mortgage application list, parcel map, identity verification.
7. Blockchain explorer, AI document processing, document validation.
8. Bulk import, bulk operations, performance monitor.
9. Analytics service mock-method replacement.
