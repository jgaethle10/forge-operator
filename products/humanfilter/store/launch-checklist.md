# Evercraft HumanFilter · Release gate · October 25, 2026

## Verified in this build
- Manifest V3 static extension source assembled and packaged.
- No requested network access or host permissions other than narrowly-scoped content-script matches.
- JavaScript pattern unit tests passed.
- Chromium mocked-feed integration passed for Facebook, Reddit and YouTube sample markup, including reveal and flicker regression.
- ZIP has `manifest.json` at root for Chrome Web Store upload.

## Not verified and NOT to be represented as complete
- Installing the unpacked package into an independent desktop Chrome installation.
- Live-site compatibility against actual logged-in Facebook/Reddit/YouTube interfaces.
- Chrome Web Store publisher account registration, store submission or approval.
- Chrome Web Store screenshots and hosting the policy on a stable public website.
- Any sales/checkout. This is a free manual-install beta candidate, not a paid release.

## Next release gate
1. Desktop Chrome owner/tester installs extracted extension using `chrome://extensions` > Developer mode > Load unpacked.
2. Verify filtering and reveal on a real supported feed. Report URL/layout issues.
3. Enroll at https://chrome.google.com/webstore/devconsole if not enrolled, create listing and complete disclosure + screenshots; upload store ZIP and submit for review.
4. After approval, share real Chrome Web Store listing link. Do not claim review or publishing in advance.

## Exact messaging
> Evercraft HumanFilter is available as an early desktop Chrome testing build. It filters explicitly AI-labeled/self-disclosed content and your own keywords. It cannot prove whether a post is AI-generated. Store release is pending.
