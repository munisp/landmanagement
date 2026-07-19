# Physical-Device PWA Validation and Polygon Testnet Deployment Plan

**Author:** Manus AI  
**Date:** 2026-07-19

## Executive Summary

The repository is now at a stage where most remaining high-visibility gaps are no longer ordinary code-implementation tasks inside the application itself. The dominant outstanding work has shifted into **environment-execution validation**, especially for **physical-device PWA behavior** and **live blockchain deployment verification**. This means the next delivery phase should be handled as an operational rollout program with controlled staging, evidence capture, and explicit pass/fail gates rather than as another pure coding sprint.

A critical qualification is required for the blockchain side. The user asked for a **live Polygon Mumbai deployment**, but the broader Polygon ecosystem deprecated Mumbai in 2024 and moved testnet workflows to **Polygon Amoy** [1] [2]. Therefore, the operationally correct plan is to treat **Mumbai as a legacy compatibility target** and **Amoy as the recommended live testnet path**. If strict Mumbai verification is still mandatory for contractual or historical reasons, it should be executed only as an exception path with explicit acknowledgement of toolchain and explorer limitations.

| Workstream | Current Status | Nature of Remaining Work | Recommended Outcome |
|---|---:|---|---|
| PWA installability and offline architecture | Implemented in repository | Real-device execution and evidence capture | Physical-device validation campaign |
| PWA multilingual and responsive behavior | Implemented and smoke-tested in-browser | Device-specific install and offline UX confirmation | iOS/Android acceptance matrix |
| Smart contracts and wallet integration | Implemented in repository | Live wallet-funded deployment and explorer verification | Prefer Polygon Amoy rollout |
| Blockchain service configuration | Implemented in repository | Environment variable population and post-deploy address confirmation | Deployment checklist and cutover |
| Production mobile acceptance | Partial in sandbox | Manual device execution, screenshots, and issue log | Formal acceptance sign-off |

## Part I: Physical-Device PWA Validation Plan

The purpose of the PWA validation program is to convert the repository's already-implemented installability, offline support, synchronization behavior, multilingual metadata, and responsive UI into **auditable evidence** that the application behaves correctly on real hardware. The repository already includes manifest, service-worker, install-prompt, offline queue, multilingual runtime metadata, and responsive smoke-test foundations. What remains is a structured physical-device campaign.

### 1. Validation Objectives

The physical-device program should prove five things. First, the application is **installable** on supported mobile browsers. Second, the installed application launches with the expected standalone shell and identity. Third, the application behaves correctly with **unstable and offline networking**, especially for field workflows. Fourth, the application remains usable under **language switching, RTL layout, and responsive constraints**. Fifth, queued field records recover safely when connectivity returns.

| Objective | Repository Basis | Device Evidence Required | Exit Criterion |
|---|---|---|---|
| Installability | Manifest, icons, install prompt, HTTPS-ready structure | Install prompt screenshots and install success log | App installs on target devices |
| Standalone launch | Display configuration and app shell | Launch from home screen / app icon | No browser-chrome dependency for normal use |
| Offline behavior | Service worker, offline queue, field sync logic | Airplane-mode test results | Core field actions continue offline |
| Multilingual / RTL | i18n runtime fixes and smoke tests | On-device language screenshots | Correct `lang` / direction behavior on device |
| Recovery and sync | Queue flush logic, pending-sync status | Network drop / restore evidence | Queued items synchronize without corruption |

### 2. Device Matrix

The validation matrix should cover the platforms that matter operationally for field staff, administrators, and public users. At minimum, the campaign should include one recent Android phone, one mid-tier Android phone, one iPhone on a currently supported iOS version, and optionally one iPad if tablet support matters for registrar or surveyor desks.

