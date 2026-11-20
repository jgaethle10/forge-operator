# Systemia Revenue Desk: Gmail receipt reconciliation (P0)

**Status:** committed **read-only owned-source** integration with offline synthetic tests. Not a live Gmail synchronization, not an automatic sender, and not proof of 400 emails/day. This implements the first source-side slice of canonical GitHub issue #2251, with Systemia Interaction Ledger and Passport remaining the contact authority. No independent CRM or third-party runtime.

## Mission

Five-minute Systemia scouts, Grok, Harbor, Saban and any human operator need **one grounded view of prior outreach** before any new recipient is contacted. A researched prospect is not a buyer. Gmail SENT is not delivered mail. Reply is not an acceptance. A link click, quote, or checkout session is not paid revenue.

The reconciliation takes two **private, locally exported** arrays:

- `messages`: `message_id,thread_id,direction,occurred_at,from_address,to_addresses[]`, optionally `is_auto_reply`, `is_bounce`, `content_fingerprint`. Each row must be sourced from actual Gmail history; export SENT and INBOX across all team sender lanes, including founder replies, quotations, operations and marketing. Preserve page cursors and record completeness. Never publish raw mail or contact exports to GitHub.
- `prospects`: `prospect_key,business_email,stage,contact_state,source_ref,pain_evidence_ref,official_contact_verified,provider_status_verified,legal_requirements_verified,delivery_scope_verified,passport_exact_message_permit_verified`, plus `opted_out,unfulfilled_commitment`. Any true verification field requires an independent evidence receipt in the private business/Passport ledger; an untrusted input boolean does not grant authority.

The pure `reconcileGmailOutreach` function HMAC-protects recipient, prospect and source references using a private per-organization secret, groups by verified contact, detects recent sends, auto-reply and bounce, marks reply receipts independently, and computes **rolling last-24h provider units** across ALL Gmail messages. Each multi-recipient outbound consumes conservatively one unit per recipient. The target is at most 400 new qualified business contacts/day and a default 100 slots held for replies/quotes/operational email, subject to whichever smaller cap the actual provider enforces.

### Fail-closed operational holds

No source-backed Gmail history coverage => **cold capacity unknown**, not 400 available. An incomplete Gmail export, an invalid outbound record, a missing provider cap, a negative compliance check or absent 100-slot reserve blocks new cold outreach. The existing Interaction Ledger then still independently enforces Passport authority, exact-message single-use permits, no-repeat rules, opt-outs, bounce suppressions, outstanding customer commitments, cooldown, and send receipts before any provider send.

`checkOutboundCandidate` is explicitly **non-authoritative**. It checks personalized business-specific opening, bounded fulfillment scope, proof, owner sampling, sender authentication, a legally valid physical postal address, working opt-out, suppressions and bounce health. Even on success it returns `ready_to_send:false`; final live authority requires a fresh verified Gmail history, the actual Passport exact-message permit and provider action.

### Private execution: report only

An owned operator can materialize **mode 0600**, absolute-path files within an owned mode 0700 directory:

```bash
node systemia/revenue-desk/reconcile-private-gmail.mjs \
  --mail-file /private/systemia/gmail-sent-inbox.json \
  --prospects-file /private/systemia/qualified-businesses.json \
  --hmac-key-file /private/systemia/reconciliation.key \
  --out-file /private/systemia/reconciled-gmail-report.json \
  --provider-cap 500
```

This is a private **shadow** result by default. The optional `--history-complete 1` is a statement by the operator after independent Gmail pagination and coverage checks. **A CLI flag is not proof of completeness**, so deployment must independently verify it before treating any capacity figure as live. No job should automatically contact anyone based solely on this report.

Reconciliation output deliberately omits unmasked customer emails and raw message content. Console output is aggregate counts only. Never commit private exports, HMAC secrets, customer addresses, or prospect identities.

## Release gates to true owned 400/day operation

1. Build an authorized Gmail export adapter that pages Sent/Inbox and DSNs, records coverage checkpoints and de-duplicates actual Gmail message IDs. Verify all accounts/agents that share quota; the existing connected Gmail connector is not an owned runtime adapter.
2. Bind the private report to the existing Systemia Interaction Ledger and Passport (not a second sender or an unsynchronized alternative ledger). Build an atomic single-use recipient/opportunity reservation around the actual send provider action; read-only advisory is not that reservation.
3. Verify all legal email disclosures, physical business mailing address, opt-out channel, real suppression/complaint health and sender SPF/DKIM/DMARC. Stop if any gate is missing. Validate recipient geography/marketplace rules.
4. Controlled sender canary and gradual deliverability-based ramp. Strong source-grounded uniqueness checks per actual buyer and role. A target is not required quota use. Never turn on 400/day blindly.
5. Reconcile received Gmail provider receipts and replies, quoted/accepted contracts, actual Stripe or other verified payment rails, and delivery. Keep `researched / verified / contact-ready / sent / replied / quoted / accepted / invoiced / paid` separate.

Source conformance: `node --test systemia/revenue-desk/gmail-reconciliation.test.mjs`.

**Truth boundary:** PR source/CI checks, when green, demonstrate the pure logic and private-file report only. They do not mean any real Gmail synchronization, contact reservation, send automation, new customer or revenue occurred.
