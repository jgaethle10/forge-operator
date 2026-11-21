# HumanFilter Android first | Mozilla add-on route and Google Play

## Why this route
**Apple:** The Safari source candidate is prepared under PR #1798, but a $99/year Apple Developer Program enrollment and real iOS device testing are outstanding. Hold an iPhone launch until signed app distribution exists.

**Android quickest:** Firefox for Android supports add-ons from Mozilla Add-ons. HumanFilter's existing WebExtension code can be adapted into a Mozilla-signed extension. This does **not** require an Android app, Google Play listing, or Apple Developer Program fee.

**Android Play Store:** The user already has a Google Play Console account. A **separate native Android application** is required to publish on Google Play; the Firefox or Safari extension ZIP does not become an APK/AAB simply by uploading it. Chrome Android does not support ordinary desktop extensions. A simple WebView wrapping a third-party social website may be inconsistent with Google Play's webview/spam rules and could require the website owner's permission. Do not claim filters work inside native social apps, or that the app is Play-ready without actually developing a compliant product.

## Candidate available in this branch
- `android-firefox/build.py`: creates ZIP with Firefox Android candidate manifest, scoped mobile and desktop website patterns, local storage-only permission, mobile video card support, actual shield logo icons, and touch-sized popup.
- `android-firefox/test_package.py`: checks packaging, security scope, resources and icon integrity.
- `android-firefox/test_gecko_mobile.py`: exercises filters and Show once using *desktop Firefox engine at mobile viewport sizes*. This does **not** prove actual Firefox for Android behavior.
- GitHub Actions artifact `humanfilter-firefox-android-review-v0.1.4` for review only. Mozilla must sign and approve an installation file through addons.mozilla.org.

## Next real steps for Firefox on Android
1. Obtain an Android test device running current Firefox for Android.
2. Use Mozilla's `web-ext run --target=firefox-android --android-device=<device>` from the unpacked package. Use Firefox Android device debugging to validate UX.
3. Verify Balanced/Strict, keywords, feed site toggles, Show once, pause/resume, and local preference persistence on the real device and real logged-in websites (with user consent).
4. Review false positives and missing AI disclosure labels. Do not claim universal AI detection.
5. Create an AMO developer account, submit as an Android-compatible Firefox add-on, satisfy Mozilla signing/review, and confirm its **addons.mozilla.org/android** listing. It then becomes a normal Firefox install without a Google Play application.
6. Update HumanFilter's landing page with a **verified** Android Firefox add-on link and screenshots once approved.

Official development docs: https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/

## If building a standalone Play Store app
- Product direction: a privacy-focused **original Android browsing experience**, not a shallow WebView of third-party sites.
- Design meaningful browser-level controls, accessibility, and locally stored rules; respect permissions and social website terms.
- Complete native Android code, AAB signing, Android device testing, Play Console data safety, store screenshots, privacy disclosures, and app review.
- If the Google Play developer account is a **personal** account opened after November 13, 2023, Google normally requires at least 12 opted-in closed testers continuously for 14 days before applying for production access; actual account eligibility must be confirmed in Play Console.
- Do not announce Google Play availability before the actual Play listing is approved.

Google policy: https://support.google.com/googleplay/android-developer/answer/9899034?hl=en

## Launch approach
Desktop beta continues to function. Prioritize Firefox Android signed add-on for no-new-fee mobile reach, then build a distinct native Play app if it delivers material extra value. Keep Safari prepared until Apple enrollment is financially reasonable. No fake 'coming soon' store installs and no conversion tracking in the extension without revised privacy terms.