| Device Class | Browser / Install Path | Why It Matters | Minimum Test Depth |
|---|---|---|---|
| Android flagship or recent midrange | Chrome | Best-supported PWA install flow | Full install + offline + push + camera/GPS |
| Android alternate browser | Samsung Internet or Edge | Chromium variance check | Install + launch + offline smoke |
| iPhone | Safari Share-menu install | iOS home-screen behavior | Install + relaunch + offline + camera/GPS |
| iPhone alternate browser | Chrome / Edge on iOS 16.4+ | Share-menu install path variance | Install and relaunch smoke |
| Tablet optional | Safari or Chrome | Layout and touch-target confirmation | Responsive and workflow smoke |

### 3. Preconditions

Before running the device campaign, the team should prepare a controlled test environment. The app must be hosted on **HTTPS** because install promotion requires HTTPS or localhost during development [3] [4]. The deployment should use stable environment variables, production-like asset paths, and externally reachable URLs. A seeded test dataset should already exist for parcel search, field records, mortgage, tax, and verification workflows so the team can spend test time validating behavior instead of manufacturing data on-device.

The team should also confirm manifest completeness, including `name` or `short_name`, 192px and 512px icons, `start_url`, display mode, and the absence of `prefer_related_applications: true`, because Chromium install promotion depends on these fields [3] [4]. Chrome's install promotion also depends on user engagement heuristics, so the test runbook must include at least one user interaction and sufficient dwell time before concluding that no prompt appears [4].

### 4. Test Phases

#### Phase A: Installability Verification

The first phase verifies that the application is recognized as installable. Use Chrome DevTools Application > Manifest and Service Workers panels for preflight inspection, then move to real devices. Chrome DevTools specifically notes that desktop install simulation does **not** fully represent the genuine mobile installation flow; real-device testing should be performed via remote debugging where possible [5].

On Android, testers should open the landing page, interact with the page, wait through the engagement threshold, and verify the address-bar or menu install affordance. On iOS, testers should verify install via the Share menu path. Evidence should include screen recording or screenshots of the install entry point, the installed icon, and the first standalone launch.

#### Phase B: Launch and Shell Validation

After installation, testers should launch from the home screen or app surface, confirm the app name, icon, splash behavior, orientation expectations, standalone chrome behavior, and preserved session state. This phase should also confirm that deep links return to the expected entry experience and do not break routing.

#### Phase C: Offline and Recovery Validation

This is the most important functional phase for the platform's field workflows. Testers should enter the FieldSurveyor workflow, create records while offline, attach images, voice notes, checklists, signatures, QR-derived data, and report exports, then restore connectivity and verify queue flush completion. The expected outcome is that pending items remain visible locally while disconnected and synchronize safely without duplicate or corrupted submissions when the network returns.

#### Phase D: Device Capability Validation

The application now includes camera, GPS-oriented field flows, haptic interactions, touch-target hardening, multilingual page support, and mobile-specific UI patterns. The device campaign should therefore include camera capture, geotag capture, QR/barcode capture from camera input, signature drawing, language switching, RTL rendering, and tactile-response verification where supported by the browser and device OS.

#### Phase E: Regression and Evidence Capture

The final PWA phase should repeat a compressed set of flows after clearing site data and after reinstalling, ensuring that no hidden cache artifact is responsible for a passing result. Each test should produce evidence: screenshots, logs, defect IDs, and a final pass matrix.

### 5. Detailed Test Checklist

| Area | Test | Expected Result | Evidence |
|---|---|---|---|
| Manifest | Manifest fields visible and valid | Installability criteria satisfied | DevTools screenshot |
| Install prompt | Install affordance appears | Prompt appears after interaction and dwell | Screen recording |
| Home-screen install | App icon created | Installed icon matches manifest identity | Screenshot |
| Standalone launch | App opens without normal browser chrome | Standalone shell confirmed | Screenshot |
| Offline queue | Create field record offline | Item remains queued locally | Screenshot + local status |
| Sync recovery | Restore connectivity | Queue flushes successfully | Before/after state |
| Camera | Capture photo attachment | Photo persists in record | Screenshot |
| QR/barcode | Scan from camera capture | Parsed value appears in workflow | Screenshot |
| Signature | Capture field signature | Signature persists locally and after sync | Screenshot |
| Voice notes | Record and attach note | Voice note metadata persists | Screenshot |
| Language switch | Switch among supported languages | UI changes correctly | Screenshots |
| RTL | Arabic layout direction | Direction and text flow correct | Screenshot |
| Responsive | Narrow viewport interaction | No blocking overflow in core tasks | Screen recording |

