# Nationwide Rollout Code-Readiness Release

**Author:** Manus AI

**Scope:** Code and configuration remediation for nationwide land-service rollout readiness

**Status:** Repository controls implemented; not authorization to operate nationally

## Decision summary

This release implements the nationwide rollout gaps that can be addressed in source code, database schema, deployment configuration, continuous integration, and operator-facing controls. It does **not** create statutory authority, approve a national system of record, activate a third-party identity or verification provider, or substitute for independent security, accessibility, disaster-recovery, and legal acceptance.

| Area | Implemented control | Boundary retained |
|---|---|---|
| Release provenance | Blocking GitHub Actions gates, clean-worktree enforcement, migration checksums, component inventory, and CycloneDX SBOM generation | A protected branch, signed artifacts, and institutional release approval must still be configured and exercised by the delivery organization. |
| Deployment | Resolved Compose interpolation audit, explicit fail-closed Keycloak, Permify, verifier, Dapr, and Temporal settings | Target-environment endpoints, certificates, credentials, and network policy must be supplied and independently tested. |
| Rollout governance | Jurisdiction registration, required gate attestations, statutory-boundary statement, pilot stages, and a registrar-only PWA workspace | The application cannot determine legal authority or authorize authoritative operation itself. |
| Data transition | Immutable batch lineage, staging records, reconciliation cases/events, canonical-parcel checks, and controlled import finalization | Source inventory, legal custody, real records conversion, reconciliation review, and dispute adjudication remain accountable institutional work. |
| Recovery | Evidence-only recovery-drill records, independent executor/reviewer separation, and removal of fabricated backup/restore success | Real backups, restores, regional failover, RPO/RTO testing, immutable storage, and external audit evidence must be executed in the target environment. |
| Integration readiness | Bounded Keycloak, Permify, verifier, Dapr, and Temporal probes; Dapr timeout/idempotency headers/dead-letter delivery; administrator-only readiness API | The release remains fail-closed until real providers, certificates, policies, and credentials are configured. |
| Inclusion | Persistent browser-local accessibility, low-bandwidth, contrast, simplified-density, keyboard, and reader controls; assisted-service case workflow and handoff | Formal assistive-technology testing, language/localization, device testing, support staffing, outreach, and non-digital service delivery require jurisdictional acceptance. |

## Implemented release gates

The reviewed blocking workflow is supplied at `docs/ci/nationwide-release-gates.yml`. It is designed to block `main` changes until PostgreSQL migration application, TypeScript compilation, production bundle compilation, deterministic tests, Expo compilation, Lakehouse tests, Go checks, Rust format/lint/test checks, source and IaC scanning, dependency vulnerability review, release-manifest validation, provenance generation, and SBOM generation complete. GitHub rejected the automated installation at `.github/workflows/` because the available integration token lacks the required `workflows` permission; an organization administrator must copy this exact reviewed artifact into `.github/workflows/nationwide-release-gates.yml` or grant that permission before the gate can be treated as active.

The local release verifier requires a clean worktree for final evidence. Its `RELEASE_ALLOW_DIRTY_WORKTREE=true` mode exists only for pre-commit development validation and labels its output accordingly.

## Validated evidence in this workspace

| Check | Result | Evidence |
|---|---|---|
| TypeScript service and PWA compilation | Passed | `pnpm check` |
| Production PWA and server build | Passed | `pnpm build`; large existing map/widget chunks remain a performance optimization item, not a successful performance certification. |
| Expo native compilation | Passed | `mobile: pnpm exec tsc --noEmit` |
| Nationwide PostgreSQL schema | Passed | PostgreSQL 16 migration objects verified in the isolated smoke database. |
| Transactional rollout controls | Passed | `validation/nationwide_rollout_controls_smoke.sql`; transaction rolled back after jurisdiction, gate, batch, reconciliation, drill, and assisted-service checks. |
| Go portfolio gateway | Passed | `go test ./...` completed; the module currently has no test files. |
| Rust spatial engine | Passed | `cargo test --all-targets` completed; the module currently has no test cases. |
| Lakehouse Python | Passed with one deprecation warning | `33 passed` from `lakehouse/tests`. |
| Resolved Compose topology | Passed with obsolete Compose `version` warning | `scripts/release/validate-compose-audit.sh` |
| Release control scripts | Passed in development-worktree mode | `RELEASE_ALLOW_DIRTY_WORKTREE=true scripts/release/verify-release.sh` |
| SBOM | Generated and structurally validated | Local CycloneDX artifact contains 1,711 production dependency components. |
| Rollout PWA route | Passed | `validation/nationwide_rollout_pwa_browser_check.md` |
| Accessibility PWA route and low-bandwidth persistence | Passed | `validation/nationwide_accessibility_pwa_browser_check.md` |

The live dependency vulnerability audit was started but did not return from the external package-registry request within two bounded intervals; it was stopped and is **not** counted as a passing check. The configured CI workflow retains this gate as blocking.

## Remaining non-code release blockers

No rollout should proceed past non-authoritative rehearsal until each jurisdiction has reviewed, independently approved evidence for legal authority, records custody, data protection impact assessment, procurement and service-level obligations, deployment credentials and key management, independent penetration testing, disaster recovery, capacity/load testing, accessibility/device/language testing, support and grievance operations, staff training, and public communication.

The rollout-control workspace is intentionally an internal administrator/registrar tool. It records readiness evidence and cannot create statutory authority, directly write staged imports into the authoritative parcel register, self-attest recovery success, or unlock a pilot without required gate evidence.
