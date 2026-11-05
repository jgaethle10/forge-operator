# NextGen → Evercraft Payments: owned operations candidate (2026-11-05)

## Evidence that led to this change
Node002 NextGen v2 external GET at 2026-11-05T22:33:21Z observed public Fabric `/health` HTTP 200 with both native purchase-intent and payment-operations endpoints unconfigured, `checkout_operational_state=held_owned_payment_endpoint_unconfigured`, and `deployment_receipt_bound=false`. Thus a responding offer page is **not** a working native checkout. The seven existing Stripe-hosted exact-price links were historical repository records, not live payment proof.

## What this branch actually implements
- `systemia/payments/owned-ops-service.mjs`: single-node, loopback-only, bearer-authorized **candidate** payment operations endpoint at `POST /api/payments/ops`.
- Fixed native offer identities and USD prices come from the shared `public-payment-offers.mjs` registry. Signal (requires scope acceptance) is deliberately withheld.
- Durable append-only JSONL journal on private local disk. Prepared orders are recorded before processor contact, with deterministic Stripe idempotency keys for retry.
- Stripe adapter can prepare hosted Checkout Sessions and **refetch** their canonical session to verify exact offer, order, currency, amount, mode and paid/completed status. Every checkout creation is still unpaid.
- Return verification records a provider-backed local paid receipt and leaves fulfillment `awaiting_human_review`; **never** unlocks entitlement or fulfillment automatically.
- Fabric checkout and return paths can carry `EVERCRAFT_PAYMENT_BACKEND_TOKEN` only on their vetted owned service URLs. No secrets are returned by health.
- `tests/owned-payment-ops.test.mjs` exercises amount identity, idempotent replay and restart, forged session rejection, unpaid and paid status, default live hold, auth and corrupt journal. CI tests use injected fake processor responses only, not real payments.

## Test on NextGen without credentials or charges

From a detached Git worktree containing this branch:

```sh
node --test tests/owned-payment-ops.test.mjs tests/payment-return.test.mjs tests/fabric-checkout-transport-truth.test.mjs tests/nextgen-payments-readiness.test.mjs
```

Neither these tests nor the public readiness probe charge a customer or contact Stripe.

## NOT READY FOR PUBLIC DEPLOYMENT
**Do not set the public Fabric owned payment URLs or announce native checkout ready from this branch.**

Remaining release blockers:
1. Resolve the owner-authorized Stripe account and test-key custody (not in GitHub or chat); provision auth token privately to public Fabric and the private backend. A real owned TLS path must exist from Fabric to the private backend, without public exposure of the service.
2. Implement and test durable authenticated signed Stripe webhook ingest, replay protection, async payment events and operator alert. Buyer return refetch alone is insufficient.
3. Design full refunds/disputes/reversals reconciliation against both Stripe settlement and canonical order ledger, and ensure ledger backups, stable single-writer ownership, crash recovery and replication.
4. Implement separate legacy `purchase_intent` contract or explicitly scope first launch to native exact-key offers, with end-to-end functional tests. Current candidate implements only `POST /api/payments/ops`.
5. Validate threat model, invoice/tax/customer terms, scope approval, service capacity, receipt lineage and human fulfillment handoff.
6. Pass authorized Stripe **test-mode** Checkout Session creation, duplicate retry, webhook/refetch, return, refund and reconciliation before any live-charge authorization.
7. Verify exact public release with independent external canary, signed Yard deployment/rollback receipts and buyer consent. Do not infer `checkout_provider_paid_verified=true` from code/test results.

Until those pass, existing exact-SKU Stripe-hosted payment links (after fresh account/checkout/scope review) remain the only previously verified commercial candidates; do not reuse their price for unrelated offers.
