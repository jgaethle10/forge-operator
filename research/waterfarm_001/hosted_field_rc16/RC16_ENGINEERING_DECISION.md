# Evercraft Aqua | RC16 release safety and device-acceptance preflight

**Research only, 2026-11-15.** Not deployed, merged, hosted on a trusted Evercraft domain, iPhone-installed, or field validated. No consenting agricultural operator or actual meter data included. RC15 remains unchanged in the historical research branch; RC16 is a separate candidate.

## Changes that matter

1. **Scoped service-worker cache:** RC16 caches only 12 explicitly enumerated first-party static resources under its own service-worker registration scope. Unknown same-origin URLs, other Evercraft products, query-string variants, POSTs and cross-origin requests are never intercepted. This prevents a broad offline worker from inadvertently touching unrelated applications or data routes.
2. **Controlled update behavior:** A new service worker must acquire every static asset before installation succeeds and does not call `skipWaiting()` or `clients.claim()` to replace an active recording tab mid-session. Activation checks completeness before removing older *Aqua field* caches. This is a safety-oriented policy, not proof that every browser update path is bug-free.
3. **Device diagnostics:** A local-only report shows HTTPS, secure context, IndexedDB API visibility, worker-control state, app-shell cache availability and the browser's own storage-persistence response. The diagnostic explicitly **never** reports iPhone/offline/restart acceptance as passed. It transmits no meter IDs or readings.
4. **PWA icons:** Included real PNG sizes 192/512 and 180 Apple touch icon from the owned Aqua SVG art, with updated manifest. Icon is **design/UI** only, not science evidence.
5. **Independent release integrity:** A static SHA-256 manifest and read-only host verifier check the exact public files, HTTPS host identity, JS/manifest/image MIME, critical security headers, and no-cache service-worker script response. A clean result means only **ready for physical device acceptance**, not production release.
6. **First-party infrastructure example:** One non-executed Caddy `handle_path /aqua/*` snippet is included for review within an *existing* Evercraft-owned HTTPS site. It is NOT proof of correct live Caddy routing, DNS, TLS or deploy permissions.

## Actual verification
- 76 local Node tests passed across inherited water/journal/storage models, service-worker safety, static package and new readiness diagnostic; service-worker and IndexedDB tests use mocks, not native iOS.
- 4 local Python host-verifier tests passed: correct hash/header, changed bytes rejected, missing CSP rejected, unapproved host and HTTP rejected. Remote host not contacted.
- 14 headless Chromium **injected-document** scenarios passed at 390px and 1365px, including 15-reading workflow, backup, corrupt backup HOLD, cold restore, diagnostics never self-certifying, no horizontal overflow. This test uses in-memory mock IndexedDB; CSP is removed for the test injection ONLY and independently checked in production static tests.
- Attempted hosted integration from a local HTTP server was **blocked by administrator browser policy**, so no real-service-worker lifecycle, browser-managed IndexedDB durability, installed PWA, native Safari or offline relaunch proof exists.
- GitHub RC15 source verified, both prior Forge checks and Nexus cross-LLM checks were successful. RC16 GitHub CI result separate and pending until run.

## Remaining gates before any real operator pilot
- Owner-approved Evercraft-controlled HTTPS origin, path, DNS, TLS certificate and proper Caddy config; deploy only after independent edge review.
- Read-only static host SHA check; physical iPhone Safari Add to Home Screen, 15 test readings, verify exported backup in Files, force-quit/relaunch, offline relaunch, local data persistence and restore on a clean profile.
- Data are still **unencrypted browser-managed** and not independently verified readings. Require consent/privacy, data-retention and access controls before sensitive site use. The app is not a secure vault.
- Independent meter calibration/identity, site topology, agronomic review and representative water/energy observations are required before any claim of avoided withdrawals or physical water recovery.
- NOAA 2024 Yakima daily data remain archived; 2025 has known missing precipitation, and 2022-23 official full-year verified sequence was still inaccessible here. No invented three-year study.
- The requested real-camera documentary is not completed. Previously rejected CGI/motion graphic previsualizations are not release-ready film; acquire footage rights and actual camera content separately.
- WSU/SYCD outreach drafts remain unsent. No equipment, paid customer, partner or water saving verified.

**Decision:** stage RC16 as a reviewable offline-first app candidate and release protocol; do not merge, host, distribute private field data, or make commercial claims yet.
