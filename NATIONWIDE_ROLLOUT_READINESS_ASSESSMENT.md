# Nationwide Rollout Readiness Assessment

**Author:** Manus AI

**Assessment date:** 5 August 2026

**Scope:** This assessment considers the current published `main` branch of `munisp/landmanagement`, the repository's release and deployment records, and selected authoritative land-governance, privacy, and accessibility sources. The existing `.gov.ng` references and the go-live checklist's NDPR/NDPA references indicate that **Nigeria is the likely target jurisdiction**; that assumption must be confirmed by the sponsoring authority and reviewed by Nigerian land, public-law, procurement, and data-protection counsel before any official deployment.

> **Decision:** **Do not approve a nationwide authoritative rollout.** The platform contains meaningful, repository-validated product and workflow implementation, but the currently published branch lacks evidence for the legal, institutional, data-integrity, live-integration, resilience, security-assurance, inclusion, and operational controls required to make it a national system of record.

> **Code-remediation update:** The accompanying `NATIONWIDE_ROLLOUT_CODE_READINESS_RELEASE.md` records subsequent repository changes that address code-resolvable gaps: blocking release controls and SBOM generation; resolved Compose validation; jurisdiction, import-lineage, reconciliation, recovery, and assisted-service controls; evidence-only backup posture; integration preflight; and persistent accessibility/low-bandwidth preferences. Those controls reduce the code gap but do **not** change this no-go decision until the clean release is published and the jurisdiction-specific legal, live-provider, security, recovery, accessibility, support, and independent-assurance evidence is accepted.

A nationwide land platform is not merely a software release. The World Bank's Land Governance Assessment Framework treats land governance as a country- or subnational-level diagnostic that must be informed by government, academia, civil society, and private-sector participants; its purpose is to identify priority reform and safely test, evaluate, and roll out new approaches.[1] The FAO and FIG similarly identify institutional development, legislative redesign, financing, quality management, cybersecurity, standards, communications, and capacity building as cross-cutting requirements of digital land-administration transformation.[2]

## 1. Evidence boundary and current status

