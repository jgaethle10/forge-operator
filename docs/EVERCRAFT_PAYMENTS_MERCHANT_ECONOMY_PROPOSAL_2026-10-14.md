# Evercraft Payments | Merchant-friendly economics + opted-in growth scout

**Proposed design only. Not a live price, licensed processor, new offer, or authorization to charge.**

## Position
- Evercraft Payments owns merchant agreement, canonical payment orders, quote truth, receipts, entitlements, refunds, and fulfillment lineage.
- Raven Nexus routes to approved payment providers and keeps credentials behind the governed boundary.
- Initially an orchestration/platform service with compliant processor(s), NOT a standalone acquirer, custodian or money transmitter.
- Stripe US public standard online domestic card rate is 2.9% + $0.30 (see https://stripe.com/pricing). This is a **reference**, not the true net cost available to Evercraft. Stripe Connect's pricing choices can add platform, account or payout expenses (see https://stripe.com/connect/pricing). We cannot promise to beat Stripe when paying its retail processing fee plus overhead.
- Price competitiveness requires a verified wholesale/IC+/volume contract, an alternative approved settlement partner, or a merchant payment mix that lawfully lowers blended cost. Show exact effective fees including all fixed/per-payout, chargeback, fraud, refund and risk expenses. Never advertise net savings based solely on one card example.

## Merchant UX
1. **Connect:** choose provider, link merchant-owned account via supported hosted onboarding. Never collect raw credentials, card PAN, CVC or banking secrets in Evercraft.
2. **Price:** import real statement fees with merchant permission, compare like-for-like (card-present vs card-not-present, volume, ticket, international, methods, payouts, monthly fees). Explain any unknowns. Obtain approved price terms before collecting fees.
3. **Sell:** one clear product/offer form, branded checkout, explicit consent, canonical order ID, idempotency key, authentic provider checkout, and separate authoritative paid receipt.
4. **Understand:** simple dashboard for gross sales, actual all-in cost, net received, pending, failures, refunds, chargebacks, fulfillment status and source attribution. Never confuse checkout-started with money settled.
5. **Grow:** merchant **opts in** to Systemia Opportunity Scout. The scout can review approved order/CRM/website data to find lost-lead follow-up, abandoned checkout, recurring-revenue, unfilled demand, seasonal opportunities and low-performing buyer paths. Present evidence, predicted uplift range and recommendation. No silent outreach, charge, advertising spend, customer data export or production mutation.
6. **Prove:** baseline approved in plain English before work; measured incremental sales or saved expense attributable to a specific action; remove ambiguous or unrelated growth from revenue-share calculations. If attribution cannot be explained simply, claim **zero** revenue share.
7. **Act:** merchant accepts scope, proposed price or share, permissions and cancelability before any action. Systemia admits and deduplicates missions. Passport/Execution Gate checks remain separate. Receipts capture who/what/when/why, alternatives, source evidence and rollback.

## Pricing experiments (unapproved)
- **Partner-revenue-share:** provider charges merchant directly at provider rates; Evercraft earns provider partner share if contractually eligible; no unsupported savings claim.
- **Managed value layer:** provider fees pass through transparently; Evercraft charges a separately disclosed bounded software/service fee in exchange for measurable merchant utility, with optional discounted effective rate where wholesale costs permit.
- **Wholesale/IC+ lane:** negotiate directly with qualified processors. Only after actual schedule, reserve, support, fraud and payout costs are verified should we propose a like-for-like lower effective merchant rate.
- **Incremental growth lane:** scoped service fee or agreed percentage of clearly attributable incremental outcomes, with merchant-consented source data and simple baseline.

## Release gates
- Provider permission, merchant-contract and money-transmission/PCI review before merchant money flow; current repo is an architecture proposal, not legal authorization.
- Exact owned first-party purchase-intent route; no default Base44 fallback, no checkout secrets in client-facing assets (see issue #971).
- Test-mode order -> idempotent checkout -> verified paid webhook/reconciliation -> entitlement -> Systemia Shipping; cancellation, failed/replayed webhooks, 3DS, refunds and disputes included.
- Real buyer-initiated purchase with independently confirmed settlement and delivered output before production revenue claims.
- No opt-in? No Systemia merchant scouting. No baseline/evidence? No revenue share. No approved communications? No outreach.
- Run read-only unit tests: `node --test tests/merchant-economics.test.mjs`.

Related: #1224, #1220, #971. Do not touch protected RIVET/AliEV commercial pathways.
