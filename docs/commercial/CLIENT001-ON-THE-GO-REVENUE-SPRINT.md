# CLIENT 001 | On The Go | First Verified Growth Sprint

**Founder-directed workstream:** Evercraft Systemia + Saban + Radar, Fallen Studios distribution
**Date:** November 11, 2026 (PST)
**State:** RESEARCHED + BILINGUAL CONVERSION PREVIEW BUILT + QA PASSED / NO CLIENT PUBLICATION
**Client:** On The Go Mobile Quick Lube (Juan Bello, Yakima Valley)

## Actual starting position

- Public website: https://onthego.theengagency.com/
- The public scheduling and contact pages expose `[lc_calendar id="aYADey1SOIbEqKaHJ4rC"]` as visible text in the prior supervised Saban Chromium audit on mobile and desktop. This establishes a visible rendering problem, not a confirmed number of lost bookings.
- **Client 001 phone: 509-833-5025 is already included in the approved English commercial and independently reconfirmed by the Evercraft founder on November 11, 2026.** Use this number consistently as the call CTA; do not ask the founder to reconfirm it again. Public website email: **onthegomobileoilchange@outlook.com** (email use and routing still to be confirmed with Juan).
- Public hours: **Monday–Friday, 9:00 AM–5:00 PM**.
- Published service areas: Yakima, Moxee, Selah, Tieton, Gleed, Toppenish, Wapato, Zillah. These are website claims; coverage and travel fees to be confirmed by Juan.
- Published menu at research time: semi-synthetic oil change from $74.99; full synthetic from $99.99; full synthetic + tire rotation from $120.99; other services also available. **Prices are not owner-verified current quotes**.
- Avoid promoting `onthegomo.com` until the client confirms ownership and resolves the SSL connectivity problem observed by Saban.
- No guaranteed response time, fleet capability, vehicle eligibility, or savings claim.

## Built right now (not published)

**Bilingual no-backend contact-fallback landing prototype**:
`public/client001-onthego-growth-preview/index.html`

This is not a booking engine. It has English/Spanish toggle, services with accurate **starting** prices, service area, direct `tel:` link, and customer-authored `mailto:` request with source disclosure. No forms, cookies, analytics, databases or third-party services. It **does not claim to collect leads**.

QA: Mobile 390x844 and desktop 1440x900, EN and ES, four Playwright screenshots and interactive link tests; all passed in a local isolated Chromium test. Awaiting separate deployment/production QA after customer authorization.

### Source ID and attribution

Use **unique campaign codes** only for requests with publisher approval:
- `EC-FB-001`: Founder personal Facebook post
- `EC-EN-001`: English commercial share
- `EC-ES-001`: Spanish commercial share
- `EC-FLEET-001`: Permissioned fleet intro

For a **call**, ask Juan to record one voluntary answer: *How did you hear about On The Go?* For **email**, the draft includes `[EVERCRAFT]` in subject and body. Neither creates source certainty; reconcile attribution with Juan rather than guessing. Do not store customer name, number, address, VIN, license plate or health/financial details in the Evercraft growth scorecard.

Funnel (never conflate stages):
1. Published and accessible outreach item (evidence: permalink)
2. Inquiry (owner-confirmed count; no automatic claim)
3. Scheduled appointment (owner-confirmed)
4. Completed paid service (owner-confirmed paid first visit)
5. Verified attributable revenue (Juan verifies first-time + source + collected amount)
6. Earnings arrangement (only if separately contracted in writing)

Counts start **unknown**, not zero: without Juan's records we cannot say no leads occurred.

## Priority 0 | Save any existing demand

1. Ask Juan which website and domain are active and who manages the WordPress calendar.
2. Tell site manager to use a **verified** direct phone/email fallback while testing the shortcode registration. Do not install guessed plugins, replace a calendar ID, or touch backend data without client authorization.
3. Test live booking only using a client-authorized test account and cancel the test afterward; Saban passive read-only is not an end-to-end appointment.
4. Correct every instance of 'Come and visit us' that contradicts the mobile service promise.
5. Ensure all commercial/social links point to a usable, Juan-approved contact destination, not a broken schedule route.
6. Re-run Saban/Radar read-only page tests after remediation and attach observed pass/fail evidence.

