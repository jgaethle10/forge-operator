# CLIENT 001 | Website booking repair handoff

**Status:** proposal for Juan/the person managing his website. No access or live changes made.

## Observed issue

Both the public Schedule and Contact pages have exposed the unprocessed `[lc_calendar id="aYADey1SOIbEqKaHJ4rC"]` text in rendered output. A read-only Saban Chromium inspection on mobile and desktop reproduced visible shortcode text, with no visible booking interface. A live end-to-end reservation test was not attempted.

## Immediate reversible stopgap

While the calendar is being repaired, add a customer-visible alternative on the existing scheduling page that links to `tel:+15098335025` and `mailto:onthegomobileoilchange@outlook.com` (both published on the website but subject to Juan confirming they are correct). Suggested customer copy:

> **Need an appointment?** Call 509-833-5025 and tell us your vehicle, service needed, city, and preferred date. Or email onthegomobileoilchange@outlook.com. We'll confirm availability and a quote before booking.

Do **not** claim appointments are automatically confirmed or that a repaired calendar is operating before Juan verifies it. Do not direct new campaigns to a broken URL.

## Diagnostic sequence for authorized administrator

1. Confirm whether `lc_calendar` belongs to a currently installed, enabled plugin or an old vendor integration. Do not assume which platform generates the shortcode.
2. Confirm the calendar ID in the admin dashboard and that the calendar still exists.
3. Confirm the shortcode is in a shortcode-capable block or the site builder's dedicated embed element; ensure brackets are not escaped.
4. Inspect browser console and network failures, page cache, minification/defer settings, and plugin incompatibilities. Test on a staging page before live changes.
5. Confirm time slots display and that the **owner** can successfully perform and undo a test booking on a real mobile browser.
6. Replace contradictory “Come and visit us today” text with mobile-service copy after Juan approves.
7. Re-run public read-only Saban/Radar checks and retain before/after screenshots and receipts.

Avoid guessing a vendor/plugin or modifying server files without the site manager's approval.