# Stakeholder Journey Release

## Outcome

This release turns disconnected onboarding and role entry points into a shared, **server-derived journey** across the PWA and native mobile app. It does not replace platform controls with a client-side checklist. The protected onboarding router remains authoritative for participant status, while administrators retain the only paths for invitation creation, Keycloak provisioning, policy synchronization, and final activation.

| Stakeholder surface | Delivered experience | Governing boundary preserved |
|---|---|---|
| Participant PWA | `/getting-started` loads the current user’s protected onboarding record, shows milestone ownership, provides one safe next action, and launches the role-appropriate first task only after activation. | The browser does not provision identities, apply policies, verify documents, or activate a participant. |
| PWA navigation | A visible **Getting started** entry is present in the shared Workspace navigation. | It points to the same protected journey, not a local storage tour. |
| Administrator PWA | `/admin/stakeholder-onboarding` now supports sector/role constrained invitation creation, explicit token delivery guidance, prerequisite visualization, provision/policy steps, and only an enabled activation action when server-side prerequisites are satisfied. | Invitation, role validation, Keycloak provisioning, Permify synchronization, and activation still execute through administrator-only procedures. |
| Native home | Mobile retrieves the same protected journey, summarizes readiness, identifies the owner of any blocked milestone, and offers only field-safe launch routes or approved options. | Mobile cannot perform role provisioning, identity/document approval, policy synchronization, or activation. |
| Recovery design | The participant route renders loading and retry states when protected data is unavailable. The administrator console differentiates loading, unavailable, and genuinely empty cohorts. | No unavailable state is presented as a successful or empty onboarding outcome. |

## Journey Coverage

The shared launch model maps field roles to Field Survey Operations, registrars to Registry Operations Cloud, lender roles to Collateral Control, legal roles to Conveyancing Workspace, assessment roles to Valuation and Tax Operations, administrators to activation management, and other participants to the governed commercial workspace. The PWA contract documents the public/citizen search path and provider, rural, and integration-client workspace routes. The native app intentionally concentrates on approved field-safe tasks and directs broader administrative/commercial activity to the web workspace.

## Validation Evidence

The PWA TypeScript check passed after the protected onboarding API, participant hub, shared navigation entry, and administrator activation console were added. The native TypeScript check passed after the role-aware mobile home and authenticated journey client were added. The production PWA bundle completed successfully after the participant route and again after the administrator activation console implementation; it retained existing oversized third-party mapping/widget chunk warnings.

A browser preview of `/getting-started` verified route resolution, preparation feedback, and its controlled recovery state when the static preview could not supply an authenticated API session. A browser preview of `/admin/stakeholder-onboarding` verified the guided invitation shell, constrained sector/role controls, and readiness-console hierarchy. The static preview cannot validate real role data or mutation execution because it intentionally lacks an authorized session and target identity/integration environment.

## Remaining Acceptance Gates

Before treating the journey as live-operational, run role-specific acceptance tests in a deployed environment with Keycloak, Permify, identity verification, document verification, and Dapr outbox delivery configured. Verify an administrator can create an invitation and safely deliver it; exercise each prerequisite transition with a test participant; verify active participants reach their first task; and confirm field mobile users see only supported native launch actions. Perform keyboard and screen-reader review with representative roles before production rollout.