## Priority 1 | Three controlled campaigns, approved by Juan

**Offer A | Time-back, English individual drivers**
> Your car needs an oil change. Your day doesn't need another stop. On The Go Mobile Quick Lube brings routine maintenance to your home or workplace around the Yakima Valley. Full synthetic oil changes start at $99.99, with a tire-rotation package starting at $120.99. Call 509-833-5025 to check availability and your vehicle's needs. Prices/coverage subject to confirmation.

**Offer B | Spanish-speaking customers**
> ¿Necesitas cambiar el aceite, pero no tienes tiempo para ir al taller? On The Go Mobile Quick Lube va a tu casa o trabajo en el Valle de Yakima. El cambio de aceite sintético empieza en $99.99, y la opción con rotación de llantas empieza en $120.99. Consulta disponibilidad y precio para tu vehículo al 509-833-5025. Confirma los detalles con Juan antes de reservar.

**Offer C | Fleet and multi-vehicle accounts (proposal, not an existing package)**
> Do you have several work vehicles losing time on routine maintenance? On The Go Mobile Quick Lube is exploring coordinated on-site servicing for local fleets. We're speaking with a small number of businesses about their vehicles, locations and scheduling needs before quoting anything. If a pilot could help your team, let us know your fleet size, vehicle types and preferred service location.

**NEVER claim a fleet program is operational until Juan confirms people, equipment, safety, schedule and economics.**

## Target segments in order

1. Owner-operated contractors and landscapers with several service vehicles.
2. Small property-maintenance teams where vehicle downtime costs booked work.
3. Local delivery/service fleets with repeat preventive maintenance needs.

Do not infer exact fleet sizes, schedules or willingness to buy. Do not auto-contact, call or email prospects without client/Passport authorization.

## Seven-day sprint target and gated execution

| Gate | What gets made | Who must approve | Pass condition |
| --- | --- | --- | --- |
| 1 | Juan-confirmed contact and one service/price to lead with | Juan | Phone already confirmed by founder; Juan's reply needed only for email routing, pricing, service areas, and booking workflow |
| 2 | Booking route repair or direct-contact fallback | Juan + site manager | Real visitor can request an appointment, including phone browser |
| 3 | English + Spanish offer posts and commercial clips | Juan, channel owners | Approved offer, claims, source permissions, visible published URLs |
| 4 | Fleet pilot interest test | Juan | Qualified business has agreed to discuss, service capacity checked |
| 5 | Daily proof counts (aggregate only) | Juan | Actual inquiries/bookings/completed services, no invented totals |
| 6 | End-of-week proof report | Juan | Verified newly acquired paid first services and honest unknowns |
| 7 | Optional continuing agreement | Both parties | Scope/pricing/attribution/termination signed before any charge |

## Suggested commercial model after a measurable pilot

Avoid a blanket share of On The Go's gross revenue. Start with a defined subscription for measurable outputs and/or a limited percentage of *verified attributable newly acquired customers' first paid services*, only after margins, source, refund rules and local legal requirements are agreed. No revenue share exists yet.

## Ready-to-send founder check-in to Juan

> Bro, I put Saban and Radar to work auditing your customer booking journey, and we actually caught a calendar display problem on the public website. I've already built a bilingual contact-page prototype that can route people straight to On The Go while the calendar gets fixed. Before I put anything in front of customers, we're using the same 509-833-5025 number already in your commercial as the call option. Who manages your current site, and do you want inquiries sent to your public email as well? I also want to make sure we promote the service and price that make you the most profit. Then we can start tracking the work we actually help bring in. 🔥

## Security / authority

No customer messages sent. No website/domain/Google Business edits made. No live preview or paid advertisement published. No customer PII collected. Juan's website belongs to him; this pilot is not a license to take over his company, use his marks publicly without consent, or collect commissions.

**Next state:** owner confirmation + private prototype review, then controlled deployment and source tracking.
