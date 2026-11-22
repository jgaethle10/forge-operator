# KAIDANCE · Clip · Stripe: one five-minute commercial heartbeat

**State: repository integration and CI tests.** A merged source file or a green GitHub Actions heartbeat is not evidence that Penguin/NextGen has private Stripe credentials or that any post was distributed.

## Why

The founder's decision is to present fixed, published offer prices without **additional automatically calculated tax at checkout**. This is a sales/checkout configuration preference, **not** an opinion that taxes are not legally owed. The company needs to separately assess registrations, taxability, tax-inclusive pricing, filing/remittance, and platform-specific obligations with appropriate accounting/legal guidance. Do not imply that disabling Stripe Tax grants an exemption.

Kaidance already runs a best-effort `*/5` schedule via `.github/workflows/kaidance-frontier-field.yml` and a staged owned Systemia Core resident service. The checkout lane in that workflow now joins **three** real evidence streams:

1. **Evercraft Clip source queue:** `distribution/marketing/evercraft-services-clip-20261110.review.json`. The entries already name seven legacy Systemia paid service SKUs and their intended Facebook/LinkedIn pages. They are currently *drafts*, with `authorization.approved:false`. The intake identifies the intended exact offer and placement without claiming permission to publish.
2. **Stripe inventory across five pinned connected accounts:** `registry/kaidance-payment-offer-bindings.v1.json` names merchant IDs and which accounts have promotion authority. The owner-hosted runtime can perform authenticated **GET-only**, 100-item-page paginated inventory reads for each merchant for which it has a private, restricted Stripe key. Unmapped inventory URLs are hashed and are never automatically promoted. The empty Evercraft Media account, the larger historical Evercraft Media account, and Systemia Forge are discovery-only, NOT permission to sell another product or revive RIVET.
3. **Exact active promotion from Clip's existing authorized private feed:** `evercraft.clip.verified-offer-beat.v1`, when actually furnished, with an existing publisher authorization independently rechecked. Kaidance checks the exact account, URL, one-time product, Price ID, quantity, listed cents, merchant, active status, post-payment destination, fixed-total controls and Stripe Tax / Managed Payments. A match generates a checkout placement candidate for the **separate, existing** authorized Clip publisher.

No blank or merely source-asserted approval becomes a publication permit. Changing the link changes the content digest, so the publisher must check its own original signed authority for the final exact content. `draftClipRequestWithCheckout` produces a **new unapproved draft** instead of reusing an old authorization.

## Verified provider inventory · November 21, 2026, 11 PM Pacific

The authenticated ChatGPT Stripe connection, **not** a live owned runtime, observed:

| Stripe merchant | Total links | Active | Active auto-tax enabled |
|---|---:|---:|---:|
| Evercraft LLC | 13 | 11 | 6 |
| Evercraft Media & Technologies (first account) | 0 | 0 | 0 |
| Evercraft Media & Technologies (second account) | 96 | 90 | 86 |
| Systemia | 15 | 15 | 3 |
| Systemia Forge | 13 | 11 | 10 |
| **Total** | **137** | **127** | **105** |

**These numbers are a dated provider observation**, not a claim of public storefront availability, paid orders, company legal ownership across all merchant brands, permitted fulfillment, or tax correctness. Inactive, retired-redirect and unapproved project links must not be reactivated by a heartbeat.

### Actual provider changes

- Evercraft LLC **Website Audit Quick Win** (`plink_1UcF345rgRECaZMDssa3Q87v`) had Stripe automatic tax enabled. On the owner's stated fixed-price instruction, that single exact known $49 SKU was updated to **automatic_tax.enabled=false**, re-read independently, and confirmed active with its same $49 Price ID and `https://buy.stripe.com/bJe28kfD885M9SP49n0Jq07` URL.
- The existing **$50 founding commercial** under Evercraft LLC already had automatic tax disabled; it remained unchanged.
- Systemia **$100 weekly social** (`plink_1U4uEXK4iDjqpECV8jfAriJQ`) and **$1,000 Social Intelligence Launch** (`plink_1U4RelK4iDjqpECVQntZr27T`) are `managed_payments.enabled:true` with `automatic_tax.enabled:true`. Stripe **rejected** attempted tax-off updates, explaining Managed Payments requires tax on. No successful change to these two links was made; they are **held** for fixed-price promotion, not silently remapped to a different merchant.

No other Stripe links were created, updated, activated, disabled, or priced by this integration.

## Practical heartbeat behavior

```
Kaidance / Systemia (300-second best-effort cycle)
  -> source: actual Clip commercial queue, choose exact intended SKU
  -> source: authenticated five-account Stripe inventory, when owner credentials exist
  -> source: fresh authenticated Clip promotion beat, when one actually exists
  -> exact merchant + exact price + no automatic tax + no variable checkout
  -> candidate placement and a review queue
  -> existing Clip signed publisher / authenticated platform readback
  -> Evercraft Payments authentic settlement / Shipping receipt
```

With no privately provisioned `SYSTEMIA_STRIPE_MERCHANT_KEY_FILES` and no fresh `SYSTEMIA_CLIP_PROMOTION_RECEIPT_FILE`, CI reports source campaign candidates and **not connected** provider merchant slots. It does **not** attempt Stripe POST, convert Managed Payments, charge anyone, or post social content. The ChatGPT Stripe app's connection is not automatically inherited by Evercraft-owned nodes.

The source queue is not itself a live campaign, and a link appearing in provider inventory is not itself eligible for public use. Unlisted links must be admitted to the exact-price registry after product/fulfillment approval. The two known fixed-price pilot links remain the most concrete starting point.

## Running and testing

```bash
node --test tests/kaidance-offer-checkout.test.mjs
node --test tests/kaidance-stripe-inventory-clip-intake.test.mjs
node systemia/payments/kaidance-checkout-cycle.mjs --out artifacts/kaidance-offer-checkout
```

Evidence paths: `artifacts/kaidance-offer-checkout/latest.json`, `inventory.json`, `actions.json`, `mission-snapshot.json`. Both repository/CI source and private resident runtime state must be kept distinct. The CI artifacts contain no Stripe keys and cannot validate the private owned-runtime connection.

**Next activation:** connect the existing authorized Clip request/permit source to `SYSTEMIA_CLIP_PROMOTION_RECEIPT_FILE`, provision merchant-specific read-only Stripe credentials on owned infrastructure, and verify consecutive source-to-provider heartbeat receipts. Separate Stripe link mutation authority only for exactly approved SKUs and seller/tax policy, with provider idempotency and post-change readback. Do not create a link merely because a source draft exists.
