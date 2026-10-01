# Evercraft Payments Economic Kernel

Evercraft Payments is the provider-neutral economic authority for Evercraft commerce. Payment processors are settlement adapters, not the source of truth for Evercraft orders, rights, work, or economic relationships.

## Constitutional invariants

1. No payment order exists without an approved price quote.
2. Order creation is idempotent. Reusing an idempotency key with different economic content fails closed.
3. Checkout creation is not payment proof.
4. Frontend redirects, client callbacks, screenshots, and unverified webhook bodies cannot activate paid state.
5. Paid state requires authoritative server-side provider verification with exact currency and amount matching.
6. Every verified settlement produces balanced ledger entries.
7. Entitlements and fulfillment obligations remain locked until payment is authoritatively verified.
8. Split instructions represent economic allocation. They do not claim a payout occurred.
9. External processors never own Evercraft's canonical business state.

## Current kernel objects

- evercraft.economic-actor.v1
- evercraft.price-quote.v1
- evercraft.payment-order.v1
- evercraft.payment-attempt.v1
- evercraft.ledger-entry.v1
- evercraft.revenue-receipt.v1

The first implementation is deliberately provider-neutral and in-memory. It makes the invariants executable before persistence, provider adapters, payouts, refunds, subscriptions, metering, and production API surfaces are connected.

## Test

Run:

    node --test systemia/payments/economic-kernel.test.mjs

The CI gate in .github/workflows/evercraft-payments-kernel.yml runs this test whenever the kernel or its public machine contract changes.
