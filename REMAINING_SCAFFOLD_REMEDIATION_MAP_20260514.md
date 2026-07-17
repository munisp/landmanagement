# Remaining Scaffold Remediation Map — 2026-05-14

## Newly confirmed remaining gaps

| Area | Current issue | Evidence observed | Required remediation |
| --- | --- | --- | --- |
| `server/api/routers/analytics.ts` | Multiple executive analytics endpoints still return random or mock-derived values instead of domain-backed calculations. | `getFraudAlerts`, `getSystemPerformance`, `getRevenueForecasts`, `getMLModelPerformance`, `trends`, and `predictWorkload` still contain `Math.random()` or hardcoded metrics. | Replace with deterministic repository-backed analytics derived from transactions, parcels, users, disputes, payments, and verification-domain records where available. |
| `client/src/pages/AnalyticsDashboard.tsx` | Dashboard consumes executive analytics endpoints that are still partially scaffolded at the backend layer. | Frontend queries `getFraudAlerts`, `getRevenueForecasts`, and other executive analytics endpoints now known to return random or mock values. | Reconnect to corrected backend analytics contracts and adjust view logic to match real aggregates. |
| `client/src/pages/ExecutiveAnalyticsDashboard.tsx` | Dashboard is still backed by partially scaffolded executive analytics endpoints. | Uses `getFraudAlerts`, `getSystemPerformance`, `getRevenueForecasts`, `getMLModelPerformance`, and geospatial analytics. | Replace remaining scaffold backend outputs and then verify frontend cards/charts render meaningful domain metrics. |
| `client/src/pages/ExecutiveDashboard.tsx` | Executive dashboard still depends on partially mocked analytics endpoints. | Uses `trends`, `timeSeries`, `predictWorkload`, and `revenueBreakdown`; some backend outputs remain mock or random. | Replace backend mock calculations and confirm the dashboard consumes deterministic trend, forecast, and workload metrics. |
| `client/src/pages/MortgageApplicationPage.tsx` | Legacy duplicate mortgage application route remains live and uses a different financial contract than the newly remediated mortgage workflow page. | `/mortgage-application` is still routed in `App.tsx`; page uses `trpc.financial.calculateLoanAffordability`, `getCreditScore`, and `submitMortgageLoanApplication` instead of the new repository-backed mortgage applications contract. | Either fully reconcile this route to the same domain workflow as `/mortgage` or collapse it into the remediated mortgage implementation to eliminate duplicate disconnected behavior. |
| `server/api/routers/phase4.ts` | Phase 4 ID generation and workflow setup remain timestamp/random based and may still represent incomplete continuity relative to repository-backed deterministic domains. | Mortgage, tax, insurance, legal, survey, environmental, public notice, and land-use procedures still generate IDs with `Date.now()` and `Math.random()`. | Audit whether these routes remain active user-facing dependencies and, if so, replace random identifiers and generic setup patterns with deterministic repository-backed lifecycle behavior. |

## Prioritization for next implementation slice

| Priority | Target |
| --- | --- |
| 1 | Replace scaffolded executive analytics backend outputs with deterministic, domain-backed aggregates. |
| 2 | Reconcile all executive analytics dashboards to the corrected analytics contracts. |
| 3 | Eliminate the duplicate live mortgage application route discrepancy by unifying it with the repository-backed mortgage workflow. |
| 4 | Reassess active Phase 4 routes that still rely on generic ID generation and incomplete lifecycle setup. |