### 6. Defect Classification

Any device issue found should be classified immediately as one of four categories: **Installability**, **Offline/data durability**, **Device capability integration**, or **Presentation/accessibility**. This matters because installability and offline durability are release-blocking for field deployment, while some presentation issues can be triaged by severity.

| Severity | Meaning | Example | Release Effect |
|---|---|---|---|
| Sev 1 | Blocks install or data safety | Offline queue loses data | Stop release |
| Sev 2 | Major workflow failure | GPS capture fails on supported device | Stop field rollout |
| Sev 3 | Usability regression | Layout wraps poorly but task completes | Fix before wide rollout if feasible |
| Sev 4 | Cosmetic issue | Minor alignment or icon clipping | Can defer with ticket |

### 7. PWA Deliverables

The physical-device campaign should end with a concise but auditable bundle consisting of a device matrix, pass/fail table, screenshot pack, screen recordings for key flows, an issue log, and sign-off from the operational owner. Without this evidence, the platform should be described as **repository-ready but not yet physically validated**.

## Part II: Live Polygon Deployment Plan

### 1. Strategic Clarification: Mumbai vs Amoy

A strict "live Polygon Mumbai deployment" is no longer the best operational target because Mumbai was deprecated and the ecosystem moved testnet workflows to **Amoy** [1] [2]. The correct delivery plan is therefore bifurcated.

> **Recommended path:** deploy the repository's smart contracts and wallet-integrated flows to **Polygon Amoy** for current live testnet validation.

> **Legacy exception path:** if a stakeholder explicitly requires Mumbai references for compatibility or historical documentation, preserve the documentation but do not treat fresh Mumbai deployment as the primary rollout target.

| Path | Recommendation | Rationale |
|---|---|---|
| Polygon Amoy | Recommended | Current supported Polygon testnet path |
| Polygon Mumbai | Legacy / exception only | Deprecated ecosystem target |
| Mainnet Polygon PoS | Not for this tranche | Requires separate production governance |

### 2. Deployment Objectives

The blockchain rollout should prove that contracts can be deployed from the repository, addresses can be injected into runtime configuration, wallet flows operate against the target network, and transaction evidence is visible in the corresponding block explorer. The repository already contains contract code, deployment scripts, wallet integration, blockchain service configuration, and identity/transaction flows. The remaining work is operational deployment with real credentials, funded wallets, and explorer verification.

### 3. Preconditions

Before deployment, the team should prepare a funded deployer wallet, a clean `.env` or secret-management path, RPC provider credentials, and explorer API credentials if contract verification is required. The team should also identify the exact contract inventory to be deployed: at minimum the property transfer, escrow, and multisignature contracts.

A formal change gate should confirm the following:

| Precondition | Required State |
|---|---|
| Network choice | Amoy preferred; Mumbai only if explicitly mandated |
| Wallet | Dedicated deployer account with testnet funds |
| RPC access | Stable provider endpoint configured |
| Explorer access | Amoy Polygonscan verification path available |
| Secrets | Stored outside source control |
| Contract version | Git commit and tag frozen before deploy |
| Rollback plan | Previous config preserved |

### 4. Deployment Phases

#### Phase A: Environment Preparation

Freeze the contract source revision, install dependencies, and populate environment variables for RPC URL, chain ID, private key or secure signer path, and explorer verification credentials. Confirm that no placeholder addresses remain in the blockchain service or front-end wallet configuration.

#### Phase B: Local Dry Run

Execute the deployment scripts locally against a dry-run environment first. The goal is to prove that the deployment pipeline itself works end to end before any live testnet broadcast. Capture generated artifact files, contract ABIs, and deployment metadata.

#### Phase C: Live Testnet Deployment

Broadcast the contracts to the selected network. For the recommended path, this means **Polygon Amoy**. Record transaction hashes, deployed addresses, gas costs, and deployment timestamps. Immediately store the contract addresses in the runtime configuration path consumed by the blockchain service.

