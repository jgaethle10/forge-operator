# Evercraft Payments migration ledger

Updated: 2026-10-07

## Canonical authority

Evercraft Payments is the canonical authority for payment orders, verified receipts, and paid-state truth.

Raven Nexus is the settlement routing and connection layer.

Downstream providers are replaceable adapters. Provider checkout state, redirects, webhooks, or observations are not canonical payment proof by themselves.

Canonical route key:

- `evercraft-payments-central-v1`

Legacy Raven alias retained only for migration reference:

- `stripe-raven-v1`

## Paid-state invariant

A product may begin paid fulfillment only when a matching `EvercraftPaymentReceipt` exists and the order invariants match.

A Raven settlement observation may say that a downstream provider observed payment, but Raven does not mint Evercraft receipts and does not own canonical paid state.

Checkout creation is not payment.

Browser return is not payment.

Provider observation is not payment.

A verified Evercraft receipt is payment authority.

## Base44 canonical ledger

The payment authority app maintains:

- `EvercraftPaymentOrder`
- `EvercraftPaymentReceipt`
- `EvercraftPaymentAdapter`
- `EvercraftPaymentAttempt`
- `EvercraftPaymentOffer`
- `EvercraftFulfillmentContract`
- `EvercraftFulfillmentJob`

Existing payment orders were backfilled with neutral Raven route-lineage attempts without changing their paid state. Synthetic QA lineage remains marked synthetic.

## Product migration state

### RIVET

New checkout creation is Evercraft Payments-first.

Legacy RIVET verification is Raven-observed only and explicitly non-canonical until an Evercraft receipt exists.

### FindMyPart

Quick Hunt, Deep Hunt, and Rescue Hunt are registered as canonical Evercraft Payment offers with ready fulfillment contracts.

Human checkout, machine checkout, browser return verification, webhook handling, paid-hunt activation, and admin conversion converge on Evercraft Payments.

Pre-migration FindMyPart checkout sessions may be imported only after Raven independently re-fetches the session and all identity, amount, currency, customer, and paid-state invariants pass. Import creates the canonical Evercraft order/receipt before fulfillment.

The former FindMyPart provider rotator is retired into a migration-status audit.

### Transparency Atlas Data Center Record Check

The $49 Record Check is registered as a canonical Evercraft Payment offer with a ready evidence-controlled fulfillment contract.

The exact public return origin is:

- `https://evercraft-transparency-atlas.base44.app`

The private `ProfessionalInquiry` is the order identity. Checkout is created only after the inquiry exists.

The Atlas app now records payment order/session/route/receipt lineage on the inquiry, verifies return through Evercraft Payments, and preserves the separation between paid professional research and public evidence/editorial state.

Legacy Atlas sessions may be imported only after Raven invariant verification; canonical receipt creation and fulfillment queuing are idempotent.

## Remaining direct-provider migration debt

The remaining direct-entry references are confined to older standalone products:

- DayTradeLens checkout, verification, and billing portal
- Thoughtdrop checkout and verification
- Gaming Build checkout and verification
- Fantasy checkout and verification

Thoughtdrop migration is intentionally blocked until its exact production return origin is evidenced. The central origin allowlist must not be broadened to arbitrary Base44 or Evercraft hosts as a shortcut.

Recurring products such as DayTradeLens and Fantasy require an entitlement/subscription migration rather than a one-time checkout-only rewrite.

## Raven execution cutover still required

The owned repository contains:

- `raven-settlement-router.mjs`
- `raven-settlement-gateway.mjs`
- `raven-settlement-http.mjs`

The owned gateway exposes Raven settlement execution behind an internal bearer gate and preserves the authority boundary that observations cannot create canonical paid state.

However, the Base44 payment functions currently use function-local Raven compatibility adapters because Base44 function packaging does not allow importing sibling shared code and the owned Raven gateway has not yet been proven deployed and configured as the remote execution target.

Final cutover target:

`Evercraft Payments -> owned Raven Nexus gateway -> selected downstream adapter`

After that cutover is proven healthy, downstream provider credentials should be removed from product/payment Base44 runtimes and remain exclusively behind Raven.

## Migration rule

Do not call a product migrated merely because user-facing text says “Evercraft Payments” or because provider calls were wrapped in a Raven-named helper.

A migration is complete only when:

1. order identity is canonical in Evercraft Payments,
2. settlement goes through Raven,
3. paid state requires an Evercraft receipt,
4. fulfillment is idempotently tied to that receipt,
5. legacy provider observations cannot independently mark the product paid,
6. return origins and cross-app identities remain narrowly scoped,
7. the product passes build/type checks after migration.