The current local checkout and `origin/main` resolve to commit [`da30237`](https://github.com/munisp/landmanagement/commit/da30237), *Streamline stakeholder onboarding journeys*. That branch contains the stakeholder-journey release, commercial products, portfolio workflows, Context Globe, and PWA/native UX work. It does **not** contain the previously claimed integration commit `331d7c1`; `git cat-file -e 331d7c1^{commit}` returned absent, and the only identity/workflow checklist available in the checkout is untracked. This is a **release-provenance blocker**: no identity, authorization, verification, Dapr, or Temporal hardening work may be credited to the release branch until it is independently recovered, reviewed, tested, and merged through the normal change-control path.

The repository's own production-readiness audit draws the same distinction between source-level implementation, deployment readiness, and live operational evidence. It states that repository checks cannot certify an unprovisioned external environment as 100% operational and records incomplete platform-wide tests, absent live provider evidence, unexercised backup/recovery, and unvalidated operational controls.[5] The existing go-live checklist remains entirely unchecked and explicitly lists unresolved national-scale requirements such as database replication, point-in-time recovery, load testing, security testing, accessibility, documentation, incident response, and trained support staff.[6]

| Readiness state | Current assessment | Meaning |
|---|---|---|
| **Nationwide authoritative registry** | **No-go** | Do not use the platform to create, amend, extinguish, or conclusively certify land rights nationwide. |
| **Multi-jurisdiction public pilot** | **Not yet approved** | A pilot cannot begin until release provenance, live identity/authorization, privacy, security, and data-migration gates have passed. |
| **Non-authoritative demonstration/training environment** | **Possible only with synthetic or approved non-production data** | It may be used for usability research, training, and controlled workflow rehearsal with clear non-authoritative labeling. |
| **Repository product maturity** | **Partially evidenced** | PWA/native workflows, commercial modules, Context Globe, and onboarding are implemented in source, but their live operating dependencies are not yet demonstrated. |

## 2. Critical blockers before a national rollout

The following items are **release gates**, not optional enhancements. A green status requires retained artefacts, named accountable owners, and independent sign-off; a code change alone is insufficient.

| Domain | Status | Evidence-based gap | Minimum gate before scale |
|---|---|---|---|
| **Release provenance and change control** | **Red** | The claimed identity/authorization/Dapr/Temporal release is not present on published `main`; the CI file contains non-blocking test/security commands (`|| true`) and a staging-deployment placeholder.[7] | Recover or reimplement the missing change; require protected branches, signed/tagged release artifacts, software bill of materials, reproducible builds, no ignored critical tests, and an approved release manifest. |
| **Legal authority and institutional governance** | **Red** | No evidence establishes the platform's statutory authority, the authoritative record, delegation between federal/state/local registries, or rules for customary, communal, disputed, and pending rights. | Obtain sponsoring-agency mandate, jurisdictional operating model, legal analysis, records-retention schedule, published service charter, independent oversight forum, and formal dispute/appeal policy. |
| **Land-data migration and registry integrity** | **Red** | The repository has schemas and workflows but no demonstrated nationwide source inventory, data-quality baselines, parcel-identity reconciliation, scanned-record chain of custody, spatial accuracy acceptance, or remediation programme. | Complete a jurisdiction-by-jurisdiction inventory; define source-of-truth hierarchy; run sampled migration/reconciliation; publish accuracy, completeness, overlap, duplicate, and exception metrics; retain immutable migration lineage and a human adjudication path. |
| **Title and transaction authority** | **Red** | Several workflows deliberately keep human decisions, but no live evidence shows registry officers, legal reviewers, or statutory approvers operating under delegated authority. | Use a shadow-register phase; require dual control for authoritative acts; enforce segregation of duties; record legal basis, reviewer identity, signed decision, and reversal/appeal process for every official outcome. |
| **Identity, authorization, and verification** | **Red** | The onboarding release itself requires deployed Keycloak, Permify, identity verification, document verification, and Dapr delivery before it can be live-operational.[8] The corresponding claimed integration commit is absent from `main`. | Deploy real Keycloak and Permify with least-privilege roles; execute external identity/document-provider contract tests; run privileged-access review, break-glass drills, and independent authorization testing; preserve provider/evidence provenance. |
| **Privacy and data governance** | **Red** | The platform processes identity, documents, payment-related, location, and land-right data; no deployed privacy programme, DPIA, data-controller/processor determination, retention implementation, or breach exercise is evidenced. | Confirm lawful basis and controller roles; conduct a Data Protection Impact Assessment; finalize data-sharing agreements and processor contracts; implement subject-rights and breach workflows; complete required NDPC registration/audit steps where applicable. The NDPC states that the Nigeria Data Protection Act 2023 establishes the Commission and requires accountable, secure personal-data handling.[3] |
| **Cybersecurity assurance** | **Red** | No independent penetration-test report, threat-model sign-off, secrets-management evidence, key-management exercise, vulnerability remediation record, or security operations acceptance was produced. | Complete independent application/API/mobile/cloud penetration testing, threat modeling, secrets rotation, code/dependency/container scanning with no unaccepted critical findings, incident tabletop, logging/SIEM ingestion, and security-owner sign-off. |
| **Resilience, backup, and disaster recovery** | **Red** | The go-live checklist calls for replication, PITR, cross-region storage, monitoring, and rollback, but every item remains unchecked.[6] | Demonstrate restore to a clean environment, measured RPO/RTO, regional/zone failover, database consistency recovery, object-storage recovery, queue replay, DNS/WAF failover, and a documented rollback that does not corrupt land records. |
| **Scale, performance, and reliability engineering** | **Red** | The repository has load-test scripts but no accepted capacity result; the production build records oversized mapping/widget chunks; no production SLO/error-budget evidence exists.[5] | Define peak-load model by state and transaction type; conduct authenticated, representative load/soak/failure tests; set availability, latency, queue-lag, and error-budget SLOs; prove autoscaling and regional isolation; publish capacity acceptance results. |
| **Accessibility, language, and assisted channels** | **Red** | Visual improvements and limited browser checks do not substitute for assistive-technology testing, local-language content, low-bandwidth operation, or in-person/telephone channels. | Test keyboard, screen reader, contrast, zoom, map alternatives, accessible documents, and native accessibility with representative users; support relevant Nigerian languages and assisted digital service points. Government accessibility programmes treat testing, training, procurement, and accessible ICT as sustained governance responsibilities, not a UI-only task.[4] |
| **Service operations and adoption** | **Red** | No evidence of trained registry officers, state rollout teams, support desk, escalation rota, public status page, communications plan, user manuals, or stakeholder acceptance. | Establish national and state service desks, named escalation routes, training/certification, field device support, knowledge base, public notices, feedback and grievance intake, and pilot adoption metrics disaggregated by region and user group. |
| **Payments, commercial services, and external providers** | **Red** | Commercial code is repository-validated, but the prior audit states that payment-provider credentials and callback tests were not available.[5] | Validate provider contracts in a non-production tenant, reconcile settlement/accounting, define refunds and chargeback handling, complete tax/public-fee legal review, and separate public statutory services from optional commercial products. |
| **Observability, audit, and independent assurance** | **Red** | Monitoring configuration exists, but no evidence demonstrates live alert delivery, audit-log review, operational dashboards, or independent audit. | Run alert-routing tests, audit-log integrity sampling, monthly access review, data-quality board review, vulnerability review, and independent technical/legal/privacy assurance before each scale gate. |

## 3. What is usable today—and what it is not

The published branch has credible foundations for a **controlled, non-authoritative programme**: role-aware PWA/mobile onboarding, human-decision boundaries, registry case workflow, field survey operations, commercial workspaces, spatial interfaces, data provenance concepts, and server-derived role launches. The stakeholder release is explicit that its dynamic flows still require real Keycloak, Permify, identity/document verification, Dapr delivery, authenticated role testing, and device/accessibility testing before being treated as live-operational.[8]

Those foundations should not be confused with an official national register. Neither a polished map nor an evidence-backed case workflow establishes legal title, validates legacy records, resolves jurisdiction, or provides an equitable route for citizens without dependable connectivity. The World Bank emphasizes that land governance reform should be country-driven and participatory, while the FAO/FIG identifies inclusion, legal redesign, quality management, standards, communications, and capacity as essential transformation work.[1] [2]

## 4. Recommended rollout path

A safe programme should be staged by **risk and authority**, not by a nationwide launch date.

| Gate | Permitted scope | Entry evidence | Exit evidence |
|---|---|---|---|
| **Gate 0 — Release recovery and assurance** | No public data or authoritative service. | Published branch contains all approved changes; CI/CD and secret-management controls are operational. | Reproducible release, full test matrix, security assessment, deployment bill of materials, and formal change approval. |
| **Gate 1 — Controlled rehearsal** | Synthetic/approved non-production data; training; usability and accessibility research. | Privacy-safe test data, non-authoritative banner, consented test participants, support/training plan. | Task-completion, accessibility, low-bandwidth, and incident/rollback exercises pass without rights-impacting actions. |
| **Gate 2 — Shadow-register pilot** | One or a small number of consenting jurisdictions; read-only legacy data plus parallel case handling. | Jurisdictional memorandum, data inventory, DPIA, live identity/authorization/verification, restored backup drill, monitoring/on-call readiness. | Reconciled sample records, verified officer workflows, complaint/dispute metrics, independent pilot evaluation, and no unresolved critical security/data incidents. |
| **Gate 3 — Limited authoritative service** | A narrowly defined statutory service, with existing registry remaining the legal fallback. | Formal legal authorization, dual-control procedures, adjudication/appeal pathway, human sign-off, external security and privacy review. | Statutory SLA, measurable accuracy/completeness, appeal outcomes, equity/adoption metrics, and a successful failover/rollback drill. |
| **Gate 4 — State-by-state expansion** | Additional jurisdictions only after repeatable Gate 3 evidence. | State readiness scorecard, trained local operations, completed migration/reconciliation, local accessibility/language plan. | Independent quality review and national programme board approval for each cohort. |
| **Gate 5 — Nationwide operation** | Nationwide authoritative operation. | Every jurisdiction has passed Gate 4, and national governance, DR, cyber operations, privacy, support, finance, and audit controls are proven at scale. | Ongoing SLO, access-review, data-quality, transparency, and public-grievance reporting. |

## 5. Accountable owners and immediate decisions

| Owner | Decision or deliverable required before Gate 2 |
|---|---|
| **National land authority / programme sponsor** | Confirm legal mandate, authoritative-record model, jurisdiction rollout order, public-service charter, and governance board. |
| **State land registries and survey authorities** | Sign data-sharing and operational agreements; inventory source records; nominate data stewards and authorised officers; approve local reconciliation rules. |
| **Legal and policy counsel** | Issue written analysis on land authority, evidentiary status, signatures, retention, fees, appeals, customary/communal rights, procurement, and intergovernmental responsibilities. |
| **Data Protection Officer and NDPC adviser** | Complete DPIA, controller/processor mapping, data-sharing agreements, retention/deletion policy, rights-handling process, processor assurance, and breach response. |
| **CISO / security operations** | Approve threat model, penetration-test remediation, key/secrets management, security logging, incident response, and privileged-access governance. |
| **CTO / SRE / DBA** | Prove staging parity, CI gates, backup/restore, RPO/RTO, capacity, high availability, monitoring, alerting, deployment/rollback, and release provenance. |
| **Chief surveyor / data quality authority** | Define accuracy, topology, parcel identity, metadata, quality thresholds, acceptance samples, and exception/adjudication queues. |
| **Service delivery and inclusion lead** | Deliver training, regional support, accessible/language plans, assisted channels, community engagement, public information, and grievance routing. |
| **Independent assurance panel** | Review pilot evidence and recommend advancement, remediation, or pause at every gate. |

## 6. Immediate next actions

First, resolve the release-provenance discrepancy: retrieve or reimplement the absent identity/authorization/Dapr/Temporal work; review it; run its migration, integration, and security tests; and merge it to a protected branch. Do not deploy an integration based on a report alone.

Second, convene a national land-governance and programme board with federal, state, technical, legal, privacy, civil-society, survey, and service-delivery representation. The board should agree on the authority model, pilot jurisdictions, non-authoritative/rehearsal boundaries, dispute resolution, and success metrics before importing live records.

Third, create a **jurisdiction readiness scorecard** and require every pilot jurisdiction to pass Gate 2 before it receives live legacy data. The scorecard should measure source-data completeness and accuracy, legal authority, trained officers, privacy readiness, connectivity/assisted channels, resolved exceptions, SLO/DR evidence, and public grievance capability.

Fourth, run a formal shadow-register pilot. Maintain the legally authoritative register as the fallback, reconcile every pilot outcome, and publish a transparent pilot report that includes data-quality, task-completion, complaint, accessibility, security, and restoration findings.

## References

[1]: https://www.worldbank.org/en/programs/land-governance-assessment-framework "World Bank — Land Governance Assessment Framework"
[2]: https://openknowledge.fao.org/handle/20.500.14283/cc1880en "FAO and FIG — Funding Digital Transformation of Land Administration"
[3]: https://ndpc.gov.ng/about-us/ "Nigeria Data Protection Commission — About the Nigeria Data Protection Act 2023"
[4]: https://www.section508.gov/ "Section508.gov — Digital Accessibility Guidance"
[5]: ./PRODUCTION_READINESS_AUDIT.md "Repository Production Readiness Audit"
[6]: ./docs/GO-LIVE-CHECKLIST.md "Repository Go-Live Checklist"
[7]: ./docs/ci/ci.yml "Repository CI/CD Configuration"
[8]: ./STAKEHOLDER_JOURNEY_RELEASE.md "Stakeholder Journey Release"
