# Evercraft Payments

Evercraft Payments is the canonical payment and economic-order layer for Evercraft.

## Non-negotiable routing invariant

```
customer / agent / product
        ↓
Evercraft Payments
        ↓
Raven Nexus provider boundary
        ↓
settlement adapter
        ↓
Stripe (currently connected)
```

Stripe is a settlement adapter. It is not the Evercraft product surface.

Products must not create a separate Stripe-first commercial path when Evercraft Payments is available. A customer-facing product should create or reference an Evercraft payment order, and the order may settle through the currently connected Stripe adapter behind Raven Nexus.

## What Evercraft owns

Evercraft Payments owns the canonical representation of:

- payment order
- product / offer identity
- quoted price
- customer confirmation state
- currency
- settlement routing
- payment receipt linkage
- entitlement state
- fulfillment state
- refunds / reversals as economic events
- agent-commerce authority
- provider-independent transaction lineage

A processor response alone must not become the canonical business record.

## What Raven Nexus owns

Raven Nexus is the governed provider connection boundary. Payment-provider credentials and adapter connectivity belong behind that boundary rather than inside product code or public discovery artifacts.

Current operator-declared provider state:

- Stripe is connected through Raven Nexus.
- Evercraft products should route payment through Evercraft Payments.
- Stripe remains replaceable settlement infrastructure.

Do not publish provider credentials, secret identifiers, or private Raven topology.

## Product integration rule

A new Evercraft product may declare:

```json
{
  "commerce_layer": "evercraft_payments",
  "settlement_route": "raven_nexus",
  "provider": "stripe",
  "provider_role": "settlement_adapter"
}
```

This metadata expresses architecture, not proof that a specific offer has a live checkout. Product-specific checkout readiness still requires a verified Evercraft payment-order path and authoritative settlement receipt.

## Anti-regression rule

Do not:

- tell a customer to use a generic Stripe link when an Evercraft Payments order exists,
- treat Stripe as the source of product entitlement,
- make product code depend directly on Stripe credentials,
- bypass Raven Nexus for provider credentials,
- create parallel processor-specific order truth,
- describe Stripe as Evercraft's payment product.

The user-facing brand and product surface is **Evercraft Payments**.


## Canonical payment orders

`order-ledger.mjs` adds the first canonical Evercraft payment-order state machine.

The order ledger is intentionally provider-neutral at the product boundary:

```
offer
  ↓
Evercraft Payments order
  ↓ explicit buyer confirmation
Raven Nexus checkout handoff
  ↓ verified Raven settlement receipt
settlement adapter
  ↓
paid Evercraft order
```

Current states:

- `confirmation_required`: Evercraft created a canonical order, but the buyer has not authorized payment continuation.
- `confirmed`: an accountable buyer explicitly confirmed the order.
- `settlement_pending`: Raven Nexus produced a verified checkout-handoff receipt. This is still **not paid**.
- `paid`: a distinct Raven Nexus settlement receipt verified the exact order, amount, currency and successful settlement state.

### Receipt verification

The ledger refuses Raven handoff or settlement transitions unless a caller supplies a `ravenReceiptVerifier`.

A string that resembles a receipt hash, checkout URL, Stripe event ID, or provider response is not enough to change canonical payment state.

Settlement verification must prove:

- Raven purpose = `payment_settlement_succeeded`;
- exact Evercraft order ID;
- exact amount in minor units;
- exact currency;
- successful settlement state;
- a valid Raven receipt hash distinct from the earlier checkout-handoff receipt.

### Idempotency

Order creation requires a caller-owned `requestKey`.

The request key deterministically identifies the canonical order. Repeating the same request with the same economics returns the existing order. Reusing the request key with different product/offer/amount/currency fails instead of creating competing economic truth.

### Tamper evidence

Each order is an append-only hash-chained event history. Materialized order state is recomputed and checked when read. Modifying an earlier event or materialized state breaks verification.

### First proving offer

The test suite uses the Evercraft Lineage Founding Pilot:

- product: `lineage`
- offer: `lineage-founding-pilot-500`
- amount: 50,000 USD minor units ($500)

This proves the route without claiming that a public Lineage checkout is live yet. The remaining production integration is a Raven Nexus adapter that can prepare the provider checkout and verify provider settlement into Raven receipts.
