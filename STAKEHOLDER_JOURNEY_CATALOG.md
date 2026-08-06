# Reusable Stakeholder Journey Catalog

**Status:** Implementation contract for durable orchestration.

**Scope:** Twenty reusable, parameterized journey templates. A template is not a statutory decision engine; it composes existing guarded platform services, records evidence, pauses for human authority where required, and can be resumed or replayed safely.

## Shared execution rule

Every journey uses the same lifecycle: **requested → eligibility checked → service steps executed → human intervention requested where required → evidence recorded → completed, cancelled, or blocked**. A journey cannot independently grant title, approve credit, verify identity, decide a valuation, resolve a dispute, issue an official tax assessment, authorize a payment, or establish legal authority.

| ID | Stakeholder and reusable journey | Existing services and features composed | Required human or external gate | Primary entry surface |
|---|---|---|---|---|
| J01 | **Citizen: discover a parcel and request a public service** | Parcel lookup, public security, support, Registry Operations | Registry officer accepts or rejects the service case | PWA parcel/search and support journey |
| J02 | **Landholder: manage a landholding profile and evidence request** | Identity, document verification, onboarding, parcel subscriptions, support | Identity/document provider and authorized reviewer | PWA/mobile Getting Started and landholder workspace |
| J03 | **Applicant: certificate of occupancy or title-registration case** | CoFO workflow, registry case intake, documents, identity, onboarding | Authorized registry officer and statutory process | PWA registry and document workflows |
| J04 | **Conveyancer: title verification and transfer preparation** | Conveyancing workspace, legal documents, parcel/title lookup, document evidence | Licensed reviewer and registry approval | Conveyancing Workspace |
| J05 | **Borrower: mortgage application and collateral preparation** | Mortgage application, lender collateral, payment boundary, document verification | Lender credit decision and provider-confirmed payment | Mortgage and borrower workflows |
| J06 | **Lender: collateral portfolio review and human decision** | Lender Collateral Control, parcel context, Context Globe, evidence workflow | Human lender reviewer; no automated underwriting | Lender Collateral Control |
| J07 | **Registry officer: service case assignment and resolution** | Registry Operations Cloud, onboarding roles, registry integrity, audit events | Assigned officer/supervisor decision | Registry Operations Cloud |
| J08 | **Registry integrity analyst: exception and correction review** | Registry Integrity, parcel/title records, evidence, case management | Independent reviewer and statutory correction authority | Registry Integrity Dashboard |
| J09 | **Surveyor: field assignment, evidence capture, and review** | Field Survey Operations, native field capture, geometry safeguards, MapLibre/Context Globe | Supervisor review and accepted evidence | PWA and native Field Survey Operations |
| J10 | **Infrastructure authority: corridor and land-access management** | Right-of-Way Manager, corridors, agreements, field confirmations, mapping | Legal/acquisition authority and independent reviewer | Right-of-Way Manager |
| J11 | **Assessor: human valuation and appeal handling** | Valuation and Tax Operations, assessment evidence, appeals | Assessor/reviewer decision; no automated valuation | Valuation & Tax Operations |
| J12 | **Taxpayer: assessment review, appeal, and verified payment** | Tax Operations, financial integrations, support, provider-verified payment | Tax authority determination and provider confirmation | Tax Assessment and support workflows |
| J13 | **Developer or acquirer: governed data room and due diligence** | Portfolio Products, acquisition data room, parcel context, documents, Context Globe | Authorized data-room owner and professional judgment | Commercial Portfolio Hub |
| J14 | **Resilience manager: exposure review and mitigation handoff** | Portfolio exposure, Context Globe, Lakehouse aggregates, parcel subscriptions | Human risk/operations decision; public feeds are context only | Portfolio Hub and Context Globe |
| J15 | **Rural landholder or agribusiness: consented service request** | Rural hub, consent records, provider directory, support | Consent validation and verified provider acceptance | Portfolio Hub and assisted service |
| J16 | **Verified provider: service-directory onboarding, request, and dispute** | Marketplace/service directory, provider verification, consented requests, disputes | Platform provider reviewer and dispute reviewer | Marketplace and Portfolio Hub |
| J17 | **Integration client: purpose-bound property-data request** | Property Data API, commercial account/entitlement, usage audit, integration registry | Account authorization, purpose/scope check, rate limit | API documentation and integration workspace |
| J18 | **Concession operator: mining, oil, gas, or environmental compliance case** | Mining rights, oil/gas blocks, concessions, environmental records, registry/parcel context | Relevant government authority and permit process | Sector workspaces |
| J19 | **Public safety or planning analyst: contextual mapping and GeoAI evidence request** | Context Globe, GeoAI operations, Lakehouse provenance, public security, reporting | Analyst review; no public feed becomes land-right evidence | Geospatial Center and Context Globe |
| J20 | **National or jurisdictional operator: staged rollout assurance** | Nationwide Rollout Control, data lineage, reconciliation, recovery drills, assisted service, integration readiness | Legal authority, independent assurance, and jurisdictional approval | Nationwide Rollout Control |

## Coverage and reuse model

Each template has a stable identifier, role eligibility, bounded input schema, declared service-step adapter list, intervention points, evidence events, retry policy, and client launch metadata. One template may run many times for different stakeholders, parcels, cases, jurisdictions, portfolios, or providers; no workflow contains an embedded one-off record identifier.

The templates intentionally share seven reusable capabilities: **identity and onboarding**, **commercial entitlement**, **parcel/title context**, **document/evidence management**, **human-review intervention**, **notification/support handoff**, and **auditable completion/recovery**. New domain-specific steps are added as adapters, not by copying workflow logic.

## Coverage standard

A journey is counted as repository-verified only when its template is registered, its declared adapters are exercised by deterministic tests, its database/event state is validated, its PWA or native launch route resolves, and its forbidden automatic decisions are tested. A journey remains target-environment-pending until real identity, authorization, verification, payment, Dapr, Temporal, provider, and statutory-authority acceptance evidence is recorded.
