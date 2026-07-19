# External Planning Notes

## Physical-device PWA validation

Source: MDN, "Making PWAs installable" — https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable

Key points captured:
- Chromium-based browsers require a manifest with `name` or `short_name`, 192px and 512px icons, `start_url`, `display` and/or `display_override`, and `prefer_related_applications` either absent or `false` for installability.
- Installable PWAs must be served over HTTPS, or from localhost / 127.0.0.1 for local development.
- iOS 16.4+ allows installation from the Share menu in Safari, Chrome, Edge, Firefox, and Orion; earlier iOS versions only allow Safari installation.
- The `beforeinstallprompt` event can be used to present custom install UI, but this is not supported on iOS.

Source: web.dev, "What does it take to be installable?" — https://web.dev/articles/install-criteria

Key points captured:
- Chrome install promotion also depends on user engagement heuristics: at least one interaction and at least 30 seconds of viewing time.
- The app must be served over HTTPS.
- Required manifest fields for install promotion include `short_name` or `name`, 192px and 512px icons, `start_url`, `display`, and `prefer_related_applications` not present or false.

Source: Chrome DevTools, "Debug Progressive Web Apps" — https://developer.chrome.com/docs/devtools/progressive-web-apps

Key points captured:
- The Application > Manifest tab exposes installability issues and manifest errors.
- The Service Workers tab can emulate Offline mode, force update on reload, emulate Push and Sync events, and inspect registrations.
- For genuine mobile installation testing, Chrome recommends connecting a real mobile device through remote debugging and triggering install on the connected device.
- The Install app feature in desktop DevTools does not simulate the full mobile install workflow.

## Polygon Mumbai deployment reality

Source: Alchemy blog, "Polygon Mumbai Support Ending April 13th - Migrate to Amoy" — https://www.alchemy.com/blog/polygon-mumbai-testnet-deprecation

Key points captured:
- Polygon Mumbai testnet was deprecated in April 2024.
- Migration guidance points developers toward Polygon Amoy instead of Mumbai for live testnet activity.

Source: Polygon ecosystem migration references surfaced by search
- Sequence migration note: https://sequence.xyz/blog/deprecation-mumbai-testnet
- Polygon forum tooling note: https://forum.polygon.technology/t/pos-tooling-after-mumbai-deprecation-no-action-required/13740
- Venly migration note: https://docs.venly.io/changelog/12-april-2024-migration-from-mumbai-to-amoy-for-polygon-testnet
- Amoy explorer: https://amoy.polygonscan.com/

Working interpretation for planning:
- A literal "live Polygon Mumbai deployment" is now a legacy-target request and should be treated as a compatibility / migration discussion, not a recommended fresh deployment target.
- The operational plan should therefore include two branches: (1) legacy Mumbai verification constraints if the user insists on historical compatibility, and (2) the recommended Amoy-based deployment path for current live testnet validation.
