# ForensiScope authoritative payment verification, private staging

**Status: adapter and local tests only. Never claim live checkout or paid
access from this module.** ForensiScope's owned payment rail remains on
an external HTTP 402 hold until an independent provider receipt is
observed. This change cannot remove, override, or bypass that hold.

## What changed

The guest order ledger now exports **loadTrustedSettlementOrder(orderKey)**,
a server-only method that retrieves a persisted, customer-owned, exact-tier
order *after* checkout creation. It is not exposed as a public HTTP route,
and does not include customer email or token.

The new **owned-settlement-readback.mjs** builds a
verifyPaidOrder(orderKey) callback for the already-merged resumable
ingress and private job result services.

The adapter only contacts a separately configured HTTPS endpoint under
a supported Evercraft-owned domain. Its authorization credential is
required on the **private server** and is never stored in static browser
JavaScript, passed through a URL, or returned in public responses.
An explicit enabled=true owner flag is required.

## Required Evercraft Payments endpoint contract

The configured owned endpoint is expected to recognize this
server-to-server authenticated request:

POST with JSON:
- action: verify_order_settlement
- order_key: the immutable Evercraft-owned order key
- offer_key: the exact canonical ForensiScope tier
- amount_cents and currency: from persisted order, never the buyer

A successful payment status must return HTTP 200 and a JSON object
matching schema evercraft.payments.authoritative-settlement-readback.v1
with ALL of these fields:
- authority: evercraft_payments
- provider_boundary: raven_nexus
- order_key, offer_key, amount_cents, currency (exact order match)
- payment_state: paid
- provider_paid_verified: true
- settlement_verified: true
- livemode: true (test-mode receipts do not authorize public upload)
- refund_state: none
- dispute_state: none
- provider_receipt_id: nonempty provider verification reference
- verified_at: trusted ISO timestamp, no more than five minutes old

This is an **explicit integration contract**, not a claim that the
currently deployed Evercraft Payments API supports this action.
Owner implementation and current provider readback are still required.

Any missing field, HTTP 402, authentication failure, timeout,
untrusted hostname, malformed receipt, stale status, refunded or
disputed order returns **null**, not a positive paid state. The existing
evaluateForensiScopePaidUpload then denies media ingress and
readResult denies buyer results. A checkout URL, paid redirect query,
or a browser-provided paid flag is never sufficient.

## Private customer payment status

When the unified customer runtime receives an explicit trusted
settlementReader and the private guest ledger, it additionally exposes:

GET /v1/forensiscope/orders/:order_key/payment

The route authenticates the buyer, verifies the order belongs to that
buyer, and rechecks the **server-side** payment authority when a
checkout has been created. It returns one of:
checkout_not_started, pending_provider_verification, verified_paid.

The response deliberately contains NO provider receipt ID, secret
checkout URL, or upload authorization. A paid-status response is not
a bearer credential. The separate upload service still needs its own
fresh paid provider readback before accepting media.

The endpoint is private and loopback-only until a verified owned TLS
deployment, real identity provider, rate limiting and payment-readback
acceptance test are completed.

## What the tests prove

Run:

node --test tests/forensiscope-owned-settlement-readback.test.mjs

The tests prove:
- No provider request before a legitimate owned checkout exists.
- Exact 5-minute tier, order and provider receipt match.
- All 402, unpaid, sandbox, wrong-currency, mismatched-price, refunded,
  disputed and stale paid records are rejected.
- Existing *real local HTTP* ForensiScope upload service denies forged
  browser-paid flags and accepts only an authorized synthetic fixture.
- Secrets remain server-side and payment-origin allowlist is enforced.

**All payment fixtures are synthetic. No real merchant/provider data,
transaction, production webhooks, live authentication or public upload
were exercised in these tests.**

## Remaining launch requirements

- Actual owned payment service support for this signed readback
  contract, with independently verified live provider receipts.
- Secure authenticated customer login/recovery and anti-abuse quotas.
- Correct deploy-time wiring of guest ledger + checkout bridge +
  settlement reader + upload/worker/results to owned HTTPS.
- Receipt-backed capacity reservation, processing and private delivery.
- Real phone/device end-to-end flow, refunds and cancellations.

Keep the current public inquiry-only ForensiScope doorway unchanged
until the whole buyer journey passes.
