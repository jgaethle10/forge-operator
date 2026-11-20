# AAAR iPhone launch blocker: 2026-11-19

**Status: BLOCKED / NOT PUBLICLY RELEASED.** A user-supplied iPhone screen recording shows `anniston-aaar-v0.7-flight.html` opened inside the ChatGPT in-app file viewer. Taps on **Design your own machine**, **Enter Flight Range**, and **View Controls** do nothing. The persistent `#scriptBlocked` banner is a JavaScript-execution sentinel: a separate inline script should remove it. Its presence throughout the recording supports that the preview disabled page JavaScript, rather than the flight physics failing.

## Delivery correction

Never deliver a `sandbox:/mnt/data/*.html` preview as a functional iPhone release. A ZIP download, GitHub blob page, or raw file URL is also **not** proof of a working web app. Deploy only through Evercraft-owned HTTPS infrastructure, not a third-party host. `public/worlds/flight/index.html` is the intended Worlds route; publication requires source-pinned approval through Systemia.

## Release acceptance

1. Verify the exact deployed Git commit; confirm `public/worlds/flight/index.html` belongs to the deployed release, not merely a draft PR branch.
2. Have the existing Evercraft Worlds owned vault and edge serve `https://worlds.systemiacommandcenters.com/worlds/flight/`; do not modify unrelated Caddy routes or expose port 8788.
3. Check HTTPS, HTTP 200 with `text/html`, correct source content and CSP compatible with this inline-script application. A working page shell is insufficient.
4. Run `node scripts/probe-aaar-mobile-browser.mjs https://worlds.systemiacommandcenters.com/worlds/flight/` using Node 22+ and Playwright/Chromium. A pass verifies mobile **Chromium emulation only**.
5. Open the same HTTPS URL directly in **physical iPhone Safari**, not the ChatGPT attachment viewer. Verify Design → Close → Enter Flight → touch throttle/turn → Pause → Save; record actual touch behavior, the device/iOS/browser, deployed commit and a release receipt.
6. Test Safari after lock/reload, denied browser storage, and low-power mode. Fail closed for nonresponsive controls. Release remains blocked until actual iPhone and HTTPS deployment receipts are attached.

## Evidence boundary

- AAAR 0.7 HTML inline scripts parse in Node. Syntax validity does not prove execution in ChatGPT's file viewer.
- The recorded persistent script warning demonstrates the noninteractive preview delivery problem.
- The GitHub default branch did not contain `public/worlds/flight/index.html` when checked. Flight page is present in draft PR #2288 only.
- Public Worlds/AAAR flight HTTPS ingress was not independently reachable during this session. No public working URL may be claimed.
- Tests and automated Chromium emulation do **not** verify physical iPhone Safari. The flight world remains a synthetic gameplay model, not an aerodynamics certification.
