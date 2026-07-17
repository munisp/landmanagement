# IDLR PTS User Documentation

This guide provides a practical operating reference for the Integrated Digital Land Registry and Payments/Transaction System (IDLR PTS). It is intended for registry staff, surveyors, compliance officers, financial institutions, brokers, and administrative operators who need to execute day-to-day workflows in a controlled production environment.

## Core Workspaces

| Workspace | Primary users | Purpose |
|---|---|---|
| Dashboard | Registry operators, administrators, institutional users | Review operational metrics, workflow queues, and cross-module status summaries. |
| Parcel and title management | Registry staff, surveyors, legal reviewers | Register parcels, inspect parcel history, review title details, and validate linked evidence. |
| Verification and document validation | Verification teams, legal/compliance operators | Review uploaded evidence, compare documents, extract fields, summarize records, and verify signatures. |
| Transactions and payments | Registry operators, banks, brokers, buyers | Initiate transfers, monitor payment status, confirm settlement progress, and inspect blockchain-linked evidence. |
| Mortgage workflows | Banks, underwriters, borrowers, regulators | Run mortgage calculations, submit applications, apply document-driven prefill, and review repayment flows. |
| Reporting and analytics | Administrators, executives, compliance, operations | Generate operational reports, review versioned history, inspect analytics dashboards, and track search or activity trends. |
| Security, monitoring, and recovery | Administrators, platform operators | Monitor security posture, inspect integration health, run backups, and perform recovery actions. |
| Settings and privacy | All authenticated users | Manage profile information, preferences, sessions, security controls, and privacy/data-rights operations. |

## Authentication and Access Control

Authentication is performed through the platform identity layer and role-aware middleware. Users should sign in with their assigned institutional account and only expect to see actions authorized for their role. Administrative actions, privacy breach reporting, and high-assurance operations remain restricted by policy.

## Parcel Registration Workflow

| Step | Action |
|---|---|
| 1 | Open the parcel registration or search workspace and confirm the correct jurisdiction. |
| 2 | Capture or enter parcel identifiers, geometry, address, land-use metadata, and survey details. |
| 3 | Attach supporting plans or evidence where required. |
| 4 | Review saved parcel details and confirm that the parcel appears in search and detail views. |
| 5 | Use linked title, transaction, valuation, and verification modules for downstream processing. |

## Verification and Document Workflow

Operators can use the document-validation workspace to run classification, extraction, comparison, summarization, and signature-verification tasks against uploaded records. Verification staff should use these outputs as structured decision support rather than as a replacement for legal or registry judgment.

| Capability | Operational use |
|---|---|
| Field extraction | Pull structured attributes from uploaded records for downstream review or prefilling. |
| Document comparison | Detect mismatches between instruments, plans, or supporting evidence. |
| Summarization | Produce operator-ready condensed briefs for long evidence packages. |
| Signature verification | Highlight potential signature inconsistencies before approval or escalation. |

## Mortgage Workflow

The mortgage application workspace supports live underwriting calculations and application submission. When processed identity, property, or financial records exist, operators or applicants can use the intelligent form-fill controls to prefill relevant fields before submission.

| Mortgage function | Expected behavior |
|---|---|
| Loan calculator | Computes payment estimates from property value, loan amount, rate, and term. |
| Intelligent form fill | Pulls extracted document fields into the application form where compatible values exist. |
| Application submission | Sends the application into the repository-backed underwriting workflow. |
| Application tracking | Shows status, bank details, timestamps, and review outcomes. |

## Security, Monitoring, and Recovery

Platform operators should use the integration-health, security, and backup-recovery workspaces as their first line of production observability. These surfaces are designed to remain useful even when some external infrastructure is degraded or unavailable.

| Operational workspace | What to watch |
|---|---|
| Security dashboard | Threat level, recent threats, Wazuh alerts, policy violations, and cost anomalies. |
| Integration health | Service availability, external integration status, and middleware readiness. |
| Backup and recovery | Backup cadence, recovery points, storage posture, and restore readiness. |

## Privacy and Data Rights

The settings workspace now includes a privacy section where authenticated users can export personal data, create portable data packages, update consent selections, acknowledge the current privacy policy, and initiate anonymization-oriented erasure controls.

| Privacy operation | Intended use |
|---|---|
| Export personal data | Produce an access-oriented data package for the current user. |
| Portable package | Produce a machine-readable portability package. |
| Consent management | Record or withdraw consent for supported processing purposes. |
| Policy acknowledgement | Record acceptance of the active privacy-policy version. |
| Anonymization | Trigger privacy-preserving masking of account-level personal data in supported flows. |

## Operational Best Practices

Users should treat automated analytics, AI-derived extraction, and monitoring outputs as decision-support aids. Critical title, payment, or compliance actions should still be reviewed against institutional procedure. Administrative users should periodically review active sessions, backup cadence, integration health, and privacy activity to ensure the platform remains in a defensible operational state.
