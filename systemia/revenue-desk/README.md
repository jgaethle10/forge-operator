# Systemia Revenue Desk: Gmail receipt reconciliation (P0)

**Status:** committed **read-only owned-source** integration with offline synthetic tests. Not a live Gmail synchronization, not an automatic sender, and not proof of 400 emails/day. This implements the first source-side slice of canonical GitHub issue #2251, with Systemia Interaction Ledger and Passport remaining the contact authority. No independent CRM or third-party runtime.

## Mission

Five-minute Systemia scouts, Grok, Harbor, Saban and any human operator need **one grounded view of prior outreach** before any new recipient is contacted. A researched prospect is not a buyer. Gmail SENT is not delivered mail. Reply is not an acceptance. A link click, quote, or checkout session is not paid revenue.

The reconciliation takes two **private, locally exported** arrays:

- `messages`: `message_id,thread_id,direction,occurred_at,from_address,to_addresses[]`, optionally `is_auto_reply`, `is_bounce`, `content_fingerprint`. Each row must be sourced from actual Gmail history; export SENT and INBOX across all team sender lanes, including founder replies, quotations, operations and marketing. Preserve page cursors and record completeness. Never publish raw mail or contact exports to GitHub.
- `prospects`: `prospect_key,business_email,stage,contact_state,source_ref,pain_evidence_ref,official_contact_verified,provider_status_verified,legal_requirements_verified,delivery_scope_verified,passport_exact_message_permit_verified`, plus `opted_out,unfulfilled_commitment`. Any true verification field requires an independent evidence receipt in the private business/Passport ledger; an untrusted input boolean does not grant authority.

The pure `reconcileGmailOutreach` function HMAC-protects recipient, prospect and source references using a private per-organization secret, groups by verified contact and opportunity (including unsent duplicate prospects from Grok/Harbor and alternate verified mailboxes for an already-contacted opportunity), detects recent sends, auto-reply and bounce, marks reply receipts independently, and computes **rolling last-24h provider units** across ALL Gmail messages. Each multi-recipient outbound consumes conservatively one unit per recipient. The target is at most 400 new qualified business contacts/day and a default 100 slots held for replies/quotes/operational email, subject to whichever smaller cap the actual provider enforces.

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


## New source slice: shared cold outreach reservation and owned Gmail metadata import

`atomic-send-reservations.mjs` implements a **single-owned-filesystem, cross-process, atomic cold-target reservation**, coupled to the real `EvercraftInteractionLedger.prepareContactPermit` method and Passport. It requires a *private HMAC-signed*, fresh, complete Gmail reconciliation report from an independently trusted authorized backfill agent, legal footer actually present in the exact outgoing email, an explicitly verified first-party buyer, recent QA signoff, scope/fulfillment evidence, sender authentication, suppression health, and available rolling quota after the 100 reserved customer-reply units. It persists no raw email address or message body. A second attempt from another agent, same customer, or same opportunity is rejected. Reservations do **not** send mail or finalize a Passport permit. Unknown outcomes remain reserved; recovery needs authoritative Gmail reconciliation.

The shared reservation directory and Passport/Interaction Ledger directories **must reside on one genuinely shared, POSIX-atomic owned filesystem**. Separate Penguin and NextGen local storage, or separate agent copies of the directory, are NOT one shared global ledger. A cluster-safe durable transaction store or single authoritative owned coordinator must be proven before distributed worker rollout. The lock never auto-expires or self-heals a process crash; a stale lock is a hard hold needing controlled owner recovery.

`owned-gmail-import.mjs` is an **independent read-only Gmail REST metadata collector** that can be executed on an Evercraft-owned compute node using a valid user-authorized Google OAuth token stored in a mode-0600 file. It paginates through the selected mailbox and fetches `format=metadata` only; it does not ask Gmail for email bodies, attachments or any send privilege. Google documents `users.messages.list` pagination and `users.messages.get` metadata headers; for the filtered query the account needs `gmail.readonly` or another authorized non-metadata-only read scope, because Google's `gmail.metadata` scope does not allow the `q` parameter. **OAuth authorization and restricted-scope Google app verification are independent deployment requirements.** The existing connected Gmail app in ChatGPT is not itself an owned-node OAuth credential, and neither this PR nor the current conversation exports or obtains its secrets.

