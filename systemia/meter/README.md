# Evercraft Meter

Evercraft Meter is the shared usage and entitlement primitive for Evercraft products.

It answers three narrow questions without pretending to be a payment processor:

1. What authoritative entitlement was granted?
2. What receipt-backed usage actually occurred?
3. How much of that entitlement remains?

## Boundaries

- Meter does not charge cards, move money, create invoices, or prove payment.
- A checkout session, payment link, pending transaction, or prepared purchase is not enough to mint entitlement.
- Entitlements require either `authoritative_verified` authority with an external receipt reference or an explicitly `manual_authorized` grant.
- Usage is append-only and idempotent. Replaying the same event does not double count it.
- Every usage event requires an evidence reference.
- Products may also record pay-as-you-go usage without an entitlement; that records consumption only and grants no access by itself.

## Intended adopters

Examples include ForensiScope media minutes, RIVET reports, Evercraft Web retrieval units, Clip render minutes, agent/tool calls, seats, credits, and future shared compute usage.

Meter should sit between product execution and the authoritative billing/payment layer:

```
verified entitlement authority -> Evercraft Meter -> product execution
product receipt -> usage event -> Evercraft Meter -> billing/reconciliation
```

The product remains responsible for its own domain authorization. Meter supplies usage and entitlement facts, not blanket product authority.
