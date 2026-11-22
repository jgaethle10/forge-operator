# KAIDANCE × Evercraft Payments: Every offer gets the right link

**State: source + five-minute heartbeat integration, read-only.** The linked ChatGPT Stripe accounts are not automatically mounted on the Evercraft-owned Node001/NextGen runtime. No new Stripe Payment Links were created, updated or disabled by this source change. No social post was published.

## Company rule

**Kaidance beat → current Evercraft Clip promotion receipt → canonical exact-price offer catalog → fresh authenticated Stripe GET → verified checkout placement candidate → separate existing Clip/Passport publisher gate → payment provider receipt → Evercraft Payments order → Shipping.**

The selected campaign decides the link. The Stripe link never decides which offer to sell. A new beat that promotes another SKU can use another verified checkout URL without mutating the original Stripe link or changing its price.

Our existing Evercraft-owned marketing surfaces should use a stable first-party `/offers/<exact-offer>` door when that exact route is independently verified and bound to the seller. New social posts can include the verified link with their separately authorized publication. Changing a Stripe URL **cannot retroactively edit a Facebook/TikTok/LinkedIn post**; editing previously published text would require those platforms' independent permissions and an actual edit receipt.

## Actual provider discovery from November 21, 2026

Live Stripe reads identified **five connected merchant accounts**. The two pinned Evercraft LLC pilot SKUs are:
- `evercraft.commercial.founding-30s.50.v1`: 30-second founding commercial, $50 USD, one-time, active `plink_1Ucspt5rgRECaZMDrHsAtflv`, expected `price_1Ucsny5rgRECaZMD359WcltA`, hosted confirmation.
- `systemia.website_audit_quick_win_49.v1`: Website Audit Quick Win, $49 USD, one-time, active `plink_1UcF345rgRECaZMDssa3Q87v`, expected `price_1UcF2D5rgRECaZMDEz4rR5VW`, hosted confirmation.

Both are in the **Evercraft LLC** account, not the separate **Systemia** merchant. The seven existing Systemia-only service SKUs remain sourced from `public/mesh/checkout-ready/verified-links.json` and are eligible for selection **only after a fresh authenticated provider readback**. The catalog's October 21 checkout observations do not establish current November provider authority.

Exact merchants and provider price IDs are pinned in `registry/kaidance-payment-offer-bindings.v1.json`. Matching checks the merchant account, link ID, active status, one-time product and price, quantity, amount, currency, URL and post-checkout destination. Any missing, stale, ambiguous, cross-account, retired-host, or mismatched data means **HOLD**, not best-guess URL.

## Promotion contract from Evercraft Clip

This is a private, machine-readable snapshot, **not** an authorization token. It must come from an already independently authorized Clip publication / approval lane.

```json
{
  "schema": "evercraft.clip.verified-offer-beat.v1",
  "observed_at": "2026-11-22T07:00:00Z",
  "offers": [
    {
      "campaign_id": "example-from-actual-clip-mission",
      "placement_key": "facebook-evercraft",
      "offer_key": "evercraft.commercial.founding-30s.50.v1",
      "merchant": "evercraft-llc",
      "offer_amount_cents": 5000,
      "currency": "usd",
      "promotion_state": "ready_for_publisher_verification"
    }
  ]
}
```

The actual event is private, mode 0600 and owner-bound. This sample is documentation, not a real current promotion, verified post or permission to send anything. The downstream Clip publisher still must independently recheck signed authorization, brand/page authority, exact message, link readback and delivery. No generic Boolean supplied by a model grants publication permission.

## Private Stripe access, not ChatGPT connector reuse

The owned resident runtime needs its own authorized Stripe **read-only restricted keys**, kept in mode 0600 key files outside the repository. The checkout cycle can inspect merchant identity (`GET /v1/account`), the exact pinned Payment Link and its line items via `GET` only. It does **not** use Stripe write endpoints. Missing or incorrectly scoped keys hold the lane.

Example private mode-0600 config:

```json
{
  "schema": "evercraft.payments.private-stripe-key-files.v1",
  "key_files": {
    "evercraft-llc": "/PRIVATE/PATH/stripe-evercraft.readonly.key",
    "systemia": "/PRIVATE/PATH/stripe-systemia.readonly.key"
  }
}
```

This is a shape example. **Do not** create these paths in GitHub, share keys in chat, or assume they exist. Provision through owner-only secrets management after verifying the installed Stripe permissions and resident host's authority.

Operator command (after actual private config is installed):

```bash
node systemia/payments/kaidance-checkout-cycle.mjs \
  --out /PRIVATE/kaidance/checkout \
  --promotion-file /PRIVATE/clip/current-approved-promotion.json \
  --stripe-credentials-file /PRIVATE/stripe/merchant-key-files.json
```

Without those private integrations, the same existing five-minute `kaidance-frontier-field.yml` still emits a truthful `awaiting_current_clip_promotion_receipt` receipt with zero payment-link creations, not an invented sale or a broken external call. There is an optional 300-second `kaidance-offer-checkout` Systemia Core resident service; it is **not automatically deployed or activated** by the PR.

## Write authority and next stage

Stripe Payment Link creation, activation/deactivation, after-completion changes and pricing are **separate provider writes**, even when an agent already has a granted Stripe permission in ChatGPT. Add a narrowly scoped, provider-authenticated and idempotent **exact-price link ensure** adapter only after independent confirmation of SKU approval, Stripe Tax policy, merchant account, required post-payment destination, signed Systemia gate and live provider readback. It should avoid creating duplicate links if the exact SKU has an active usable one. Do not reuse an old link to misrepresent a new price or silently disable outstanding paid customer routes.

The heartbeat action file requests reconciliation where a link is inactive or missing. It does not execute mutations or bypass Evercraft Payments settlement/fulfillment verification.

## Commands and evidence

```bash
node --test tests/kaidance-offer-checkout.test.mjs
node systemia/payments/kaidance-checkout-cycle.mjs --out artifacts/kaidance-offer-checkout
```

Outputs under private/CI artifacts: `latest.json` (account-aware placement candidates), `actions.json` (deduplicated review work), `mission-snapshot.json` (optional Kaidance Collider input). Every receipt explicitly reports zero actual Stripe writes, zero publications and zero verified payments.

Goal: each beat can determine **which approved offer is being pushed, which exact link belongs to it, and which link needs work**, while the real authorized sales/distribution chain is responsible for the external action.
