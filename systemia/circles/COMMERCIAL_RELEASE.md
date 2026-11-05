# Evercraft Circles | Owned commercial release gate

**Current state: SOURCE_ONLY.** No membership, payment, migration, or live public deployment is verified.

## Product scope
Circles is an intentional, trust-based professional network, not a feed or a recruiting pyramid. Member-chosen Home Circles may connect into regional, national, international, specialty, mentor and opportunity networks. No guaranteed leads, jobs, business, or revenue.

## Delivered source
- Responsive public frontage at public/circles with illustrative preview and consent-led founding-interest form.
- Server-side Circles domain kernel with default-deny identity admission, private circle roster, member visibility opt-in, category exclusivity, founder review, invitation acceptance and permissioned introduction decisions.
- Distinct owned founding-interest handler with bounded validation, AES-256-GCM encrypted private records, replay-safe references, rate limits, consent, honeypot and reference-only alert queue.
- First-party Fabric routes /api/circles/readiness and /api/circles/inquiry mounted in repository source.
- The browser only submits to owned intake after explicit readiness proof; otherwise users choose whether to send a manual email.
- Dedicated tests and CI. No legacy provider contact.

## Deploy the private founding intake
1. On the authorized Evercraft Fabric host, provision a dedicated owner-only directory and an alert-outbox directory within it, both mode 0700, outside any public site.
2. Set EVERCRAFT_CIRCLES_LEADS_DIR to the private directory and EVERCRAFT_CIRCLES_INTAKE_KEY_B64 to a unique 32-byte base64-encoded key. Never commit or echo the key. Use a separate key from Partners.
3. For notifications, optionally set EVERCRAFT_CIRCLES_OWNER_PRINCIPAL and use already-authorized Notification Fabric credentials. Without that, review private records through authorized local operations, not public GitHub.
4. Release the immutable source on owned Systemia/Yard runtime and record deployment, TLS, route, health and rollback evidence. No Base44 calls or fallback.
5. From an allowed public origin, verify readiness returns intake_available true, membership_live false, checkout_ready false. Post one synthetic consented application, verify the reference and decrypted private record, then handle the synthetic record under authorized retention procedures.
6. Test independent browser/mobile access, privacy, rate limiting, CORS, alert delivery and recovery. Remove noindex only after the owned public page is actually verified.

## Commercial release acceptance
- [ ] Authenticated private member API and durable store backed by owned identity. Server-enforced tenant/member controls and reversible revocations.
- [ ] Member consent, invitation/approval, role policy, category seat enforcement, blocking, reporting and moderation tested end-to-end.
- [ ] Real member roster, referrals, relationship paths and opportunity teams with explicit recipient approval, visibility rules and auditability.
- [ ] Scope, price, recurring/cancel/refund terms and delivery expectations for founding memberships approved. No invented pricing.
- [ ] Exact-offer checkout on owned Evercraft Payments, with independently observed provider-paid order receipts, entitlement fulfillment, cancellations, refunds and disputes.
- [ ] Privacy and security review, including youth/household separation, account export/deletion, retention and recovery.
- [ ] Tested narrow phone and full desktop layouts with no horizontal wiggle, page bleed, or rubber-band reveals.
- [ ] Operational support, independent real-route verification, deployment receipts, health, observation and rollback.
- [ ] Original legacy assets, functionality, data rights and cutover reconciled from already-held sources, with missing evidence explicitly marked.

The historical product listing is discovery-only. Never promote it to sell-now on source evidence alone.

## Release ladder
SOURCE_ONLY -> OWNED_FOUNDING_INTAKE_VERIFIED -> PRIVATE_MEMBERSHIP_PILOT_VERIFIED -> CHECKOUT_ENTITLEMENT_VERIFIED -> COMMERCIAL_READY.

Do not auto-admit applicants, contact Base44, publish private records, invent member testimonials, share contact information by default or imply commercial conversion.