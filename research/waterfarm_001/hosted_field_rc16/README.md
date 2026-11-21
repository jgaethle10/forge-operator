# Evercraft Aqua Field Notebook RC16

**Review build only**, intended for a manually approved and controlled **Evercraft-owned HTTPS origin**. The app is not publicly deployed or verified on iOS and is **not** a water-saving certification, water-use permit, pump controller or private-data security vault.

## Features
- Previous RC15 self-contained HTML/JS water-meter notebook, 15 dated readings, 14 baseline intervals, optional kWh, offline backup and restore, unencrypted on-device IndexedDB, and optimistic concurrent write checks.
- RC16 hardened same-origin, exact-file allowlisted service worker (only 12 immutable static assets); failed update does not automatically replace an open session, no broad request interception.
- Device diagnostics for local storage API, active worker and browser persistence *claims*, which explicitly never certify offline relaunch or native Safari behavior.
- PWA/Apple PNG icon assets, owned SVG icon, and no remote code or endpoints.
- Exact static build manifest and **read-only** host verifier checking SHA, MIME and security headers.

## Run local tests

```bash
node --test tests/*.test.mjs
python -m unittest discover -s tests -p 'test_hosted_verifier.py' -v
python tests/browser_injected_qa.py
```

The headless browser is **DOM-injection QA** with fake IndexedDB, not a real origin or service worker test. The separately supplied `tests/hosted_acceptance.py` remains deliberately blocked in this execution environment and is for an authorized owned worker or real site only. Do not equate unit/mock tests with physical-device persistence.

## Hosted release steps (not executed)
1. Have the Evercraft infrastructure owner approve an existing HTTPS site and `/aqua/` path; do not use Base44/TinyFish or third-party managed runtime.
2. Review `deployment/Caddyfile.aqua.example` against the existing routing config. Serve only static top-level files, `app/` assets and approved icons. Never expose test scripts, backups or farmer data on the website.
3. Generate/check `RC16_RELEASE_SHA256.json` and then run **read-only** `deployment/verify_hosted.py --url https://approved-host/aqua/ --expected-host approved-host`.
4. Complete `deployment/REAL_IPHONE_ACCEPTANCE.md` on an actual device before any user or customer records.
5. Obtain written operator consent and independent calibration/topology review before running a real meter baseline. Do not claim leaks, actual water savings, crop benefits or ROI from the app.

Prior RC15 file-preview/local storage does not migrate automatically to the new origin. Explicit human-reviewed external backup migration only. The app has no accounts, cloud storage or data sharing.
