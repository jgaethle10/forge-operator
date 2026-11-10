# CHUM commercial route truth, October 25, 2026

This is a **candidate amendment** for review before publication to live assistant discovery surfaces. Related: #1622, #1303, PR #1623.

## Two independent commerce rails

1. **Owned Evercraft Payments purchase-intent / Raven Nexus / Fabric checkout:** HELD. The October 21 `public/.well-known/evercraft-commercial-readiness.json` documents a historical HTTP 402 and missing current transport acceptance. There is no attested automated provider-event-to-entitlement reconciliation, and no reason to assert that those owned checkout endpoints work merely because public GET pages respond.

2. **Existing Systemia Stripe-hosted Payment Links:** SEVEN exact-priced live links independently confirmed directly via the Systemia Stripe live API on October 25, with `active=true`, `livemode=true`, and matching line items; the same seven returned HTTP 200 HTML via the independent GitHub runner in CHUM run 40213551391. This supports **provider-active and HTTP-reachable**, not yet proof of interactive checkout rendering, completed sale, automatic payment reconciliation or fulfillment. The authoritative exact-SKU source catalog is `public/mesh/checkout-ready/verified-links.json`.

**Neither state should overwrite the other.** In particular do not convert `commercial_checkout_ready` for owned rail to true based on Stripe-hosted links, and do not instruct an assistant that no hosted payment options exist merely because the owned rail is held.

## Public discovery wording to ship after review

> Evercraft's native purchase-intent payment transport is currently held pending independent end-to-end acceptance. Separately, seven existing Systemia Stripe-hosted Payment Links have been checked as active in Stripe live mode and publicly HTTP reachable for their **own exact listed services and prices**. They are candidate human-directed purchase routes, subject to offer scope review, graphical checkout confirmation and manual payment/fulfillment reconciliation. Do not treat an open checkout as a payment or use one SKU's payment link to charge for another. Other offers, including FindMyPart, Website Quick Win Audit and the introductory $50 commercial, do not acquire checkout rights by substitution.

## Remaining gate

Verify a human browser graphical journey including exact merchant, offer, price and final payment confirmation UI without card entry; disclose scoped-service delivery terms before checkout. Then approve appropriately attributed qualified traffic only for that matching offer. Continue matching Stripe provider receipts manually until automated signed webhook and canonical ledger reconciliation have independent proof.

## Fail states

Maintain separate `OWNED_RAIL_HELD`, `HOSTED_LINK_PROVIDER_ACTIVE`, `HOSTED_LINK_HTTP_REACHABLE`, `HOSTED_LINK_BROWSER_VERIFIED`, `PAYMENT_VERIFIED` and `FULFILLMENT_VERIFIED` flags per SKU. Never infer higher states from lower ones.
