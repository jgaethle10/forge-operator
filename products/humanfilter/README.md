# Evercraft HumanFilter v0.1.4 | Desktop Chrome beta

HumanFilter gives users local, reversible control over AI-labeled and self-disclosed generated content, selected AI-related topics, and custom keywords on supported Facebook, Reddit and YouTube web feeds.

## Actual capabilities
- Balanced mode hides content with recognized AI disclosure labels or explicit authorship descriptions.
- Strict mode ALSO hides matches on AI-related topic words. A human-written post discussing AI can be hidden in Strict mode.
- Local per-site switches, custom keywords, pause/resume, and "Show once" controls.
- No cloud model, network reporting, accounts, remote code, images uploaded or browsing telemetry. Local Chrome preferences only.

## Not claimed
- No reliable detection of unlabeled AI-generated images, AI-written text or deepfake videos.
- No native Android/iOS Facebook app integration. No guarantee every Facebook, Reddit or YouTube post structure is covered.
- No automatic updates for manually installed unpacked ZIPs. Chrome Web Store review/submission not complete.

## Install the beta
1. Download the packaged ZIP and extract it on desktop.
2. Visit `chrome://extensions` in Chrome, enable Developer mode, and select Load unpacked.
3. Select the **folder containing `manifest.json`**, not the ZIP itself.
4. Visit supported feeds and use the HumanFilter toolbar popup to choose settings.

## Automated tests
Run from the directory containing `extension/` and `tests/`:

- `node --test tests/rules.test.cjs`
- `python tests/browser_smoke.py`
- `python tests/reveal_recycle.py`
- `python tests/feed_stress.py`
- `python tests/popup_smoke.py`

Playwright browser fixtures are local simulations. GitHub Actions also runs a Chromium unpacked-extension test and separately tests public, logged-out website access. Results from controlled changes to real DOM cards are *not* proof of spontaneous AI-media identification.

## Privacy and safety
See `store/privacy-policy.md`. All code is local. Publishing or billing requires separate owner approval and verified readiness. The project is in a dedicated GitHub beta branch, without changes to Evercraft production operator.
