# Evercraft Meter

Evercraft Meter is the shared capacity, usage, and entitlement control plane for Evercraft products.

It is intentionally more than a counter. It lets a product ask whether capacity exists, reserve that capacity before expensive work begins, commit the reservation only when receipt-backed work actually occurs, release it when work is cancelled, and produce deterministic settlement digests for reconciliation.

## Core flow

```
authoritative grant
  -> quote capacity
  -> reserve capacity
  -> execute product work
  -> commit with evidence OR release
  -> settlement digest
```

This gives products a common answer to five questions:

1. What authoritative entitlement was granted?
2. Is enough capacity available right now?
3. Can that capacity be held so another worker cannot consume it first?
4. What receipt-backed usage actually occurred?
5. What usage facts should be reconciled with billing without inventing price or payment state?

## Important properties

- **Atomic mutation lock.** Multiple local workers sharing the same Meter state cannot race the same entitlement mutation.
- **Reservations.** Workloads can reserve quota before execution, preventing two workers from both believing the same capacity is available.
- **Automatic reservation expiry.** Abandoned reservations stop consuming available capacity after their bounded hold window.
- **Commit or release.** Successful work converts one reservation into one usage event. Cancelled work returns capacity.
- **Crash-aware recovery.** A persisted usage event tied to a reservation is treated as proof of consumption even if the process died before the explicit commit-state event was appended.
- **Earliest-expiring entitlement selection.** When several valid entitlements can satisfy a request, Meter prefers the one expiring first.
- **Dry-run authorization quote.** Products can check capacity without mutating state.
- **Append-only receipts and idempotency.** Retries do not double count grants, reservations, or usage.
- **Settlement digests.** Meter groups usage into deterministic product/metric/unit buckets and hashes the result for downstream reconciliation.

## Boundaries

- Meter does not charge cards, move money, create invoices, calculate tax, or prove payment.
- A checkout session, payment link, pending transaction, or prepared purchase is not enough to mint entitlement.
- Entitlements require either `authoritative_verified` authority with an external receipt reference or an explicitly `manual_authorized` grant.
- Every committed usage event requires an evidence reference.
- Products may record pay-as-you-go usage without an entitlement; that records consumption only and grants no access by itself.
- Settlement digests deliberately contain no price and infer no payment state.
- Product-specific authorization remains the product's responsibility. Meter is a capacity and usage authority, not blanket access control.

## Intended adopters

Examples include:

- ForensiScope media minutes
- RIVET site reports
- Evercraft Web retrieval units
- Evercraft Clip render minutes
- agent or MCP tool calls
- Saban / Evercraft Compute units
- seats and shared credits
- future API plans and machine-to-machine subscriptions

The goal is one common commercial primitive across the portfolio instead of every product inventing its own quota logic.

## Example

A ForensiScope job that expects to consume 47 minutes can reserve 47 `media_minutes` before processing. Another worker sees the reduced available balance immediately. If the job completes, the reservation commits with the job receipt. If it fails, the reservation is released. If the process disappears, the hold expires automatically.

That pattern makes Meter useful for real execution control, not merely retrospective billing.
