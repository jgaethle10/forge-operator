# Evercraft HumanFilter v0.1.3 | Verification report

**Date:** October 25, 2026
**Release status:** Local beta candidate; not cleared for broad public claims or Chrome Web Store publication.

## Verified with runnable checks

| Check | Result | Evidence / qualification |
| --- | --- | --- |
| Deterministic filtering rules | PASS, 7/7 | `node --test tests/rules.test.cjs` |
| Facebook, Reddit, YouTube simulated-feed flows | PASS, 3/3 | `python tests/browser_smoke.py`; inert fixtures in Chromium, with the production content script inserted using a site-name override |
| Reveal / dynamic recycled feed-card regression | PASS | `python tests/reveal_recycle.py`; virtualized cards cannot inherit a prior post's “Show once” action |
| 300-post dynamic feed stress | PASS | `python tests/feed_stress.py`; 100 content replacements; expected 83 filters; pause removes every overlay |
| Popup/settings interaction | PASS | `python tests/popup_smoke.py`; Chromium popup markup with mocked storage |
| Browser manifest and beta ZIP | PASS | `manifest.json` is at root of installer ZIP; expected scripts and icons present; JSON parsed |

## Open gate: real-world testing

**Not verified:** A user installing the extension in a normal desktop Chrome session and browsing actual logged-in or public Facebook, Reddit, and YouTube pages. Network navigation is blocked in this testing container (`net::ERR_BLOCKED_BY_ADMINISTRATOR`), including localhost and file/data navigation. A test attempting to route live domain URLs to fixtures failed at navigation before content scripts could execute. No tool currently available in this session can trigger Evercraft Saban compute jobs; Evercraft's connected capability directory is discovery-only. **Do not treat passing in-memory browser tests as proof of live-site compatibility.**

## High-priority deployment decisions

1. Run an independent external computer test in desktop Chrome. On each supported site, verify installation, real labeled content filtering, normal human posts left alone, Strict mode, site switch, Show once, and page scrolling. Capture screenshots and issues.
2. Validate current DOM selectors and accessible labels against real pages for logged-in users and public views.
3. Review Chrome Web Store developer enrollment, app privacy claims, screenshots, and publishing approval. Publish only after actual testing.
4. Keep description narrow: opt-in label/phrase filter, not an AI-authorship detector. This is not a mobile Facebook/Reddit/YouTube app filter.

## Reproduction commands

From the source archive root, with Node.js, Python, Chromium, and Playwright installed:

```bash
node --test tests/rules.test.cjs
python tests/browser_smoke.py
python tests/reveal_recycle.py
python tests/feed_stress.py
python tests/popup_smoke.py
```

The optional `tests/extension_e2e.py` uses real public host URLs with intercepted fixture responses and may fail in restricted environments. It has **not** passed in the current sandbox.

## v0.1.3 local checks on 2026-10-26

8/8 deterministic rules, 3 mocked feeds, Shorts card and AI-info leaf-label regression, reveal/card recycling, 300-post stress, popup all passed. Additional public Chrome test (v0.1.2): actual YouTube loaded but synthetic probe failed; Reddit HTTP 403; Facebook login wall; not a verified live-media detection result. Full live-site gate remains OPEN.
