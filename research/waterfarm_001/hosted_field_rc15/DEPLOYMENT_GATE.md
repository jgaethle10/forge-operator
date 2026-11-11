# RC15 first-party deployment gate (for authorized Evercraft infrastructure only)

**Do not deploy automatically.** This is an operator checklist and acceptance plan; no current Evercraft domain or server is assumed accessible in this environment.

## Recommended initial posture
- Serve static files from an Evercraft-controlled HTTPS origin with an owner-approved path and TLS certificate. No third-party code/runtime dependencies or externally embedded media.
- Use `Content-Type: application/manifest+json` for `manifest.webmanifest`, `image/svg+xml` for `icon.svg`, and valid JS MIME for `.mjs` and `.js`. Avoid cache-stranding `sw.js`; serve it with `Cache-Control: no-cache`.
- Configure HTTPS redirection, HSTS only after domain validation, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` restricting needless sensors, and a CSP header at least as strict as the in-page CSP. Verify inline style exception is limited to current UI.
- Do not serve the private operator data or backups from this static origin. Do not put upload endpoints behind a caching service worker.
- Test service-worker rollback, not just initial install. If a broken static asset or worker ships, publish a new worker cache version and confirm previous installs recover safely.
- Do not force consumers to trust a code-signing or HTTPS origin without a clear owner-controlled domain and visible privacy policy.

## Manual host acceptance
- Install as Home Screen app from the verified HTTPS site, not a downloaded ChatGPT HTML file.
- Record 15 consecutive *test fixture* readings; close tabs, reopen, force-quit Safari and launch again. Validate all 15 retained or trigger explicit recovery.
- While offline, restart the already-installed app and verify the full static interface still runs. Only label this OFFLINE VERIFIED after actual device evidence.
- Corrupt backup, stale-tab update, invalid date, meter reset and unavailable storage must all HOLD without destroying valid previous data.
- Export JSON and CSV, inspect exact contents in iPhone Files, restore on a separate clean device/origin under operator control; no automatic cloud migration.
- Remove all synthetic fixtures before any real measurement. Consent, calibration, topology and privacy review are independent human tasks.

## Why this is not yet a commercial release
Installed PWA support is a browser feature, not a guarantee of unencrypted database durability. Water measurements are self-reported. Data hash proves integrity relative to its own source, never who measured it or whether physical instruments were calibrated. Water savings and leak-detection claims require a designed experiment and independent review.
