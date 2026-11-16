# Evercraft Client Scout | Systemia sales specialist

A lightweight, **read-only client qualification specialist** within the existing Systemia Proof-First Sales subsystem. It scores evidence of a business need, maps it to a scoped Evercraft offer, and creates a next-action queue. It does **not** send messages, scrape contacts, take payments, create deals, declare customer revenue, or bypass Passport and the Interaction Ledger.

## Why this is not a new CRM

The canonical systems already exist:
- Systemia Offer Selection decides which offers deserve commercial focus.
- CHUM's published catalog defines the truthful public discovery surface.
- Proof-First Sales gates evidence and public proof.
- Passport controls who may contact whom, and the Interaction Ledger blocks duplicates, opt-outs, cooldowns and outstanding commitments.
- Evercraft Payments confirms provider-authoritative settlement and Systemia Shipping confirms delivery.

This module performs **only prospect-to-offer qualification** between research and consented, authorized outreach. It uses Proof-First Sales preflight and defers consequential execution to the existing systems.

## Current scope

The current offer mapping covers Systemia Website Audit Quick Win ($49, **catalog payment-ready but customer-path canary still required**), Work Saban monthly reporting **pilot only**, Asset Diagnosis ($149), Social Intelligence Launch ($1,000), Site-Survive resilience audit ($1,250), and bespoke Commercial Studio. It does not imply each offer's checkout, account, runtime or fulfillment is independently verified. The two scoped service product definitions route to a Systemia Stripe account not yet reconciled with the connected Evercraft LLC account. Do not issue checkout links without confirming the merchant account, tax handling and approved scope.

Public job openings, business directory listings, speculative pain, and friendly replies are **not** paid buyer intent. Contact permission is never inferred from a publicly visible email address.

## Running a private input

Use a local JSON file, never committed to this public repository:

```sh
node systemia/proof-first-sales/client-qualifier.mjs /private/authorized-client-signals.json
node --test systemia/proof-first-sales/client-qualifier.test.mjs
```

The input must be a JSON array of objects such as this **synthetic** example:

```json
[
  {
    "prospect_key": "synthetic-acme-1",
    "business": "Synthetic Example Co",
    "source_kind": "client_request",
    "evidence_refs": ["synthetic:message-123"],
    "observed_at": "2026-11-15T12:00:00Z",
    "need_tags": ["audience_research"],
    "reply_confirmed": true,
    "scope_requested": true,
    "decision_maker_confirmed": false,
    "budget_confirmed": false,
    "delivery_capacity_confirmed": false,
    "unanswered_outbound": 0,
    "public_proof_verified": false
  }
]
```

Do not put personal emails, message bodies, confidential contact information, or live customer records in GitHub or CI artifacts. Use opaque source references and inspect the authoritative private system for the actual facts.

## Qualification evidence states

- **scoping_priority:** source-grounded need, direct relationship, explicit scope request, confirmed budget and human-approved delivery capacity. Still **not a customer** and not a sale.
- **relationship_review:** an inbound or recognized relationship signal exists, but buyer intent, delivery or budget remains unconfirmed. Review the prior exchange before discussing any offer.
- **research_only:** public hiring/directory signal, missing source proof, or no fitted scoped offer. Research, do not pitch on invented pain.
- **fulfill_prior_commitment:** a promised deliverable exists. Fulfill before upselling.
- **waiting_reply:** at least two unanswered outbound messages. Hold.
- **do_not_contact:** opted out.

Even a high score never grants outbound authority. Sending requires explicit approved message, Passport scope, Interaction Ledger preflight, exact-message permit and provider receipt. No unattended send path is implemented.

## Real sales outcomes still needed

1. Human-confirmed need and permissioned conversation.
2. Written, deliverable-specific scope and confirmation of staffing/capacity.
3. Exact merchant/account/tax verification and buyer-approved checkout.
4. Provider-paid receipt, accepted deliverable and cost of fulfillment.
5. Repeat purchase or independent second paying customer.

A source-observed lead, PR merge, live link or completed mock run is not collected cash.

## Website Audit qualification boundary (November 15, 2026)

The published catalog reports a $49 machine-fulfilled Quick Win Audit with a free preview, but this is not independently verified customer checkout, provider settlement, or completed delivery. The owned offer URL is a discovery destination until a successful external HTTPS/checkout/fulfillment canary is recorded. Public service listings and web pages may justify research, but never establish broken conversion, buyer intent, or contact permission. Keep public prospects in research-only and do not run Gmail sends or drafts without authoritative target ownership, Interaction Ledger preflight, Passport scope and an exact-message permit.
