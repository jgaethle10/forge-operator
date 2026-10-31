# HumanFilter | Mozilla Add-ons (AMO) submission handoff

**Status:** Release-candidate marketing metadata for review. The ZIP is unsigned; this document is NOT evidence of Mozilla approval or Android hardware testing.

## Listing identity

- Add-on name: **HumanFilter by Evercraft**
- Tagline: **Your feed. Your call.**
- Author/developer: **Evercraft LLC**
- Pricing: **Free**
- Category: **Privacy & Security** or **Social & Communication**, subject to available AMO category selection
- Supported browser targets: Firefox Desktop and Firefox for Android **only after device QA**; do not check compatibility without testing
- Product URL: https://jgaethle10.github.io/forge-operator/humanfilter-beta/
- Privacy policy: https://jgaethle10.github.io/forge-operator/humanfilter-beta/privacy.html
- Version: **0.1.4**
- Gecko extension ID: `humanfilter@systemiacommandcenters.com`

## Short summary

Your feed. Your call. Locally filter recognized AI disclosures and topics you choose on supported social websites.

## Full description

HumanFilter puts you in control of what appears in supported Facebook, Reddit, and YouTube feeds inside Firefox.

Choose Balanced mode to soften posts with recognized AI-generation labels or explicit self-disclosure language. Select Strict mode to also filter certain discussions of AI, or add your own keywords. Turn filtering on or off for each supported site, pause everything, or reveal an individual post using Show once.

HumanFilter makes these filtering decisions directly in your browser. It does not require an account, does not send your feed content to Evercraft, and does not use cloud AI analysis. Your selected preferences are kept in local extension storage.

**Important limits:** HumanFilter is not a universal AI detector. It can miss unlabeled AI-created content and sometimes filter human-written material. Website layouts and labels can change. It affects supported web pages opened in Firefox, not Facebook, Instagram, TikTok, YouTube, or Reddit's native phone applications. Mobile website behavior is subject to additional compatibility testing.

## Reviewer notes

- Local-only HTML/CSS/JavaScript add-on, no backend and no network requests made by extension code.
- Manifest V3 storage permission is used for locally saved user settings.
- Narrow content-script site scope: Facebook, Reddit, YouTube desktop web hosts and mobile Facebook / YouTube web hosts.
- `browser_specific_settings.gecko.data_collection_permissions.required` is `["none"]`, consistent with source's absence of collection/transmission.
- Source is provided unminified and un-obfuscated.
- In a matching post: choose a mode and open the corresponding supported web feed. Confirm that an explicit AI disclosure or matching keyword is covered, then tap **Show once**. A human control should remain visible on a nonmatching post.
- Test desktop and Android separately; screen dimensions, popup access, dynamic posts and permission prompts can differ.
- Copyright, branding and privacy claims must match the final signed artifact.

## Listing assets

- Existing original brand SVG: `public/humanfilter-beta/assets/shield.svg`
- Candidate ZIP includes generated 16px, 48px, 128px icons based on this brand.
- Screenshot source can be the real extension UI, not AI-generated or simulated device screenshots. After actual Android testing, capture Firefox for Android permissions, real extension controls and safely authorized feed examples.

## Concrete handoff

1. Create/sign in to a free Mozilla Account at https://addons.mozilla.org/
2. Open https://addons.mozilla.org/developers/ and choose **Submit a New Add-on**.
3. Choose **On this site** to get a public AMO listing; upload `HumanFilter-Firefox-Android-Review-v0.1.4.zip`. Review requested platform support rather than assuming it.
4. Resolve all validator issues and fill the AMO listing using the copy above. Mozilla signing and review are independent gates.
5. Test signed version on a real Android device in Firefox and inspect privacy, popup touch targets, website permissions, reveal, pause and false-positive rates.
6. Publish a verified AMO Android-compatible install link to the HumanFilter product page **only after** signing, public approval and actual Android device verification.

Official docs:
- https://extensionworkshop.com/documentation/publish/submitting-an-add-on/
- https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/
- https://support.mozilla.org/en-US/kb/find-and-install-add-ons-firefox-android

Do not upload the Safari ZIP to AMO or the Firefox add-on ZIP to Google Play; they target different packaging ecosystems.
