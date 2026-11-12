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


## V0.1 human-review and partner workflow engineering

- `systemia/lift/review-workflow.mjs` adds side-effect-free `makeCase`, `transitionCase`, and `casePublicSnapshot`, plus `makePartner`, `transitionPartner`, and `partnerDirectorySnapshot`.
- Private case intake accepts **only** opaque IDs, a `vault:` evidence reference, a general location/category, amount and data-processing consent. Unexpected fields (including applicant names, addresses, account numbers and raw document URLs) are rejected. **There is no document vault or persistent intake server yet.**
- Human review has distinct roles: case reviewer validates identity, need, payee and disbursement plan; independent redaction reviewer approves safe public wording; requester consents to a specific preview version; separate publisher marks the case eligible for publication. A consent withdrawal or pause blocks further public snapshots. The demo does not publish live cases.
- Partner applications are **not** automatically listed: assigned reviewer checks identity, program and contract evidence, independent approver activates the organization, suspension removes it from directory output. Even active directory entries explicitly do **not** confirm capacity or individual eligibility.
- `systemia/lift/review-workflow.test.mjs` adds regression tests for overposted PII, opaque evidence references, role separation, publication consent invalidation, privacy allowlists, withdrawal, suspension and partner activation.
- `public/lift/review-demo.html` is a fully fictional, browser-only walkthrough of case and organization lifecycle. It contains no applicant records and has no server connection, authentication, actual approvals or payments.

### Important security distinction

These modules encode proposed *domain rules*. They do **not** provide an authentication boundary, identity-proofing service, encrypted evidence vault, authoritative verification, tamper-evident audit store, database transactions, live revocation or legal compliance. Actor ID/role objects are trusted **only if an authenticated server has already resolved them** and cannot be supplied by clients. Workflows, evidence references, event histories and public snapshots must remain private until server-backed enforcement, consent propagation and purge/deindex checks are independently verified.

### Next execution gate

Integrate with an Evercraft-owned authenticated server and vault; implement persisted, append-only event transitions with optimistic concurrency and a separate audit trail; add secure reviewer UX; document retention and privacy requests; test incident response and partner referrals. Keep public fundraising and payment flow disabled until regulatory and Evercraft Payments reconciliation readiness are established.

## V0.2 synthetic durable-journal lab

**New files:** systemia/lift/lab-journal.mjs and systemia/lift/lab-journal.test.mjs.

This is deliberately a *local development lab*, not a production service. It runs with no real identities, organizations, personally identifying applicant records, or donation transactions.

- The journal is lift-lab-journal.jsonl inside an operator-supplied absolute directory. It requests restrictive local file permissions and a single-writer exclusive lock.
- Each entry records a monotonic sequence, previous SHA-256 hash, operation ID and request digest, entity/version, and a synthetic state snapshot. Writes are appended and an fsync is requested. This is an integrity/replay aid, not a cryptographic proof of authorship or hardened audit.
- Restart validates all journal entries and reconstructs case and partner states. A **partially appended final event fails closed**. Ignoring the tail could lose a withdrawal or consent revocation.
- Updates require an expected entity version, preventing stale reviewers from overwriting one another. Identical operation retries are idempotent; reused IDs with different requests fail. An in-process queue serializes writes and an exclusive file lock blocks a second cooperating writer.
- The API accepts only synthetic lab_ actor/entity IDs, vault:lab_... evidence placeholders, Lab Region, and fixed fictional public copy and partner names. Never upload real bills to this journal.
- Lab roles are asserted fixtures, NOT authenticated identities. No HTTP routes expose these methods. All financial activity remains disabled.

Run lab tests: node --test systemia/lift/*.test.mjs

### Important limitations

A crash can leave the lock file and require careful manual inspection before removing it. There is no automatic stale-lock takeover, production encryption, secure vault, network authentication, cross-host consistency, high-availability storage, backup recovery, or legal authorization to handle real funds. Hash-linking detects accidental edits, but a party with full write access to the journal can recompute hashes. No personally identifying data is acceptable.

### Remaining production gates

1. Trusted Evercraft identity/session resolver with strictly server-side roles and object-level authorization. Never accept client-supplied roles.
2. Encrypted applicant vault, legal retention/deletion policy, secure attachment scanning, and abuse controls.
3. Real transactional private state store with access audit, backups, concurrency and operator recovery on Evercraft-owned infrastructure.
4. Tested consent withdrawal, publication revocation, deindexing and partner referral revocation across all caches.
5. Jurisdiction-specific nonprofit/donation and payment approval. Only then Evercraft Payments -> Raven Nexus -> authorized settlement adapter and verified disbursement.


## V0.3 shared Identity + Passport boundary (integration proof)

**Files:** `systemia/lift/identity-boundary.mjs`, `identity-boundary.test.mjs`.

Lift now has a pure service adapter designed to reuse Evercraft's **Identity** session signatures/revocation and **Passport** resource grants. No separate Lift password/token system was created.

- Every call verifies an Evercraft-signed session against the configured Identity signing keyring, then checks Identity's *current* session revocation state. A signed but revoked or expired token is refused.
- Every operation requires a live Passport decision for product `evercraft-lift` and the exact scope. Person-scoped operations also require matching record ownership. Reviewer, redaction, publisher, partner vetting, activation and suspension require an explicitly resource-bound active grant, not just a global grant.
- The workflow actor is reconstructed from the verified subject reference and the operation's **server-selected role**. Untrusted callers cannot choose or amplify a role. The stable opaque actor key is a one-way digest for this Lift context; it should not be used as a public user profile.
- The adapter receives only trusted `loadCase` / `loadPartner` functions and never exposes private record-reading routes; consumers must supply server-side stores, not untrusted input/cache snapshots.
- Real Identity/Passport modules are exercised in tests using *fictional signed sessions and manual lab grants*. These tests do **not** establish that production subjects were enrolled, permissions provisioned or server endpoints deployed.
- Case events still flow through the existing independent reviewer, consent and privacy policy functions. Live payments remain disabled.

**Important:** this is a composition layer, not a running authenticated service or production identity integration. A deployed service must validate sessions and Passport grants at the transaction boundary, enforce least privilege, atomically persist state changes with revocation, prevent request races, and obtain operator/legal approvals before processing real people.


## Release status

**Demo:** ready for local isolated evaluation. **Live assistance:** blocked. **Payments:** blocked. **Verified partners:** none onboarded by this change. **Public deployment:** not authorized by this branch. **Systemia API integration:** pending. The name is provisional pending checks for conflicts.
