# Provider outreach receipt audit | Interaction Ledger

This is an **offline, read-only reporting adapter** for the canonical Interaction Ledger. It does **not** connect to Gmail, authorize contact, create a CRM, issue Passport action permits, send a message, or claim a provider's current quota. Its job is to summarize suppression reasons *before* requesting permission through the existing ledger.

## Contract

Input must come from a **trusted private Gmail/approved-provider ingestion process**. Never derive hard-bounce, opt-out, human-reply, or sent status from arbitrary snippets, subject lines, untrusted messages, or an AI guess. A delivery-status notification must be parsed and matched to the **original recipient** by the private integration. Preserve provider message IDs and timestamps. One message to two recipients counts once against the soft *message count* while each recipient still receives independent safety checks.

No real customer emails, raw bodies, private keys, or contact maps belong in the repository or GitHub CI. The output contains keyed HMAC-SHA256 contacts, not email addresses, with a runtime-only strong secret.

### Fictitious private input example

    {
      "now": "2026-11-20T12:00:00Z",
      "coverage": {
        "complete": true,
        "from": "2026-11-19T10:00:00Z",
        "through": "2026-11-20T12:00:00Z"
      },
      "events": [{
        "source": "authenticated_provider",
        "provider_id": "synthetic-provider-message-1",
        "contact": "fictional-recipient@example.test",
        "kind": "sent",
        "observed_at": "2026-11-20T11:00:00Z"
      }]
    }

The report returns these contact reasons:
- channel_opted_out or address_hard_bounced: DENY
- unresolved_delivery_delay, multiple_unanswered_outbounds, recent_outbound_no_human_reply: HOLD
- human_reply_requires_owner_review or never_auto_authorize_contact: MANUAL_REVIEW

A human reply is not a qualified buyer, accepted offer, or automatic permission to send. An automatic reply is not a human reply. A DENY/HOLD/MANUAL_REVIEW result never bypasses the separate required Passport grant, canonical Interaction Ledger preflight, single-use exact-message permit, provider checks and authoritative send receipt.

**400 per day is an internal, soft reporting ceiling, not a Gmail permission, rate limit guarantee, or a sender-enablement step.** The counter reports null known capacity unless the private adapter certifies complete 24-hour coverage. A limited Gmail search returning 44 sent messages does not mean 356 more can be sent.

## Private local usage

    node --test systemia/interaction-ledger/outreach-receipt-audit.test.mjs

    OUTREACH_AUDIT_HMAC_SECRET="$PRIVATE_32_BYTE_PLUS_SECRET" \
      node systemia/interaction-ledger/outreach-receipt-audit.mjs \
      --input /private/evercraft/provider-receipts.json

The private input file must be produced by authenticated ingestion, not a public document or an AI-transcribed inbox. The HMAC key should be loaded from owned secured runtime state in production, not stored in GitHub, shell history, or logs.

## Deployment / readiness status

- Deterministic source code and synthetic tests: available.
- Live mailbox ingestion, authenticated DSN parser, resident heartbeat, sender middleware: **not yet connected**.
- Cross-agent atomic send enforcement, 400/day delivery, real buyer conversion, completed checkout: **NOT PROVEN**.
- Next: authenticated private provider-event collector, mapping original recipients to canonical opaque Interaction Ledger identities, atomic preflight for all senders, fresh delivery quota check, and two concurrent sender canaries including an explicit opt-out test. Any real-world contact remains governed by the existing ledger and Passport, not this reporting adapter.
