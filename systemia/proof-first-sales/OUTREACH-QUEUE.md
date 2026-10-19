# CRM qualified outreach queue (source candidate, NOT deployed)

This adds a read-only, privacy-safe admission stage to the existing
Systemia Proof-First Sales and Interaction Ledger. It evaluates up to
1,000 candidate records per pass, but performs **zero sends, permits,
lead imports, or settlement operations**. This is not proof that the
company-wide CRM is synchronized or reading every five-minute heartbeat.

Run focused tests:

```sh
node --test systemia/proof-first-sales/outreach-queue.test.mjs
```

## Minimum intake contract

Private, authorized lead input requires `prospect_key`, opaque
`subject_ref`, `business`, `channel` (email or DM), `message`,
`offer_key`, HTTPS `source_url`, `source_kind`, a source-verification
result from a trusted resolver, `request_posted_at` (and optional
`request_expires_at`), grounded pain state, and independently verified
public HTTPS proof. The subject and message never appear in summary
outputs.

Supported source types are an explicit published request, direct
inquiry, opted-in lead, and invited partner. A source-verification
boolean supplied by an untrusted crawler is NOT sufficient production
evidence; an authenticated resolver and bound source receipt are
required upstream before feeding this function.

Only an explicit human-review reference can pass the pre-review gate.
The Interaction Ledger then checks current Passport scope, cooldown,
outbound count, opt-out and duplicates. Unknown, stale, expired, blocked
or unverified leads stay held.

A positive result means **permit_required**, not sent. Exact approved
content must then receive a one-use Passport contact permit, be
transmitted via a separately authorized provider, and finalized with the
provider receipt in the existing Interaction Ledger. No contact is
permitted from generated lists alone.

## Next missing production connections

1. Authenticated opportunity intake and evidence receipts from
   solicitation surfaces, Gmail, direct replies and approved partner
   channels; do not scrape private social accounts or purchase lists.
2. Controlled, access-restricted company CRM record store that joins
   Opportunity Fabric, Interaction Ledger, work commitments, customer
   stages, communication IDs and settlements. Backfill verified messages
   and opt-outs before any campaign sends.
3. Privacy-safe heartbeat digest every 5 minutes, with freshness,
   queued leads, failed preflights, replies due, offers and verified
   payments. No raw PII in public GitHub logs or artifacts.
4. One sending adapter per allowed provider and channel, with
   rate/plan checks, suppression controls, exact-message permits,
   send receipts and a stop-on-error policy. Keep no-spam, no-double-
   send and public platform rules in force.
5. Separately verify a real authorized reply -> agreed scope ->
   verified payment -> delivery receipt. Bids and messages are not sales.

This lane is a reviewable source change, not an authorized blast
service or a claim of production deployment.
