# Remaining Portfolio Expansion Contract

**Author:** Manus AI

## Scope

This contract converts the remaining recommendations from the published monetization portfolio into implementation units. Each product must have persisted state, organization-scoped authorization, registered APIs, a user journey, usage recording, explicit human decision boundaries, and a cross-language operational role. No application may be released as a static dashboard or speculative recommendation.

| Product | Core workflow | TypeScript product surface | Go responsibility | Rust responsibility | Python responsibility | Primary decision boundary |
|---|---|---|---|---|---|---|
| Registry Operations Cloud | Service queue, configurable SLA, controlled public request worklist, supervisor disposition | Registry operations console | Signed partner callback delivery | Request/SLA projection | Lakehouse registry service metrics | Registry officials remain authoritative for record changes. |
| Right-of-Way and Land Access Manager | Corridor, governed parcel overlap record, access agreement, field confirmation, renewal worklist | ROW Manager | Partner/easement event gateway | Deterministic corridor/parcel intersection check | Corridor and expiry analytics | No acquisition, easement, or owner-contact decision is automated. |
| Valuation and Property-Tax Operations | Assessment case, factual inputs, human value review, appeal, payment reference | Valuation and Tax workspace | Tax-system status adapter boundary | Assessment range/quality computation | Assessment and appeal aggregate metrics | No automated valuation, tax assessment, or appeal decision. |
| Development and Acquisition Intelligence | Dataroom, parcel due-diligence item, evidence, human risk note | Acquisition workspace | Controlled external-data delivery | Spatial due-diligence envelope | Dataroom activity and portfolio metrics | No investment, safety, valuation, or legal recommendation. |
| Resilience and Exposure Monitor | Institutional portfolio, asset membership, attributed Context Globe exposure snapshot, human case queue | Exposure monitor | Event fan-out for approved public context | Temporal asset/event proximity projection | Exposure aggregation with provenance | No underwriting, claims, emergency, or safety decision. |
| Property Data and Integration API | API client, purpose-bound scope, key rotation, immutable request usage | API partner console | Signed API gateway/token validation | Query-result spatial filter | Usage aggregation and privacy suppression | No unrestricted personal/ownership bulk export. |
| Land Market and Planning Analytics | Governed aggregate report, minimum cohort, suppression status, human publication | Planning analytics workspace | Report publication event delivery | Aggregation query planning guard | Lakehouse aggregate generation and suppression | No re-identifying or household-level analytical output. |
| Rural Land and Agribusiness Service Hub | Organization land service case, consent record, lease/contract reference, field verification | Rural service hub | Partner program event gateway | Field-boundary quality check | Program aggregate metrics | No rights scoring, community-rights conclusion, or automatic registration. |
| Trusted Marketplace and Service Directory | Verified provider profile, service request, consented lead, dispute record | Service directory and request console | Provider notification delivery | Service-radius/geographic relevance check | Marketplace service-level aggregates | No ownership-data lead sale, undisclosed ranking, or automatic dispute resolution. |

## Common product controls

Every product uses the existing commercial-account membership model, active entitlement gate, append-only usage events, invoices, provider-verified subscription renewal, Temporal billing enforcement, Keycloak-authenticated tRPC surface, PostgreSQL constraints, and audit events. Product data must reference a commercial account and must never cross tenant boundaries.

> **Release rule:** A product can be described as implemented only after its migration, Drizzle schema, service logic, router, registered route, PWA journey, usage hook, and validation have all been completed. Mobile capability is required for field-centric workflows; desktop PWA is sufficient for professional-office workflows.

## Cross-language boundaries

Go services accept only internal, signed middleware events and expose readiness/metrics. Rust services perform deterministic spatial or range computations from bounded request shapes; they do not make policy decisions. Python Lakehouse modules aggregate provenance-backed product data and enforce cohort/suppression policies. TypeScript remains the authoritative transactional and authorization plane.

## Release acceptance

The portfolio expansion must pass TypeScript and mobile compilation, PWA production build, Python tests, focused Go and Rust checks, PostgreSQL migrations and transactional workflow smokes, Compose structure validation, and an executable-marker scan. Live credentials, provider callbacks, identity, storage, queues, monitoring, and deployment remain separately required for a production-operational certification.
