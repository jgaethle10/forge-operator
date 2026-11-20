# Evercraft Payments | Hosted post-payment destination guard

**State:** source-only, read-only, non-transactional. This guard detects dangerous destinations in an **authoritative, full Stripe GET /v1/payment_links snapshot** and blocks promotion recommendations. It never changes Stripe settings, opens checkout, sends email, accesses retired hosts, or claims customer payment.

## Why this exists

A permitted read of the live Evercraft LLC Stripe account on November 20 found **two active historical freight links** whose configured `after_completion.redirect.url` targets the **retired Base44 runtime**. Two active links do not imply two customers or orders. Any buyer who follows those redirects risks receiving a broken or unowned delivery experience after paying.

Canonical parent: [#2232](https://github.com/jgaethle10/forge-operator/issues/2232), with [#1303](https://github.com/jgaethle10/forge-operator/issues/1303) for real offer/checkout and [#1224](https://github.com/jgaethle10/forge-operator/issues/1224) for canonical Evercraft Payments.

## Contract

`auditPaymentLinkDestinations` takes the exact merchant ID and provider-approved merchant pin, a complete `data[]` array and the provider's `has_more:false`. Incomplete pages, bad IDs, conflicting accounts or duplicates are hard errors. For each active link it treats:

- Redirect to `*.base44.app` or other retired Base44 top-level domain, including nested/percent-encoded target: **hold_retired_runtime_redirect**.
- Redirect to any HTTPS destination without an explicit *privately verified, exact origin + pathname* owned-path attestation: **hold_unattested_success_redirect**.
- Non-HTTPS or malformed redirect: **hold_invalid_redirect**.
- Hosted Stripe confirmation: observed provider completion contract only, **NOT** proven paid order, fulfillment, payout, legal/tax or consumer support.
- Inactive historical link: no live exposure, not a functioning product.

Returns no raw Stripe link IDs or redirect URLs in the report. Instead it uses non-reversible SHA-256 excerpts for provider-link references. It exposes safe aggregate risk counts and explicit owner action required. Never put a complete live Stripe export, private processor credentials or customer records into GitHub.

## Release sequence

1. Own an authenticated, GET-only Stripe adapter in **Evercraft Payments / Raven Nexus**, pin account and paginate all links. The current ChatGPT connected Stripe read is not a deployed owner runtime.
2. Run this gate before distributing link catalogs, sales surfaces, or machine-generated checkout recommendations. Share results privately with Systemia.
3. Owner decides whether to **reversibly deactivate** unsafe links or migrate the exact SKU to a validated Evercraft-owned order + fulfillment flow. The source guard has no write authority.
4. Re-read provider link states and independently verify the new hosted destination, order accounting, tax, customer disclosures and post-payment delivery. Never use a test click as paid evidence.

Source acceptance: `node --test systemia/payments/payment-link-destination-gate.test.mjs`. Dedicated CI exercises the guard without Stripe credentials or any network.

**Historical finding is sourced from the live provider read and not embedded in repository source.** The actual provider state can change. Recheck against fresh provider data before claiming current exposure or remediation.
