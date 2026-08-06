# Nationwide Accessibility and Low-Bandwidth PWA Browser Check

**Build under review:** local production bundle created during nationwide rollout readiness remediation.

**Route:** `/accessibility-center`

The route resolves successfully from the compiled PWA. It renders labeled switch controls for screen-reader guidance, keyboard-first navigation, high contrast, simplified workflow density, guided task steps, reader-friendly letter spacing, and low-bandwidth mode. The accessible control labels are exposed to the browser accessibility tree.

The page states that preferences are browser-local display choices and explicitly preserves required review, verification, consent, and statutory workflow steps. It provides clear support, assisted-service, and guided-onboarding handoffs. Low-bandwidth mode correctly describes its presentation-only boundary and makes clear that governed map and document operations still require an approved online connection.

This check does not replace formal assistive-technology testing, language/localization review, device-lab testing, or assisted-service operational acceptance in a target jurisdiction.

## Preference interaction check

The **Low-bandwidth mode** switch was toggled in the compiled PWA. The visible connectivity card changed to **Low bandwidth**, the current-posture badge updated, `document.documentElement.dataset.lowBandwidth` became `"true"`, and the browser-local preference record persisted `lowBandwidth: true`.
