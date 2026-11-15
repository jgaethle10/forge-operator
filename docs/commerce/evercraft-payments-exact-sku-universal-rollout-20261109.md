# Evercraft Payments | Exact-SKU rollout to the whole portfolio
**Operating decision:** 2026-11-09. **Status:** Source candidate; not a live processor integration or claimed new sale.

## What is working now
- Seven independently priced and identified Systemia Stripe payment links are maintained under `public/mesh/checkout-ready/verified-links.json`.
- A browser-rendered GitHub Actions run on Nov 9, 2026 (run 42758200403) verified **7/7** existing checkout pages displayed the right original SKU, price and payment fields. It did **not** submit payment or create an Evercraft Payments order.
- Each has a separately marketed Evercraft OS product identity and landing page under `public/mesh/checkout-ready/<slug>/`.
- Checkout link readiness, charged payment, paid-order reconciliation, entitlement, and shipped deliverable are separate evidence states. Reconciliation for the seven existing links is currently manual.

## The shared commercial contract
A product or offer may become payable through Evercraft Payments without rebuilding a separate payment system, but each must have an **exact** authorized offer, amount, scope/fulfillment policy and matching provider SKU.
1. **Commercial product identity:** canonical `product_id`, exact provider `offer_key`, honest public page, actual buyer and outcome.
2. **Exact priced SKU:** fixed approved amount/currency, distinct Stripe product, price, and payment link in the approved Systemia merchant account. An identical amount on another SKU is **not** equivalent.
3. **Pre-purchase consent:** scope, delivery capacity and buyer confirmation recorded before presenting a purchase link. No URL substitution across offers.
4. **First-party order authority:** Evercraft Payments is the intended canonical order record, Raven Nexus the governed processor boundary, Stripe the existing settlement adapter. The legacy seven links still require manual reconciliation pending authenticated order/event integration.
5. **Evidence:** independent read-only browser check of exact product title, amount, payment fields and original provider domain, recorded with a dated CI artifact. Later, independently verified paid event/refetch with matching account, order, price and currency.
6. **Fulfillment:** scoped entitlement, delivery receipt, exception/refund/chargeback tracking; do not auto-release on checkout-open, synthetic receipt or customer return URL.
7. **Monitoring and acquisition:** the original seven continue under the existing owned Playwright canary. The proposed six-hour cadence applies on main only after this PR is merged. Each future exact SKU must also be added to continuous buyer-view verification before promoted release.

## Source-only integration delivered
- `systemia/payments/exact-sku-checkout.mjs` resolves only an independently registered `product_id` to its **original exact** provider checkout after human scope/capacity/buyer gates. Missing IDs return `EXACT_SKU_NOT_PROVISIONED`; wrong prices/currency return explicit holds. It does not authorize a charge or set `paid=true`.
- `public/.well-known/evercraft-payments-additional-exact-skus.json` is a separately managed extension registry, initially **empty**. This preserves the original seven links and their receipt tests while allowing future identities to be added with reviewed owner approval and independent browser evidence.
- `tests/exact-sku-checkout.test.mjs` certifies seven original identities, holds unmapped items and rejects duplicate SKUs, wrong price and unapproved URLs.

## Product inventory is not revenue inventory
The public registry currently lists 69 discoverable Evercraft products and capabilities. These are not 69 merchant-approved paid offers. The seven independently priced commercial products overlap that portfolio conceptually; do not add counts or infer that every capability is commercially released. Unpriced, technically incomplete, regulated or legal-held products remain outside checkout until appropriate authorization and delivery capacity exist.

## Onboarding priorities, not a blanket launch authorization
- **Near-term candidates:** FindMyPart Quick Hunt $19, Website Quick Win Audit $49, ForensiScope approved media tiers, and Evercraft Signal $250. Each needs its own provider-approved exact price/payment link and real fulfillment scope. These cannot reuse $100/$149/$250/$500/$1,000/$1,500 service links.
- **Already sellable as scoped services:** seven existing offers. Promote their specific pages to qualified buyers now; first payment is not a marketing prerequisite.
- **Later:** other Evercraft OS product catalog entries, after rights, support, delivered output, productization, and valid cost model are established.
- **Held:** RIVET/AliEV and prohibited third-party/Base44 runtimes are not reopened by this design.

## Still blocked by external authorization
The connected Stripe account operation was declined in this session. No new Stripe products, prices or links were created; do not infer account availability or seek credentials through side routes. Owner-authorized processor setup plus evidence is still required to activate additional specific SKUs. No transaction, deployment, automatic payment-to-Shipping reconciliation, or actual revenue is claimed here.
