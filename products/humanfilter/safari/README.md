# HumanFilter Safari | App Store Connect packaging candidate

**Status:** Source prepared for Apple web extension packager, **not** an iPhone app, signed extension, TestFlight build or App Store listing.

This source package is intentionally separate from existing published Chromium/Edge/Firefox beta ZIPs. It provides a Safari-scoped Manifest V3, shared rules/content logic, responsive popover styles, and generated assets matching the approved HumanFilter layered-shield brand.

## Apple workflow (no Mac required)
Apple's **Safari Web Extension Packager** is accessible from App Store Connect in a browser.
- Enroll Evercraft's Apple Account in the Apple Developer Program.
- In [App Store Connect](https://appstoreconnect.apple.com/), create an app record selecting **iOS and macOS** (or separately if Apple's UI requires), with a unique Evercraft-owned bundle identifier.
- In the app record, choose **Xcode Cloud → Safari Web Extension Packager → Upload**. Upload the generated `Evercraft-HumanFilter-Safari-Submission-Source-v0.1.4.zip` with `manifest.json` at the ZIP root.
- Resolve reported packager warnings and wait for a processed build. Enable TestFlight testers only after it is ready. Verify in Safari on iPhone, iPad, and Mac, including explicit per-site permissions.
- Complete actual store screenshots, privacy/data collection answers, age rating, support URL and App Store review. Public installation requires approved App Store release.

Official Apple guidance: https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect

## Source generation / checks
From repository root:
```sh
python -m pip install cairosvg==2.8.2
python products/humanfilter/scripts/build_browser_packages.py --output-dir /tmp/humanfilter-dist
python products/humanfilter/safari/test_safari_package.py /tmp/humanfilter-dist/Evercraft-HumanFilter-Safari-Submission-Source-v0.1.4.zip
```

The builder uses `safari/manifest.json`, plus the common extension scripts, and rasterizes the existing approved layered-shield site SVG for Safari icons. It does **not** sign or publish anything to Apple. The companion GitHub Actions workflow uploads the ZIP as a GitHub artifact.

## TestFlight acceptance gate (requires real Apple hardware)
- [ ] Extension installs and enables in iPhone Safari, iPad Safari and macOS Safari.
- [ ] Site access permission prompts and grants work; no excessive/global host permissions.
- [ ] Facebook, Reddit, and YouTube website layouts that users actually see are each tested; record no-coverage cases explicitly. Native social apps are **outside scope**.
- [ ] Balanced mode hides a confirmed labeled/disclosed fixture and preserves adjacent human content.
- [ ] Strict mode, optional keywords, Show once, pause/resume and preferences persistence work.
- [ ] Repeat with recycled/dynamic cards and measure wrong hides / missed disclosures.
- [ ] Privacy declarations match real extension behavior; no remote content processing.
- [ ] Release metadata and screenshots from real Safari devices, not fabricated app UI.

**Do not claim Safari is available** based solely on source packaging, Chromium Playwright tests, or successful GitHub CI.
