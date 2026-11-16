# Evercraft OS / Independent Commercial Product Standard
Date: 2026-11-09
Status: source-backed initial implementation for the seven existing exact-SKU offers

## Founder decision

Evercraft OS is the parent operating system and shared capability substrate. **Each commercial offer is an independent product with its own identity, acquisition funnel, buyer outcome, contract, evidence and conversion record.** It can be sold without requiring customers to buy or understand the rest of the OS. Do not make a generic payments catalog the main product identity.

This specification concerns the **seven existing independently provider-checked Systemia Stripe links**. It does not magically bring other Evercraft products into an approved payment state. It also does not claim that the OS runtime automatically executes these scoped engagements.

## Product release contract

A sellable commercial product has:
1. **Own identity**: unique product ID, brand, landing URL, product-level search/discovery text, canonical exact Stripe SKU and listed price.
2. **Own buyer**: specific audience, painful problem, truthful concise outcome and evidence-based pitch.
3. **Own bounded delivery**: required buyer inputs, what is in the service, what is explicitly excluded, agreed timeline and acceptance criteria.
4. **Own conversion path**: scope request, owner delivery/capacity confirmation, exact-product Stripe checkout, authoritative paid receipt, matching Evercraft Payments order reconciliation, human fulfillment review, delivered and accepted artifact.
5. **Own distribution**: distinctive product-specific educational copy, offer copy and permissioned referral copy. Independent dedupe and provider publication receipt, not seven identical storefront reposts.
6. **Own economics**: per-product acquisition sources, qualified inquiries, approved orders, actual paid amount, refunds, labor, fulfillment cost, gross margin and repeat business. No synthetic traffic or unverified revenue metrics.
7. **Suite membership**: Evercraft OS may supply shared identity, memory, Research, Saban/Systemia, Passport, Raven Nexus and Evercraft Payments. These are architectural relationships, not claims that a particular runtime integration is already deployed.

### Implementation in the Forge repository

- Canonical existing exact-price links and verified provider IDs: `public/mesh/checkout-ready/verified-links.json` (unchanged)
- Portfolio machine index: `public/mesh/checkout-ready/products.json`
- Individual product identity, contracting and discovery: `public/mesh/checkout-ready/<slug>/product.json`, `llms.txt`, `index.html`
- Distinct campaign queues: `distribution/marketing/evercraft-os-independent-product-campaigns-20261109.json`
- CI gate: `tests/independent-commercial-products.test.mjs`, added to Existing Checkout Price and Truth Gate
- Live customer-facing URLs retain the seven independent `/mesh/checkout-ready/<slug>/` addresses to avoid needless redirects, SEO loss or checkout migration.

## Seven independent product lines

| Own product brand | Original provider product and price |
| --- | --- |
| Evercraft Social / Weekly | Social Media Management · Weekly, $100 |
| Evercraft Asset Diagnosis | Asset Diagnosis, $149 |
| Evercraft AI Boardroom / Standard | AI Boardroom · Standard Review, $250 |
| Evercraft AI Boardroom / Deep Dive | AI Boardroom · Deep Dive with Financial Modeling, $500 |
| Evercraft Knowledge Activation | Knowledge Activation, $500 |
| Evercraft Social Intelligence | Social Intelligence Launch, $1,000 |
| Evercraft Institutional Memory | Institutional Memory System, $1,500 |

Marketing labels are not replacement Stripe products. Buyer checkout identity remains the exact original service name and price.

## Commerce state machine, evidence required at each edge

`discovered` -> `qualified_inquiry` (buyer request) -> `scope_and_capacity_agreed` (written terms) -> `checkout_opened` (intent, NOT paid) -> `provider_paid_verified` (Stripe event/receipt) -> `evercraft_order_reconciled` (matching order) -> `fulfillment_accepted` (authorized work) -> `delivered` (artifact + handoff) -> `customer_accepted` (written criteria).

Any uncertainty stays at the last evidenced state. Stripe-hosted checkout reachability does not authorize treating Raven Nexus automated reconciliation as operational. Failed, delayed, disputed, canceled or refunded charges need their own provider-supported states. Never record sales based only on a click or checkout screen.

## Launch operating model

- One real customer problem, one matching product, one landing page. The larger OS is supporting context, not a sales prerequisite.
- Run the seven campaigns in parallel at a sustainable, respectful cadence. Product-level distribution should be tracked separately from whole-portfolio exposure.
- Prefer owned public discovery + legitimate customer intent and opted-in/permissioned referrals. No indiscriminate mass email. Any actual external publication needs real authenticated Evercraft corporate channel authority and a returned provider ID/permalink.
- A product is **commercially marketable** when its existing exact-price Stripe checkout and honest delivery terms are demonstrated, but **automated-service ready** only when real paid-order reconciliation, authorization, processing and delivery pass end-to-end.
- There is no requirement for a first customer purchase before genuinely marketing the existing scoped service, but there is a requirement to confirm scope/capacity before collecting each payment.

## Next engineering receipts (separate work; do not invent them)

1. Add verified event-driven Stripe -> Raven Nexus -> Evercraft Payments order ingestion with signature checks, idempotency, replay handling, refunds/disputes and durable correlation by exact product and buyer; test provider-paid-to-order state.
2. Add a customer scope/availability confirmation interface that creates a typed pending order, without collecting card data or treating an unapproved service scope as accepted.
3. Add per-product authorized public distribution + analytics, storing real post permalinks and independently observed buyer events without declaring synthetic activity as traction.
4. Deploy product-specific fulfillment checklists and signed/accepted delivery receipts through Systemia, only where worker and operator capability is proven.
5. Expand the same contract to additional Evercraft products **individually**, after each gains its own correct SKU, rights, scope and real checkout verification. Never borrow these seven links.

## Release boundaries

Evercraft Payments = canonical commerce authority target. Systemia account Stripe = present card settlement rail for seven exact original services. No automatic Evercraft Payments ledger reconciliation is yet proven for these links; manual provider receipt matching remains the honest state. No third-party platform host, Base44 dependency, unauthorized social account or off-scope legal-hold product is introduced in this change.
