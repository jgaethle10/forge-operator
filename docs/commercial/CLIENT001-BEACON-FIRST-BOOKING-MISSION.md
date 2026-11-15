# CLIENT 001 — Beacon first booking pilot | November 15, 2026
**Client:** On The Go Mobile Quick Lube (Juan Bello)
**Owner-approved contact:** 509-833-5025, confirmed by founder and shown in accepted commercial.
**Status:** PRIVATE STAGING, NOT LIVE. No outreach, client posting, website mutation or customer booking performed.

## Outcome definition
Get the first *documented* new, fulfilled, paid job that began through an Evercraft-approved campaign. A view, click, phone dial, inquiry, referral code or appointment is not revenue proof. A first paid job attributed to an EC referral is not evidence of causal incremental business growth.

## What is built
- Mobile bilingual contact page: `public/client001-onthego-growth-preview/index.html`
- Ephemeral 12-hex-character reference displayed on page, e.g. `EC-XXXXXXXXXXXX` generated randomly without customer identity.
- Fixed approved campaign labels: `EC-EN-001`, `EC-ES-001`, `EC-FB-001`, `EC-FLEET-001`. Unknown query sources fall back to `EC-DIRECT-001`.
- Email draft includes source and reference, entirely inside the customer's mail application; click-to-call uses the confirmed client number. Calling cannot transmit this code automatically; customer may mention it verbally.
- No cookies, third-party trackers, databases, customer records, fake scheduling or payments. It does **not** count visits until a separately approved first-party collector is deployed.
- CI: https://github.com/jgaethle10/forge-operator/actions/runs/43758825156

## Pilot gates
1. **Offer:** Juan approves the currently published full-synthetic oil change starting at $99.99, availability, area, exclusions, and preferred customer contact method. Do not advertise unconfirmed price or promise immediate availability.
2. **Permission:** Juan authorizes use of his name/brand, preview, marketing channels, customer-referral code and contact handoff. No change to sister-in-law website required.
3. **Live owned link:** deploy a secure first-party route on Evercraft-owned infrastructure using approved branding and mobile browser QA; do not advertise GitHub source or a Google Drive HTML preview as the customer experience.
4. **Two distribution tests:** founder-approved English commercial post with `EC-EN-001`; Spanish commercial only after Juan approves Spanish performance and reuse, with `EC-ES-001`. Use same offer and no incentive changes that confound comparison.
5. **Passively monitor:** accepted link opens, actual outbound click-to-call/mailto (only with consent and disclosed first-party event collection), campaign ref observed in a voluntarily sent customer inquiry. No PII in analytics.
6. **Proof:** When Juan independently confirms a *first-time customer* completed a paid service after quoting/reference, record an aggregate paid-first-job amount with an opaque code and date, **only if he volunteers this evidence**. Do not treat amount as independently verified payment without appropriate evidence; use labels `owner_reported` or `merchant_verified` accurately.
7. **Experiment review:** inspect whether people click, inquire, book and pay; if no inquiries, change distribution/offer. If inquiries but no bookings, fix contact and eligibility friction. If bookings but few paid jobs, investigate capacity/price/fulfillment. No revenue share begins without an explicit later agreement.

## Ask Juan once, succinctly
“Bro, I built a simple English/Spanish way for people who see your commercial to call you directly, without disturbing your existing site. Could I put that page live and share it from Evercraft's channels? The number goes straight to 509-833-5025. It would also give us optional referral codes so we can see which introductions actually turn into business. No financial access, and nothing to manage on your end. ❤️”

Do not repeat confirmation of the phone number or the existing website; both are known.

## Reporting
- **Evercraft observed:** published post and link evidence; (future) approved page engagement data; customer-initiated code use.
- **Owner reported:** confirmed booking and completed service; paid amount if voluntarily supplied.
- **Independent merchant verified:** requires provider or other authoritative receipt access, not currently available.
- **Total business revenue growth:** remains `unknown` without full baseline and post-period totals.
- **Causal lift from Evercraft:** remains `unknown` without an appropriate comparison or controlled experiment.

**Technical status:** Beacon handoff build/test complete; publication and real revenue measurement still gated by Juan's permission and a deployed event store.
