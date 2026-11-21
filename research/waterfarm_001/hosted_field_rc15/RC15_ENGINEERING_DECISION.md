# Evercraft Aqua | RC15: first-party hosted/offline field notebook candidate
**Date:** 2026-11-10
**Status:** RESEARCH ONLY. No actual HTTPS deployment, genuine iPhone/Safari storage test, customer/field pilot, physical water savings, or equipment installation.

## Decision
Move from RC14's ephemeral, downloaded-HTML phone-preview model to a **first-party HTTPS origin** with a separately installed Home Screen web app. The service worker caches only static, same-origin application files; meter readings remain **on the user's device** in IndexedDB. No backend accounts, uploads, analytics, remote data processing, cloud sync or pump/valve actuation.

This architecture materially improves the *testability* of a long-lived application. It does **not** guarantee durability, field integrity, data authenticity, encryption, browser storage retention or iOS Home Screen installation until actually exercised on approved infrastructure and real devices. A manual external JSON backup remains essential.

## RC15 changes
1. **New IndexedDB storage adapter** (`app/storage.mjs`) with schema-validated, source-fingerprinted journal restore. Writes and deletion report success only after transaction completion. Empty/invalid storage is never misrepresented as a valid observation. If storage is inaccessible, the app holds instead of allowing unbacked readings.
2. **Optimistic concurrency**: every modification checks the expected prior journal in the same read/write transaction. A second stale tab cannot silently overwrite newer data, and a stale delete cannot clear newer records. User must export, reopen and reconcile on conflict.
3. **App shell** (`index.html` and `app/app.js`) reuses previously tested RC14 calculation engine, restores backups from cold start, exports privacy-sensitive data under user control and avoids claiming water savings or leak detection.
4. **Version-pinned offline worker** (`sw.js`) stores only same-origin static application assets, never meter data or third-party resources, and does not intercept POSTs or cross-origin requests. Scope is relative to approved site path.
5. **Install metadata** (`manifest.webmanifest`) with original Aqua icon and app title. This **requires an approved trusted HTTPS host**; local file previews are intentionally not the release runtime.
6. CSP declares `connect-src 'none'`, same-origin scripts and workers. This reduces accidental app data egress but does not replace HTTPS, host hardening, access restrictions, backup encryption or security review.

## Verification
- RC14 inherited engine tests **51/51 passed** locally in Node 22.16.
- RC15 new storage tests **8/8 passed** with an asynchronous in-memory IndexedDB-like mock, including conflicting-tab writes, corrupt stored value and guarded deletion.
- RC15 static-package checks **6/6 passed** for asset presence, manifest, CSP and absence of remote JS dependencies.
- RC15 service worker event/cache contract tests **5/5 passed** under a simulated worker environment.
- Total **70/70 Node automated tests passed**.
- Chromium *injected-document* DOM checks passed for 390px and 1365px viewports: 15 readings, JSON backup, corrupted-backup HOLD, startup restore and no horizontal overflow, zero page errors. IndexedDB in that test is an **in-memory mock**, not native browser IndexedDB.
- **NOT VERIFIED**: genuine origin navigation in browser, real IndexedDB across process restart, real offline service worker during networking loss, native iPhone Safari, Home Screen install, Keychain/file-provider backup, GitHub CI and production origin. The local browser runner blocks localhost and file navigation by administrator policy, so it cannot complete a live-origin acceptance test.

## Before allowing real operator measurements
1. Owner selects an Evercraft-owned HTTPS origin, server with locked-down static response headers, authentic TLS and access/release controls. No third-party app-builder runtime or public demo upload.
2. Deploy to **private, restricted review path** only; run `tests/hosted_acceptance.py` from a real browser on approved infrastructure and record device/OS, SW registration, IndexedDB restart, cache offline behavior, file import/export, conflicts and backup restore.
3. Test on actual iPhone Safari and Home Screen app, including closing/relaunching, iOS reboot, device storage pressure and app update. Never promise permanent storage.
4. Establish data minimization, secure encrypted backup choice, deletion/retention policy and consent. Do not store customer site address or personal identifiers in public code or screenshots.
5. Sign off operator-supplied meter IDs, topology, calibration date/reference, measurement time and quality before interpreting a *withdrawal baseline*. One meter cannot prove leaks, crop efficiency, water savings or ROI.
6. Scientific research lanes (NOAA multiyear, greenhouse water-quality/energy, controlled test) remain separate. No reused condensate touches crops before professionally reviewed safety and approvals.

## Unresolved companywide truth
- NOAA 2024 Yakima Airport daily station observations preserved in RC05. The 2025 May 22 PRCP gap remains HOLD and complete 2022/2023 official multi-year source ingest was not achieved here. No new real multiyear design result this turn.
- WSU Prosser/South Yakima Conservation District outreach Gmail drafts remain **UNSENT**; no partnerships committed.
- Final live-action film is still awaiting real camera footage and rights clearance. The rejected abstract film is not called finished.
- Research branch is draft/unmerged. No customer paying, commercial public site, farm trial, real water saved or recovery hardware built.
