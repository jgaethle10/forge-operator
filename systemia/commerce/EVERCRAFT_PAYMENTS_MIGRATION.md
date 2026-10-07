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


## Distribution-circle doctrine

A product definition is not distribution.

A checkout is not conversion.

A payment is not fulfillment.

A delivery is not distribution re-entry.

Evercraft should treat the commercial circle as a sequence of independently evidenced states:

`discovered -> qualified -> recommended -> explicitly_confirmed -> checkout_created -> payment_verified -> fulfillment_queued -> in_progress -> delivery_ready -> delivered -> outcome_captured -> distribution_reentry`

Each transition must remain measurable without promoting an earlier state into a later one.

### Canonical proof sources

- discovery / qualification / recommendation: distribution and product-specific evidence
- checkout creation: Evercraft Payments order + Raven attempt
- payment: canonical `EvercraftPaymentReceipt`
- fulfillment: `EvercraftFulfillmentJob` + immutable `EvercraftFulfillmentEvent`
- delivery: delivered fulfillment transition with durable output reference
- outcome: post-delivery outcome event
- distribution re-entry: currently counted only for referral generated, repeat purchase, or approved case-study signal

Customer acceptance or a completed delivery is valuable, but it is not itself counted as distribution re-entry.

### Fulfillment state machine

Evercraft Payments now exposes explicit fulfillment transitions:

- `queued -> admitted`
- `admitted -> in_progress`
- `in_progress -> delivery_ready`
- `delivery_ready -> delivered`

Blocked and cancelled states remain explicit. Delivery-ready and delivered transitions require at least one durable output reference. Paid non-synthetic orders without a fulfillment job are treated as incidents and surfaced as attention items rather than silently disappearing after payment.

Supported post-delivery outcomes currently include:

- `customer_accepted`
- `revision_requested`
- `referral_generated`
- `repeat_purchase`
- `case_study_approved`
- `no_response`

### Distribution attribution

Evercraft Payments now stamps authority-backed distribution events for:

- checkout created
- payment verified
- fulfillment queued
- fulfillment delivered
- fulfillment blocked
- post-delivery outcomes

Attribution context is carried through the order from source surface, acquisition source, UTM source/medium/campaign, referral code, and other bounded product context.

### Transparency Atlas distribution loop

The Data Center Record Check now has:

- an inquiry-bound $49 Evercraft Payments offer
- first-party funnel events from inquiry through payment and fulfillment
- a private lifecycle-sync token so paid / fulfilling / delivered state can return to Atlas even if the buyer closes the browser after checkout
- Record Check discovery in the public LLM surface
- internal CTAs from facility, local SEO and state SEO routes with UTM attribution
- a portfolio machine-commerce capability for natural-language data-center due-diligence intent

The public evidence ladder remains independent of the commercial outcome.

### FindMyPart agent conversion handoff

The public agent gateway now directs agents toward:

`free triage -> one recommended paid hunt -> exact price -> one direct yes/no confirmation -> checkout -> canonical Evercraft receipt -> fulfillment/status`

It explicitly tells agents not to dump every tier by default. A concrete triage result returns a single recommended offer and a confirmation-question template. Legitimate agent acquisition labels are preserved rather than collapsed to `other`.

### Current live economic truth

As of the latest 2026-10-07 ledger inspection:

- canonical paid non-synthetic Evercraft orders: 0
- fulfillment jobs: 0
- delivered jobs: 0
- post-delivery outcomes: 0
- distribution re-entry events: 0

At the same time, the distribution ledger already contained meaningful machine discovery activity, including 24 agent offer views, 12 agent capability views, 5 LLM-manifest views, 4 OpenAPI views, 5 agent-doc views, and 2 free-triage events.

Therefore the system must not describe the distribution circle as closed yet. Attention is reaching Evercraft, but the observed bottleneck is still the handoff from discovery / qualification into explicit purchase intent and canonical paid conversion.

The dashboard now makes this visible with separate counts for paid-without-fulfillment, open fulfillment, delivered work, captured outcomes, and distribution re-entry.

### Deployment truth

The FindMyPart public agent gateway has been externally verified to serve the new conversion playbook.

The portfolio machine-commerce catalog data already includes the Transparency Atlas Record Check and externally ranks it first for a representative data-center permits / ownership / water / power intent. The new `recommended_action` response logic is committed and type-checks cleanly, but the currently public catalog endpoint was observed still serving the prior generic `next_step`, so that code change must not be claimed public until the app deployment advances.

Likewise, the public Atlas LLM surface exposes the Record Check page, while the generated public sitemap observed externally was still serving the previous version without the new Record Check sitemap entry.
