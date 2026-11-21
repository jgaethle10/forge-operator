# Systemia value proof | shared internal receipt scorecard

This is an internal, dependency-free Systemia module for evaluating **observed customer outcomes** across existing Evercraft products. It is not another product, web tracking system, checkout, customer database, or agent authority.

## What it records

The reusable event envelope contains an opaque event ID, product key, job key, event type, UTC occurrence time, source type and opaque upstream receipt reference. Only event-specific whole-number values are accepted. Financial entries require explicit `currency: 'USD'` in v1; other currencies are held at validation until a currency-aware rollup exists. Never place customer PII, messages, private input, or provider credentials in IDs or refs.

Supported events: authorized inquiry; provider-confirmed payment and refund; delivery; customer acceptance; customer-attested before/after effort; and finalized direct-cost entry. Example targets: Work Saban (accepted task / saved effort); Evercraft Research (accepted evidence report); AI Boardroom (accepted decision review); ForensiScope (accepted processed media).

## Non-negotiable truth boundary

`buildValueProofScorecard(events,{verifyEvidence})` **requires an independently implemented trusted verifier**. The adapter must confirm the *actual upstream receipt* and return `{verified:true,source:event.evidence.source,ref:event.evidence.ref,claim_sha256:eventClaimDigest(event)}` only when it has independently fetched the authoritative receipt and checked **every claim field** (including job identity, currency, amount, timestamp and product) against that source. Simply hashing user-provided fields or confirming the reference exists is never verification. Source/ref/digest matching is necessary but **not sufficient** to establish provider truth; it is the caller's responsibility to build a real authenticated source-specific adapter. The test verifier is an explicitly mocked double, not production authority.

No verifier means no scorecard. Unknown, failed, missing or mismatched proofs are held, not promoted. Exact event retries are idempotent; conflicting event IDs fail. Multiple payment events or revised cost/value claims for the same product/job are held for reconciliation. The code does not initiate or verify a bank settlement, create an order, make a payment, publish content, dispatch agents, or authorize customer delivery.

## Interpretation

Counts describe only the verified events supplied to this read, **not complete company activity**. A zero means there is no verified submitted event for that field, not that the business had no transactions. `provider_paid_gross_cents` is not settled cash, and `business_profit_cents` is deliberately always null; direct costs are an incomplete view of business overhead, refunds, taxes and cash settlement.

Customer time saved is calculated only from an independently verified customer-attested before/after effort record **and** separately verified delivery and acceptance for the same job. Negative minutes are possible. It is not a wage estimate, customer ROI, or guaranteed benefit.

## Implementation and next gates

```sh
node --test tests/value-proof-ledger.test.mjs
```

Wire the adapter into Systemia's authorized signed intake, payment provider lookup/webhook validation, delivery service receipts, authenticated customer attestation and trusted cost ledger. Put secrets in the operator environment, never the browser or this repository. Add durable append-only storage and job/order reconciliation before claiming company-wide totals. Validate real receipts against provider objects and explicit tenant and product scopes. Deploy only after normal release reviews and source-specific live canaries.

Public product pages remain untouched. Existing Work Saban, Evercraft Research, Boardroom and ForensiScope product teams keep their own launch boundaries. No live payments, customers, economic outcomes or production deployment are asserted by this source change.
