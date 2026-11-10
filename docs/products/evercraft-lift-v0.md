# Evercraft Lift | v0 product, trust, and rollout plan

**Working name:** Evercraft Lift. **Promise:** Make it easier for communities to coordinate legitimate help. **Owner:** Evercraft LLC. **Stage:** isolated concept demo and policy-only code; not live assistance or fundraising.

## The product, in one sentence

A private, evidence-gated network connecting people experiencing specific needs with existing assistance, local services, community circles, nonprofit partners, and, where legally supported, appropriately administered funding.

## User paths

1. **Person seeking help:** Discover existing assistance first. Later, an authenticated private request flow can collect only the minimum necessary details. The person approves the public summary and can withdraw consent. Requests are free; a request never guarantees funding.
2. **Helper:** Browse consented, verified listings or join a circle. Offer money, goods, skills, a referral, or provider-approved direct help. The public listing never contains bill images, addresses, account numbers, full names, or medical details.
3. **Community circle:** Invite members, define geography/categories, pool *coordination* around a goal, and document commitments and actual verified outcomes separately. Public fund collection stays disabled until regulated-flow clearance.
4. **Nonprofit/organization:** Apply for review, attest to eligibility and operating status, define service regions and programs, and receive safe referrals. A suggested match is not an approved benefit or committed capacity.
5. **Business partner:** Offer service capacity, goods, sponsorship, or employer matching; inventory/capacity and conditions are verified before being advertised as available.
6. **Case reviewer:** Review private documents with access controls, record rationale and evidence, reject duplicates/fraud, approve a redacted public listing, and document verified completion without disclosing private information.

## V0 technical delivery

- `public/lift/index.html` is a self-contained, phone-friendly interactive *fictional* demonstration. It does not accept account creation, bills, photos, email addresses, or payments. The demonstration must remain `noindex` until release review.
- `systemia/lift/lift-core.mjs` contains pure helpers for listing readiness, a public-output allowlist, unconfirmed partner matching, and illustrative receipt-based accounting preview. They are not an authorization/payout system.
- `systemia/lift/lift-core.test.mjs` exercises listing gates, privacy allowlist, unconfirmed matching, receipt deduplication, and closed payment gates. Run: `node --test systemia/lift/lift-core.test.mjs`.
- Existing economic authority remains **Evercraft Payments -> Raven Nexus -> connected settlement adapter**. Lift may not create a direct Stripe flow or interpret a provider web page as proof of an accepted donation.
- Systemia can later own case workflow, partner workflow, resource matching, review queues, and audit receipts. This demo is not yet connected to a live Systemia mission.

## Domain model for the future authenticated service

- `assistance_case`: ID, lifecycle status, category, broad region, requested assistance kind, goal, created/expiry dates. Keep applicant PII in a separate encrypted and access-controlled private record.
- `verification_record`: evidence type, issuer/vendor status, reviewer ID, reviewed timestamp, expiry, duplicate/fraud risk adjudication, append-only audit receipts.
- `consent_record`: scoped and versioned opt-ins for data processing, public display, partner referral, media, and updates. Withdrawal is an independent event.
- `public_listing`: independent reviewed and redacted fields; broad location only; remove/deindex promptly after withdrawal or completion.
- `circle`: owner, moderators, membership/role boundaries, community rules, needs served, and escalation route for abuse.
- `partner_profile`: validated legal name, eligibility/capacity, covered regions/categories, permitted assistance modes, last confirmed date, and pause state.
- `partner_referral`: candidate, human approval, minimum disclosed data, applicant consent, acceptance/rejection, delivery, and outcome evidence.
- `funding_intent`: proposed gift or matching commitment, legal beneficiary and destination, order linkage, expiration, and reservation rules. Do not mistake intent for money.
- `economic_event`: canonical Evercraft Payments order ID, authenticated adapter receipt link, idempotency key, refund/reversal state, verified disbursement, and discrepancy escalation.
- `outcome_event`: service completion or provider receipt, privacy-safe donor acknowledgment, consented impact signals. No publicly exposed hardship history.

## Assistance-first discovery

Before presenting a funding goal, check the relevant partner directory and known external assistance programs. Return *possible* matches only; show eligibility and availability as unconfirmed until verified. Never auto-submit a person's documents to external organizations. Financial contributions should support the approved residual need, not duplicate a benefit already secured.

## Non-negotiable release gates

1. **Legal and charitable status:** Determine whether Evercraft, a licensed regulated intermediary, fiscal sponsor, or partner nonprofit receives funds. Obtain competent review of charitable solicitation registrations, money transmission/escrow/custody, fees, donor-receipt claims, tax treatment, sanctions, consumer protection, and geographic scope before live transactions. Do not imply all gifts are tax-deductible.
2. **Privacy and vulnerability:** Authenticate requesters and partners, encrypt all PII and documents, limit retention, use role-based access, provide withdrawal and appeal flows, consider children and domestic-violence safety, restrict public search indexing of sensitive content. Avoid public identifiable stories by default.
3. **Fraud and safety:** Verify need independently where permitted, confirm provider payee, prevent duplicate funding without unnecessary exposure, monitor account takeovers, screen abusive requests and exploitative donor behavior. Manual human adjudication of complex cases, with clear dispute paths.
4. **Money:** All live money movement must originate in Evercraft Payments through Raven Nexus; provider event signatures and order/event mapping, idempotency, reversals, chargebacks, payout confirmation and reconciled ledger are mandatory. Do not commingle money with operations, promise direct vendor settlement, or invent completed outcomes.
5. **Partners:** Signed participation terms, scoped eligibility and service capacity, authentication, fraud checks, access revocation, service agreement, and clear moderation. No fictional partners presented as real.
6. **Accessible pilot:** Conduct a tightly scoped private pilot with a legitimate partner, documented consent, operator training, incident response, service-level expectations and a funding/fulfillment contingency before a public launch.

## Next engineering slices

- A: Authenticated private case intake and document vault, no public listing by default.
- B: Human case-review console with independent redaction approval, consent/expiry/withdrawal events.
- C: Partner verification, program directory, eligibility/resource discovery, safe referral workflow.
- D: Circles, moderation, scoped roles and member coordination, no money movement.
- E: Legally approved payment flow with signed, replay-safe receipt reconciliation and refund/disbursement receipts.
- F: Private partner pilot, accessibility audit, security review, red-team fraud testing, public launch decision.

## Commercial posture

Seeking help must be free. Avoid deriving revenue from hardship, tips, or claim priority. Potential *future* revenue: transparent optional organizational coordination software with no pay-to-be-seen ranking, enterprise workplace programs, and documented sponsorship services, subject to legal review. No claim of current partnerships or signed donors.

## Release status

**Demo:** ready for local isolated evaluation. **Live assistance:** blocked. **Payments:** blocked. **Verified partners:** none onboarded by this change. **Public deployment:** not authorized by this branch. **Systemia API integration:** pending. The name is provisional pending checks for conflicts.