#### Phase D: Explorer Verification

Verify the contracts in the relevant explorer. For the recommended path, use the **Amoy Polygonscan** explorer [2]. The team should confirm source verification success and make sure constructor arguments are archived.

#### Phase E: Runtime Wiring

After deployment, update the backend blockchain service configuration and any frontend network metadata required for wallet interaction. Then re-run the blockchain-integrated flows: wallet connect, escrow creation, verification view, and transaction lookup.

#### Phase F: End-to-End Transaction Validation

Run a full transactional scenario: connect wallet, initiate a blockchain-backed action, create or update escrow, verify transaction hashes, and confirm that the application displays explorer-verifiable proof. This is the true completion criterion for blockchain rollout.

### 5. Recommended Amoy Deployment Checklist

| Step | Owner | Output |
|---|---|---|
| Fund deployer wallet with testnet POL | DevOps / Web3 engineer | Wallet balance confirmed |
| Set RPC and signer secrets | DevOps | Valid environment configuration |
| Freeze contract commit SHA | Engineering lead | Deployment baseline |
| Run local dry deployment | Web3 engineer | Dry-run artifacts |
| Broadcast contracts to Amoy | Web3 engineer | Transaction hashes |
| Verify contracts on explorer | Web3 engineer | Verified source pages |
| Update app config with addresses | Backend engineer | Runtime config updated |
| Smoke-test wallet flows | QA / engineer | Validation notes |
| Capture deployment evidence | Release manager | Deployment log bundle |

### 6. Legacy Mumbai Exception Plan

If a stakeholder still insists on "Mumbai" by name, the project should document that the ecosystem deprecated Mumbai and that fresh deployment there is not the recommended current practice [1]. In that case, the team should perform a decision review rather than forcing the repository into an obsolete target. The options are to migrate the requirement to **Amoy**, preserve Mumbai references only in documentation, or accept a higher-risk exception workflow if a still-functioning legacy RPC / explorer path is available.

### 7. Risks and Controls

| Risk | Impact | Control |
|---|---|---|
| Deploying to deprecated Mumbai target | Wasted effort or broken verification | Prefer Amoy and document exception path |
| Wrong contract addresses in runtime config | Broken wallet and escrow flows | Post-deploy config checklist and smoke tests |
| Unfunded or compromised deployer wallet | Deployment failure or security risk | Dedicated funded test wallet and secret handling |
| Explorer verification mismatch | Reduced trust and auditability | Archive compiler settings and constructor args |
| UI/network mismatch | Wallet connects but transactions fail | End-to-end live smoke test after config update |

## Part III: Recommended Immediate Next Actions

The next operational move should not be another large coding sprint. The highest-value step is a **deployment-readiness execution package** that converts the repository's code completeness into real-world acceptance evidence.

| Priority | Action | Why It Comes Next |
|---:|---|---|
| 1 | Freeze current repository state and create release candidate tag | Stabilizes evidence collection |
| 2 | Run physical-device PWA campaign on Android and iPhone | Closes the largest remaining mobile blocker class |
| 3 | Choose Amoy as the live Polygon testnet unless user explicitly overrides | Aligns with current Polygon ecosystem reality |
| 4 | Perform live contract deployment and explorer verification | Converts repository integration into auditable external proof |
| 5 | Update final blocker register with screenshots, hashes, and explorer links | Produces release-grade handoff evidence |

## References

[1]: https://www.alchemy.com/blog/polygon-mumbai-testnet-deprecation "Polygon Mumbai Support Ending April 13th - Migrate to Amoy"
[2]: https://amoy.polygonscan.com/ "TESTNET Polygon PoS Chain Amoy (POL) Blockchain Explorer"
[3]: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable "Making PWAs installable - Progressive web apps | MDN"
[4]: https://web.dev/articles/install-criteria "What does it take to be installable?"
[5]: https://developer.chrome.com/docs/devtools/progressive-web-apps "Debug Progressive Web Apps"
