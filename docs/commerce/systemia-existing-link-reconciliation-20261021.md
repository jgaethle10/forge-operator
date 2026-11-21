# Evercraft Payments | Systemia existing checkout receipt adoption

Date: 2026-10-21. This is an **operator review and implementation gate**, not live deployment or an instruction to transfer money.

## What exists

- The first-party sales directory \`public/mesh/checkout-ready/verified-links.json\` lists **four existing live Systemia merchant links**, not the distinct Evercraft Media & Technologies Stripe account.
- Approved bindings are weekly social management ($100), asset diagnosis ($149), AI Boardroom Standard ($250), and AI Boardroom Financial Deep Dive ($500).
- The separate $19 FindMyPart and $49 Website Audit prices are not represented by these four links.
- Stripe-hosted checkout can collect payment under the Systemia merchant account, but the public directory itself creates **no first-party order**, no authoritative Evercraft receipt and no entitlement.
- The current provider reconciliation state is manual. An open or expired checkout session is not a sale.

## Verified money recognition contract

For a possible paid sale, a privately authorized Raven Nexus or operator connector must re-fetch all of these **from the same intended Stripe account**:

1. Checkout Session: \`GET /v1/checkout/sessions/{id}\`; live, complete and \`payment_status=paid\`, expected exact \`payment_link\` and total USD cents.
2. All line items: \`GET /v1/checkout/sessions/{id}/line_items\`; **complete pagination**, exactly one reviewed price and product, quantity one and exact price.
3. PaymentIntent: \`GET /v1/payment_intents/{id}\`; live, succeeded, fully received, matches session.
4. Charge: \`GET /v1/charges/{id}\`; same PaymentIntent, successful, captured, paid, undisputed and not refunded. Check current disputes/refunds again before delivery.

Run the in-process \`inspectSystemiaServicePaymentEvidence\` on this **trusted authenticated re-fetch only**, never on a browser callback, untrusted body, customer screenshot or unsigned webhook. The function is read-only and requires account identity confirmation by the caller. It emits an idempotent opaque observation key, **not** a canonical paid order or verified bank payout.

## Final gates still required

- Privately identify the buyer and order scope, obtaining customer consent and confirming that fulfillment capacity exists.
- Build an authenticated internal Evercraft Payments reconciliation service that binds the verified provider evidence key to one unique first-party customer order and approved offer/amount. Store a private paid receipt with replay controls, refund and dispute updates.
- Verify refunds/chargebacks and acceptance criteria before releasing fulfillment. Payment completion is not equivalent to funds reaching a bank account.
- Keep card/bank information and buyer PII out of public repo, public MCP and CI logs.
- Test with an explicitly authorized real buyer and a provider-backed receipt before claiming automated production readiness.

## Current safe way to sell

1. Share only the relevant offer from the already-published scoped [checkout directory](../../public/mesh/checkout-ready/index.html), after confirming scope and service capacity with the buyer.
2. Buyer chooses to complete hosted payment on Stripe. Never manually collect card data.
3. Review the merchant's authenticated Stripe records, then manually reconcile the real order and confirm delivery. Do not claim a sale from merely opening a checkout.
4. Leave the $19/$49 broken legacy buyer routes held until their separate owned checkout integration passes.

Nothing in this change enrolls credentials, creates Stripe links, charges a buyer, automatically imports provider events or claims paid revenue.
