# Existing Surface Audit for Portfolio Expansion

**Author:** Manus AI

| Existing surface | Finding | Portfolio action |
|---|---|---|
| `server/valuationService.ts` | Uses a seeded JSON store and deterministic multipliers. It creates an `approved` result for AVM input and labels the system an automated valuation desk. | Do not reuse for commercial tax/valuation decisions. Add a PostgreSQL assessment-case workflow requiring factual inputs, human reviewer confirmation, and an appeal process. |
| `server/marketplaceRepository.ts` | Uses seeded JSON property listings, bids, and escrow-like records. It contains ownership listing content, no provider verification, no consented-service lead model, and no dispute workflow. | Do not extend this into a property marketplace. Replace the recommended product with a verified professional service directory, explicit consented service requests, disclosed ranking, and human dispute handling. |
| `server/infrastructureRepository.ts` | Uses seeded JSON infrastructure projects and describes land-acquisition/compensation status without tenancy, evidence, agreement, or field-review controls. | Do not use for Right-of-Way Manager. Add account-scoped corridors, recorded spatial overlap determinations, agreements, expiry handling, and field verification. |
| Existing registry, geo, document, payment, workflow, and commercial modules | Provide durable building blocks but must stay under their existing public-service, evidence, and payment decision boundaries. | Reuse only through authenticated TypeScript services, commercial entitlements, and registered routes. |

> The JSON-backed legacy surfaces remain outside the new portfolio’s supported route and navigation paths. The portfolio expansion must not make them appear operational or authoritative.
