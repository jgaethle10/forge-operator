# Evercraft HumanFilter · v0.1.2

An intentionally simple, **local-only browser extension** to soften posts explicitly labeled or disclosed as AI-generated, or posts matching terms the user chooses. Developed as a limited beta candidate on October 25, 2026.

## What it does

- Chrome Manifest V3 extension for **desktop Chrome / Chromium** on Facebook, Reddit, and YouTube.
- Balanced mode: notices on posts with recognized AI labels or AI-generation disclosures.
- Strict mode: Balanced plus AI topic words; prone to false positives.
- User-defined keywords; independently enabled sites; instant enable/disable switch.
- Reversible notice with **Show once**.
- Entirely local: no API requests, trackers, login, backend, or payments.

## What it DOES NOT do

No image classification, neural detector, C2PA validation, blanket blocking of AI, or ability to certify human authorship. Unlabeled AI may stay visible, and ordinary posts may be hidden. Posting about AI is *not* proof of generation. This is a **content preference filter**, not an authenticity detector.

## Install for beta testing (desktop Chrome)

1. Download and unzip `Evercraft-HumanFilter-v0.1.2.zip`.
2. In desktop Chrome open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and choose the unpacked folder containing `manifest.json`.
4. Open a supported social feed, then click the HumanFilter extension icon to configure it.

On YouTube, visit the video listing or homepage for demonstration posts. Reload pages after installing. This unpacked installation does **not** auto-update and should be used for tester builds only.

## Architecture

`extension/manifest.json` declares minimal `storage` permission and narrowly scoped content scripts. `rules.js` implements deterministic matching; `content.js` observes dynamic site posts and swaps in a reversible notice. `popup` exposes settings; `options.html` documents limitations and privacy.

## Validation

Run `node --test tests/*.test.cjs`, `python tests/browser_smoke.py`, `python tests/reveal_recycle.py`, `python tests/feed_stress.py`, and `python tests/popup_smoke.py`. Browser integration tests run on isolated HTML fixtures, not live social feeds. Verify live layouts manually after platform changes; mock-fixture passes do not guarantee production websites will match.

## Verification report

See `QA_REPORT.md` for pass/fail evidence and the explicit real-site compatibility blockers.

## Publishing

The Chrome Web Store requires an enrolled publisher, one-time registration fee, store assets, public privacy policy URL where needed, review, and acceptance. Do not claim store publication until the live store listing exists. The checked-in `store/` directory contains proposed listing copy. This repository version does not run a payment or email collection workflow.

## Privacy

See `extension/options.html` and `store/privacy-policy.md`. No post content leaves the browser. Settings remain in `chrome.storage.local`.

© 2026 Evercraft LLC. All rights reserved. No third-party social platform endorsement.

## Self-hosted beta download page

`launch-site/` is a deployable static HTML/CSS directory with the actual extension ZIP, source ZIP, privacy page, and a settings-panel screenshot. Serve over HTTPS on your own site after checking hostname and hosting privacy practices. The `Evercraft-HumanFilter-Launch-Site-v0.1.2.zip` archive contains this directory at its root. No hosting has been configured here.
