# Stakeholder Journey Contract

## Journey Principle

Every participant should receive a **single answer to “what should I do next?”** from server-derived onboarding and role data. The client may explain readiness, point to the correct workspace, and help recover from a blocked step. It must not activate accounts, grant roles, approve documents, or bypass identity and policy controls.

## Shared Activation Path

| Stage | Source of truth | Participant experience | Responsible party |
|---|---|---|---|
| Invitation and role | `stakeholder_onboarding` | Confirm that a managed invitation and sector role exist. | Authorized administrator |
| Secure account | Keycloak subject/roles | Finish secure sign-in setup when required. | Participant and identity administrator |
| Access policy | Permify synchronization | Explain that workspace access is being applied. | Platform administrator |
| Identity and documents | Verified onboarding flags | Show which verification category remains incomplete without exposing sensitive values. | Participant and authorized verifier |
| Training | Verified training flag | Direct the user to required training/support material. | Participant and training administrator |
| Active and first task | Activated onboarding record plus role | Launch the stakeholder’s governed first task. | Participant within authorized workflow |

## Stakeholder Launch Paths

| Stakeholder | First successful task | Primary launch route |
|---|---|---|
| Public/citizen | Find a factual land or service record without changing it. | `/search` |
| Surveyor/inspector/field operator | Open an assigned inspection or field evidence workflow. | `/field-survey-operations` |
| Registrar/registry officer | Review and progress an accountable service case. | `/registry-operations` |
| Lender/loan officer | Review a collateral case in the responsible institution account. | `/lender-collateral-control` |
| Conveyancer/legal professional | Open or review a governed matter. | `/conveyancing-workspace` |
| Assessor/tax officer | Review factual assessment evidence or an appeal. | `/valuation-tax-operations` |
| Institutional administrator | Configure workspaces and unblock stakeholder activation. | `/admin/stakeholder-onboarding` |
| Provider/rural-program participant | Begin a consent-backed service case or provider-verification journey. | `/commercial-portfolio` |
| Integration client owner | Issue and manage a purpose-bound client. | `/commercial-portfolio` |

## Recovery Rules

A blocked participant sees the exact activation category, plain-language explanation, and responsible actor. The interface offers a supported destination only when one exists; otherwise it explains that an authorized administrator must complete the action. All errors retain a retry route and never substitute mock progress for a missing external verification.

## Mobile Rule

Mobile gives field-safe users a compact readiness card and one primary task. It never prompts a mobile participant to perform administrative provisioning, role assignment, or activation. Online-only evidence and Context Globe boundaries remain explicit.
