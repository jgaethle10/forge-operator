# HumanFilter 0.1.2: launch verification / outstanding gates

Build date: 2026-10-25

## Verified locally
- Manifest V3 extension zip has `manifest.json` at its root.
- 7 deterministic matcher unit tests passed.
- 3 mocked social-feed browser fixtures passed with rescan, reveal, pause/resume, and DOM changes.
- Feed recycle reveal regression and 300-post Chromium stress fixture passed.
- Browser popup settings smoke passed for Strict/Balanced, per-site switch, keyword persistence and power switch.
- Static website and privacy page links resolve inside the packaged site; desktop and mobile rendering checks passed.
- No backend, remote AI or tracking calls are present in extension source.

## Still requires verification
- Actual desktop Chrome installation, across *live* Facebook, Reddit and YouTube pages.
- Publishing/hosting the landing site on an Evercraft-controlled HTTPS domain.
- Checking public download, browser CORS behavior, and hosted privacy page.
- Chrome Web Store publisher registration/account access (fee and 2FA if not already enrolled), screenshots from live use, disclosures and review.
- Chrome Web Store approval and store URL. Do not claim Web Store listing yet.
- Trademark/name check before larger commercial launch.

## Product claims
- Filter configured phrases and recognized disclosure labels on selected social feeds.
- Does NOT infer or certify AI authorship, analyze imagery/videos, or work inside native iOS/Android social apps.
- Free beta, no checkout or revenue receipts.

## Build integrity
- Installer: `Evercraft-HumanFilter-v0.1.2.zip`. For manual Chrome Developer Mode load, extract and select `extension/` from the extracted top-level directory if using original repo files. For the installer zip with manifest at root, select the unzipped root itself.
- `Evercraft-HumanFilter-source-v0.1.2.zip`: readable source, docs, tests.
- `Evercraft-HumanFilter-Launch-Site-v0.1.2.zip`: static website root with download assets.
