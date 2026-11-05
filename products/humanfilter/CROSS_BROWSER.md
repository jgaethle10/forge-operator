# HumanFilter v0.1.4 cross-browser distribution

**Current product:** a reversible local AI-disclosure and keyword filter for desktop web feeds, **not** a general AI-media-authorship detector. All builds are beta candidates.

| Family | Build | Beta install method | Publication requirement |
|---|---|---|---|
| Chromium desktop (Chrome, Brave, Opera, Vivaldi) | Chromium-Desktop ZIP | Extract, developer mode, Load unpacked | Browser store review |
| Microsoft Edge desktop | Edge-Beta ZIP (byte-identical to Chromium) | Extract, `edge://extensions`, Load unpacked | Edge Add-ons review |
| Firefox desktop | Firefox-Temporary-Beta ZIP (Gecko manifest + no-data-collection declaration) | `about:debugging` > This Firefox > Load Temporary Add-on > extracted `manifest.json` | Mozilla signing for persistent installation |
| Safari macOS, iOS, iPadOS | Safari-Submission-Source ZIP | **Cannot install directly.** Submit source to Apple Safari Web Extension Packager, build/TestFlight through Apple account | Apple developer packaging, signing, testing, and App Store review |

To build locally, run `python products/humanfilter/scripts/build_browser_packages.py` from anywhere (it locates the neighboring `extension/` folder). Output goes to `products/humanfilter/dist/` by default. Do not commit generated `dist/` binaries to a production runtime.

**Validation**: The original Chromium code passed GitHub's automated browser integration and rule tests. For new browsers, archive integrity and manifest consistency have been checked; Edge/Brave/Opera/Vivaldi and Gecko/Safari real-device behavior is **not yet validated**. Mozilla's temporary add-on is removed on restart. The Apple archive is **not** an iPhone app. Normal users should install signed, vetted store versions when available.

## QA before publicly announcing browser support

1. Exercise Balanced mode, Strict mode, and custom keywords on actual, logged-in social feeds with consent.
2. Confirm the filter hides explicit AI disclosures while preserving human discussions about AI.
3. Confirm Show once, pause, resume, persistence, and dynamic/recycled feed cards.
4. Collect failures and create a release gate per browser. Do not advertise compatibility as confirmed without real-browser evidence.

Release owner can submit to Chrome Web Store, Microsoft Edge Add-ons, Mozilla Add-ons, and Apple App Store when publisher accounts and QA are ready.
