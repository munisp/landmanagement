# Native GeoAI Parity: P0–P3

## Purpose

The `mobile/` Expo application now delivers the GeoAI workflows implemented in the browser/PWA to native iOS and Android clients. It is a **thin, authenticated client of the existing platform contracts**: GeoAI policy, evidence persistence, Temporal orchestration, Keycloak authentication, Permify authorization, durable notification records, and the guarded ArcGIS control plane remain authoritative on the server.

No mobile screen evaluates geospatial evidence, creates a synthetic result, or bypasses a server approval gate.

## Delivered scope

| Priority | Native capability | Platform boundary used | Control retained |
|---|---|---|---|
| P0 | GeoAI run browser, run detail, evidence report, and verification/rejection actions | Protected `geoai.*` tRPC procedures | Server-side Permify authorization and evidence-gate validation |
| P1 | Camera/library field capture, GPS provenance, server-hashed upload, asset registration, field-evidence review run, durable job queueing, in-app/Expo alerts, and evidence map | Authenticated storage upload, GeoAI asset/run APIs, Temporal workflow, durable inbox | Server-generated SHA-256, immutable asset catalog, explicit location permission, authenticated device registration |
| P2 | Device-local drafts, manual sync, conflict duplication/removal, offline status, and read-only ArcGIS operation monitor | Local draft store and protected GeoAI/ArcGIS query APIs | No background upload; no fabricated server state; ArcGIS remains read-only at this priority |
| P3 | Guarded ArcGIS request, plan and recovery-plan review, authorized approval, phrase-based execution confirmation, and state refresh | Protected `geoai.requestArcgisOperation`, `approveArcgisOperation`, `executeArcgisOperation`, and `refreshArcgisOperation` procedures | Server-side role check, persisted recovery plan, approval state, separate execution call, configured control-plane credential |

## Mobile architecture

The app uses Expo Router under `mobile/app/` with a secure session gate. `MobileSessionProvider` performs Keycloak PKCE sign-in and persists tokens in Expo SecureStore. Every mobile request uses the token-aware tRPC client in `mobile/src/services/api.ts`; the client refuses protected calls without a token.

The signed-in tab shell exposes **Home**, **GeoAI**, **Field**, **Alerts**, and **More**. Protected stack routes provide evidence detail and reports, the evidence map, advanced analysis creation, explicit offline-draft synchronization, ArcGIS monitoring, requested-operation detail, and confirmation-gated ArcGIS execution.

> Device role labels are only presentation hints. The server remains the sole authorization decision point.

## Field-evidence provenance

A field observation is captured only after the user explicitly grants device permissions. The client records the observed location and capture timestamp, uploads image bytes through the authenticated storage service, and uses only the **server-returned** SHA-256 and byte length when registering the immutable GeoAI asset. It then creates a `field_evidence_review` analysis run and starts the existing durable GeoAI workflow.

Offline capture never claims a server-side result. Drafts remain device-local until the user selects **Sync**. Failures preserve a recoverable draft and users may duplicate a conflicted draft rather than overwrite it.

## ArcGIS safeguards

The native app does not have a direct control-plane credential and cannot execute an unapproved operation. A user must create a request that contains an operation plan and recovery plan. Authorized reviewers may approve it. Execution is a separate server-authorized action requiring the on-screen confirmation phrase. The application displays server-persisted status; it does not infer completion from a device request.

## Required native build configuration

All values must be supplied by a secure release environment or EAS secret. There are no localhost or production credential fallbacks.

| Variable | Required | Purpose |
|---|---:|---|
| `EXPO_PUBLIC_API_URL` | Yes | Absolute HTTPS URL for the platform tRPC gateway |
| `EXPO_PUBLIC_KEYCLOAK_URL` | Yes | Absolute HTTPS Keycloak base URL |
| `EXPO_PUBLIC_KEYCLOAK_REALM` | Yes | Keycloak realm used by the mobile client |
| `EXPO_PUBLIC_KEYCLOAK_CLIENT_ID` | Yes | Mobile confidential/public PKCE client identifier as configured in Keycloak |
| `EXPO_PUBLIC_KEYCLOAK_SCOPES` | Recommended | Explicit OIDC scopes; defaults only to `openid profile email` |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | Required for push | Real Expo/EAS project ID. Omission disables push registration rather than using a placeholder. |
| `EXPO_PUBLIC_GEOAI_MAP_TILE_URL` | Optional | HTTPS tile source for the evidence map; absence retains a non-deceptive provenance list/map-state experience. |

The Expo configuration declares camera, media-library, foreground location, notification, biometric, and deep-link permissions. It does **not** enable background location collection or automatic offline upload.

## Validation completed

| Check | Result |
|---|---|
| Native TypeScript (`mobile/`) | Passed |
| Native API-contract tests | Passed: 3 tests |
| Android Expo bundle export | Passed |
| iOS Expo bundle export | Passed |
| Resolved Expo configuration / fail-closed push identifier check | Passed |
| Platform TypeScript check | Passed |
| Platform production build | Passed |
| Platform regression suite | Passed: 27 files, 312 tests passed, 1 skipped |

## Release operations

1. Register a Keycloak mobile PKCE client with the `idlrpts://` redirect scheme and only approved OAuth redirect URIs.
2. Set the required build environment values using the mobile release system; do not commit them to the repository.
3. Create a real EAS project and set `EXPO_PUBLIC_EAS_PROJECT_ID` before enabling push delivery.
4. Configure trusted object-storage prefixes and the GeoAI/Temporal workers on the platform side before allowing field submissions.
5. Configure the ArcGIS control-plane URL and credentials only in the server deployment. Never inject them into the mobile app.
6. Run device-level permission and Keycloak sign-in acceptance tests on physical iOS and Android hardware before public distribution.

## Operational limitation

This implementation validates the full JavaScript/TypeScript route and bundle graph for iOS and Android. A signed iOS IPA and Android AAB/APK require the user’s Apple/Google signing credentials and release environment; those credentials are intentionally not present in the repository or sandbox.
