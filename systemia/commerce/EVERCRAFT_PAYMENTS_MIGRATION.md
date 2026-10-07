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

The dashboard now makes this visible with separate counts for paid-without-fulfillment, open fulfillment, delivered work, captured outcomes, and distribution re-entry. It also includes a 30-day demand-to-revenue funnel showing discovery signals, qualification signals, checkout intent, checkout prepared, verified paid, delivered and re-entry, with an explicit current-bottleneck diagnosis.

### Deployment truth

The FindMyPart public agent gateway has been externally verified to serve the new conversion playbook.

The public portfolio machine-commerce catalog now externally returns the new `recommended_action` response. A representative data-center permits / ownership / water / power intent ranks Transparency Atlas Record Check first and returns the attributed $49 intake URL plus the human-confirmation boundary. A representative obsolete-machine-part sourcing intent ranks FindMyPart first and routes to the live FindMyPart offer endpoint with the triage / single-recommendation / explicit-confirmation instruction.

The FindMyPart public offer endpoint has also been externally verified to serve the new conversion playbook.

The public Atlas LLM surface exposes the Record Check page. At the latest external check, the generated public sitemap was still serving the previous version without the new Record Check sitemap entry, so that specific sitemap deployment must not be claimed live yet.

## 2026-10-07 closed-loop conversion hardening

Evercraft now distinguishes commercial evidence from infrastructure activity before treating anything as a receivable or demand signal.

The central conversion sensor projects payment, distribution and fulfillment evidence into a `DistributionConversionCase` truth layer. Current public-safe live summary at the time of this update:

- 53 classified conversion cases
- 1 attributable commercial open case totaling $2,093
- 51 quarantined machine/test artifacts
- 1 machine-discovery lane
- zero canonical paid conversion in the open receivable
- no machine discovery view is promoted to human demand merely because an agent, crawler or canary touched an offer surface

The quarantined population currently includes six anonymous Raven-generated checkout artifacts with no attributable customer/prospect context plus 45 QA, smoke, canary or synthetic orders. They remain observable for infrastructure QA but are excluded from commercial receivable totals and bulk reconciliation.

### Offline settlement rail

Raven Nexus now includes an explicit manual-check adapter while Evercraft Payments remains canonical order and receipt authority.

Offline settlement states are:

`requested -> instructions_sent -> remittance_claimed -> received_unverified -> deposited_pending -> cleared_verified`

Failure/void paths remain explicit. None of the pre-clearance states count as payment. Only `cleared_verified`, with amount/currency invariants and settlement evidence, may create an `EvercraftPaymentReceipt` through `manual_verified`.

The live $2,093 receivable has moved onto a customer-selected check rail with remittance instructions recorded as sent. Canonical paid remains false. The system therefore instructs operators not to send another card-checkout chase and instead to await remittance evidence under the receivable cadence.

The verifier also refuses a second offline settlement if the order has already acquired a canonical receipt through another rail.

### Prepayment fulfillment

Some invoices represent work delivered before collection. The fulfillment contract now has an explicit `prepayment_fulfillment_satisfied` flag plus evidence references. Only a contract carrying that explicit attestation may close fulfillment as delivered when an offline settlement later verifies. This avoids creating phantom fulfillment work after collection.

### Machine discovery is not demand

FindMyPart currently has machine discovery traffic but no real customer hunt lead in the live lead ledger; all existing lead rows inspected were synthetic QA fixtures.

Accordingly, agent offer/capability/LLM/OpenAPI views are classified as `machine_discovery`, not customer demand. The commercial ladder is now:

`machine_discovery -> concrete_problem_submitted -> qualified -> one_recommendation -> explicit_human_yes -> checkout -> canonical_receipt -> fulfillment -> delivery -> outcome -> reentry`

The FindMyPart machine-commerce catalog now routes concrete part intent to the live free qualification contract instead of the offer catalog:

`https://findmypart.base44.app/functions/findMyPartAgentGateway?view=qualification`

That public contract tells agents to submit the concrete part problem to free Part Passport triage, with email optional and no payment created. Triage returns one recommended hunt and a direct yes/no confirmation question. The paid offer surface now points back to qualification as the preferred next action rather than behaving as the discovery doorway.

The public MCP descriptions were updated to make `free_part_triage` the preferred first tool for a concrete part problem. Paid tiers are a comparison/recommendation layer after qualification unless the human already knows what they want.

### Distribution-surface verification

Externally verified live surfaces:

- Systemia machine-commerce natural-language intent routing points obsolete/unknown part intent to the FindMyPart qualification contract
- FindMyPart qualification endpoint returns `findmypart.agent.qualification.v1`
- FindMyPart offer endpoint returns both the qualification-first preferred action and the conversion playbook
- central conversion summary reports the $2,093 attributable receivable, quarantined artifacts and machine-discovery lane
- central code and frontend build pass

Base44's public host currently auto-generates `/llms.txt` and routes several static `.json` / `.html` paths through the SPA, so repository static files such as `agents.json`, `openapi.json` and `ai-conformance.json` must not be treated as deployed merely because they exist in the app source. The live function endpoints and Systemia machine-commerce catalog are the currently verified canonical machine-distribution surfaces.

### Systemia control-plane integration

The existing P0 `ai-distribution-control-plane-v1` work item now consumes the Evercraft conversion summary. Its acceptance criteria explicitly reject:

- checkout count as conversion
- QA/machine artifacts as receivables
- machine discovery as human demand
- distribution health claims that stop before payment, fulfillment, delivery, outcome and re-entry

The control plane prioritizes attributable commercial cases first, while preserving separate platform-distribution work in parallel.