```bash
# All files and directory private, owned by Evercraft's operator account.
node systemia/revenue-desk/owned-gmail-import.mjs \
  --oauth-token-file /private/systemia/google-gmail-readonly.token \
  --full-history 1 \
  --out-file /private/systemia/gmail-history.json
```

Default is a bounded 30-hour window; it is sufficient to analyze recent activity but **not sufficient to claim complete historical de-duplication**. `--full-history 1` enumerates the accessible mailbox until pagination is fully exhausted; if its bounded page limit is reached, ingestion fails closed. All sending accounts and aliases still need cross-verified scope, and Gmail history collection alone cannot establish a provider's real effective sending limit or delivery complaints.

The importer writes its snapshot privately but does NOT sign a Gmail coverage authority receipt. No general source-controlled CLI or synthetic flag can grant itself permission to send: an independently reviewed owned signer and provider quota/DSN integration must be implemented before live sends. In current source tests the signature is generated from fixture data; fixtures are not production authorization.

Source tests:
```bash
node --test systemia/revenue-desk/gmail-reconciliation.test.mjs \
  systemia/revenue-desk/atomic-send-reservations.test.mjs \
  systemia/revenue-desk/owned-gmail-import.test.mjs
```

## Release gates to true owned 400/day operation

1. DONE IN SOURCE ONLY: authorized read-only Gmail metadata importer with paging, private storage and synthetic tests. STILL NEEDED: provider OAuth/read-scope verification on owned compute, complete coverage and truthful scoped signer, DSN/opt-out handling, full cross-sender and alias inventory and independent live canary. Verify all accounts/agents that share quota; the existing connected Gmail connector is not an owned runtime adapter.
2. DONE IN SOURCE ONLY: atomic single-filesystem reservation that calls the real Interaction Ledger/Passport exact-message permit on an admitted private report. STILL NEEDED: shared authoritative owned runtime across all agents/nodes, live provider execution that rechecks consent/expiry and second-stage atomic finalization with Gmail provider-retrieved send receipts. Source-only reservation is not sending authority.
3. Verify all legal email disclosures, physical business mailing address, opt-out channel, real suppression/complaint health and sender SPF/DKIM/DMARC. Stop if any gate is missing. Validate recipient geography/marketplace rules.
4. Controlled sender canary and gradual deliverability-based ramp. Strong source-grounded uniqueness checks per actual buyer and role. A target is not required quota use. Never turn on 400/day blindly.
5. Reconcile received Gmail provider receipts and replies, quoted/accepted contracts, actual Stripe or other verified payment rails, and delivery. Keep `researched / verified / contact-ready / sent / replied / quoted / accepted / invoiced / paid` separate.

Source conformance: `node --test systemia/revenue-desk/gmail-reconciliation.test.mjs`.

**Truth boundary:** PR source/CI checks, when green, demonstrate the pure logic and private-file report only. They do not mean any real Gmail synchronization, contact reservation, send automation, new customer or revenue occurred.

## P0 organization suppression (issue #2561)

The private reconciliation CLI accepts `--organization-registry-file /private/systemia/organization-registry.json` (absolute mode-0600 file). Its `organizations` array contains explicit canonical organization_key, contact_emails (verified aliases), state (clear, customer_hold, do_not_contact, review_required), and evidence_ref. No name or domain inference. Missing registry, missing mapping, conflicting mappings or malformed entries hold readiness. A seasonal review date never clears a hold. Only an authorized, evidence-backed registry revision can change the state. The source does not authenticate the registry independently; the existing trusted signer must verify its provenance, completeness, freshness, and current revision before signing. Never commit private registry contents. Reports contain only opaque organization references and state.

The reservation requires a unique signed contact/opportunity row and clear signed organization state. This is cold-email reservation only, not a deployed all-channel send gate. Existing stale reports lack organization evidence and will be denied. Provider dispatch, final fresh recheck, shared runtime enforcement, queue cancellation, verified owner-only registry ingestion and all-channel canaries remain required before releasing any outbound hold.
