# Anniston AAAR Flight Range: owned Safari launch gate

**Status:** source-release candidate only. **Do not claim a working iPhone website until a separately observed Safari test passes.** Issue: #2363; parent AAAR program: #2285.

## Why this is a separate release
The AAAR dashboard HTML attachment loaded in the ChatGPT in-app file viewer, but taps on Start, Foundry and Controls did nothing. The `scriptBlocked` warning remained on screen, strongly indicating JavaScript was disabled by the attachment viewer. A different HTML attachment is not a fix.

This release moves the **existing self-contained, 79 KB flight page** into `public/worlds/flight/index.html` on a narrowly scoped PR separate from the unfinished AAAR dashboard. The already-owned Worlds vault can serve ordinary static files under `/worlds/` using the current `public` root. This avoids embedded iframes, external scripts, CDN dependencies and any new third-party runtime.

## Owner-side promotion, with zero shared-edge modifications
1. Require a reviewed and accepted SHA on the canonical GitHub `main` branch. **Never pull a draft branch into the live Worlds vault.**
2. On the already-owned Worlds host, inspect `systemctl --user status evercraft-worlds-vault.service` and ensure its `--public-root` points at the intended pinned release's `public` directory. No claim that a running service is currently active.
3. Confirm that the release's `public/worlds/flight/index.html` exists and matches the accepted GitHub blob. The current Worlds vault's static handler resolves `/worlds/flight/` to `public/worlds/flight/index.html` without separate special routing. **Do not edit shared Caddy configuration, edge leases, DNS or expose port 8788** for this release.
4. Using the host's existing local loopback-only Worlds listener, read `http://127.0.0.1:8788/worlds/flight/`. Check HTTP 200, content type `text/html`, page title and JS payload. A loopback check does **not** prove HTTPS.
5. From a separate network, read the already-controlled `https://worlds.systemiacommandcenters.com/worlds/flight/`. Verify TLS, HTTP 200, page SHA and no CSP or injected wrapper preventing the inline JS.
6. With Playwright installed for tests only, run `node scripts/probe-aaar-mobile-browser.mjs https://worlds.systemiacommandcenters.com/worlds/flight/`. This is **mobile Chromium emulation**, not physical Safari.
7. Open exactly that HTTPS URL in the physical iPhone's **Safari app**, not a ChatGPT file attachment. Tap **Design your own machine**, modify a parameter, Close, **Enter Flight Range**, then test throttle, bank, Pause/Resume, Save Flight, and a page reload. Validate download and restore behavior under denied browser storage and Low Power Mode.
8. Retain acceptance receipt: deployed commit and SHA256, client Safari and iOS versions, date/time, button results, console or on-screen failures, privacy status, and rollback command tied to the prior release. Only then close issue #2363 or advertise a playable iPhone URL.

## Owned-route byte identity check

From the pinned GitHub checkout on the already-owned Worlds node, run `node scripts/probe-aaar-owned-flight-route.mjs`. It requests the exact local vault route and independently resolved HTTPS route and compares both against SHA-256 of the local `public/worlds/flight/index.html`. The output is an inspection receipt only, **never a user-facing claim of full functionality**. It intentionally reports `physical_iphone_safari_verified:false` and `release_authorized:false` even when both byte checks pass. Run `--local-only` only to diagnose the loopback service; that mode cannot return verified.

## Release checks
- `node --test tests/aaar-flight-static.test.mjs` runs without third-party packages and catches broken scripts, missing controls, iframes, remote assets, route or disclaimers.
- `node scripts/probe-aaar-mobile-browser.mjs <exact-owned-https-url>` requires Playwright dev tooling and does not publish anything.
- A CI/browser pass or existence in GitHub is not a real-device acceptance result.

## Safety / truth boundary
This is a synthetic entertainment and preliminary science-screening flight model. It does not command physical aircraft, prove flightworthiness, supply aeronautical engineering validation, or establish connection to the authoritative Evercraft World Engine. Gameplay records remain `UNVALIDATED_GAMEPLAY`.
