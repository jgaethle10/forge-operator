# Evercraft Payments | Provider-independent merchant operating system
**Proposal and pilot policy, 2026-10-14. Not production payment authorization, licensed processing, merchant onboarding, or an approved merchant price.**

## Product
Evercraft Payments should be the easiest place for a merchant to **accept money, understand money, save money, and find more money**. We own the **merchant experience**, canonical PaymentOrder/offer/terms/entitlement/refund/fulfillment records, statement reconciliation, integration APIs, checkout UX, and opt-in Systemia business-growth intelligence. Raven Nexus governs external payment adapters, credentials, eligibility and provider connections. A regulated partner performs acquiring, money movement and settlement. Stripe is one possible adapter, not our product identity.

## Architecture
| Layer | What Evercraft owns | What must be independently approved |
| --- | --- | --- |
| Merchant home | Responsive setup, invoices, pay links, subscriptions, support, reporting, SDK/CLI | Accurate merchant offers and permissions |
| Order control | Canonical PaymentOrder, idempotency, buyer confirmation, trace IDs, state machine | No fulfillment from redirect alone |
| Raven Nexus provider abstraction | Adapter contracts, allowlists, auditable routing recommendations, secret isolation | Merchant's signed terms, underwriting/KYC, active rail, credentials, provider health |
| Settlement evidence | Webhook validation, reconciliation, pending/paid/refunded/disputed views | Verified processor and bank evidence, never implied custody |
| Systemia Growth Scout | Permissioned opportunity audit, incremental revenue proof, straightforward baseline, scoped implementation | Opt-in, attribution, consent, Systemia admission, separate action gate |
| Fabric economy | Developer APIs, merchant integrations, rewards/referrals and partner discovery | Signed merchant permission before sharing or outreach |

## Real provider alternatives to explore
The new planner records **research candidates only**, not real connections: Stripe/Connect (card and bank payment paths; https://stripe.com/connect/pricing); Moov (card/ACH plus additional account capabilities with underwriting; https://docs.moov.io/guides/accounts/capabilities/reference/); Finix (merchant identity/onboarding and approved processing; https://docs.finix.com/guides/platform-payments/onboarding-sellers/seller-onboarding-via-api); Adyen for Platforms (merchant onboarding, split settlements and payouts under approved contract; https://docs.adyen.com/marketplaces).

This is an **adapters-first** business, not an unlicensed new card network or bank. No provider can be invoked or represented as connected from its documentation. The owner of the money movement is the contractually authorized provider. Card processing still incurs network/interchange costs, regardless of branding. The engineering pilot starts US/USD; cross-border claims remain held.

## Winning on true value
Do not promise blanket 2.4% or 'cheaper than Stripe'. Stripe's published standard US online domestic card price is 2.9% + 30 cents; platform/Connect pricing can include extra monthly active-account and payout costs depending on the model. Savings may arise from independently negotiated provider economics, interchange-plus, customer-consented ACH/bank pay, better conversion, fewer failed payments, faster invoices, less administration, or lower total cost of ownership. Merchant pricing must state all per-transaction, per-payout, monthly, fraud, chargeback, reserve and method costs. No fee published before a signed provider rate sheet and a merchant contract.

## Merchant journey
1. **Join:** easy-to-understand fee comparison and hosted, licensed-provider onboarding (no raw card or banking secrets in Evercraft).
2. **Accept:** one easy branded checkout, invoice, pay link, or subscription. Exact offer/price, buyer consent and idempotent order required. Choose only a merchant-approved method and partner.
3. **Understand:** show gross, net, fees, payouts, failed payments, pending, refunds and disputes. No synthetic sales. Unknown is not zero.
4. **Grow (opt-in):** Systemia reads specifically permitted invoice/booking/payment/CRM data and identifies revenue leakage or new opportunities, such as missed follow-ups, deposits, recurring maintenance plans, abandoned carts and complementary merchant capabilities.
5. **Approve:** merchant reviews opportunity, projected range, downside, sources, simple measurement baseline, terms and allowed actions. No unsolicited messages, spending, CRM edits or production change without separate authorization.
6. **Prove:** only merchant-understandable **observed incremental improvement** with agreed terms and independent receipts is eligible even for revenue-share review. Forecasts alone create no fee. Ambiguous uplift means $0 Evercraft share.
7. **Connect:** merchants who opt in can list their capabilities in Fabric, find partnerships and offer consented rewards, referrals or APIs. Merchant/customer data does not move between businesses by default.

## Current engineering state
- Chromebook remains public Fabric; HP NextGen is independently tested on local 51-capability MCP and user-systemd/Windows keeper. **No public cutover.**
- Source catalog lists 13 bounded Evercraft Payments offer records in `public/.well-known/evercraft-payments-buyer-doors.json` dated 2026-10-14, with `buyer_url:null` and no observed paid receipts. Provider-hosted FindMyPart source handles the legacy buyer form; this is not owned payment ingress proof.
- Owned purchase route still has the tracked #971 gate. #1220 and #1224 control admissible payments-to-fulfillment work.
- `systemia/payments/merchant-economics.mjs` is an advisory total-cost model; it never quotes/charges a customer.
- `systemia/payments/multi-provider-route-plan.mjs` ranks **only** merchant-consented US/USD, currently approved method/provider connections with unexpired evidence-backed fee quotes; output never contains an executable selection or payment authorization.
- Unit tests: `node --test tests/merchant-economics.test.mjs tests/multi-provider-route-plan.test.mjs`.

## P0 -> P2 gates
**P0** one authentic first-party owned merchant offer: visible correct page -> human consent -> Evercraft canonical order -> Raven Nexus chosen provider -> test checkout -> webhook verification -> idempotent entitlement -> Systemia Shipping and delivery; refunds, failed, duplicate and replay events tested. Prove live order with genuine authorized external buyer before revenue claims. No automatic settlement or outreach.

**P1** merchant dashboard, statement-import evidence, consent/identity-permission UX, and opt-in Systemia Opportunity Scout on test data, then one approved design partner. Evaluate a second processor in sandbox after partner acceptance/underwriting and actual price schedule.

**P2** provider selection, negotiated pricing (not speculative undercut), merchant-facing SDK/CLI, rewards/distribution and broader rails/geographies only after regulatory, sponsor-bank, PCI, privacy and payment-network review. Don't assert bank/deposit/FDIC/money transmitter exemption without specialized counsel; context-specific FinCEN processor guidance: https://www.fincen.gov/resources/statutes-regulations/administrative-rulings/whether-authorized-agent-receipt-utility

**No default provider lock-in. No forced migration. No fake savings. No fund custody assumptions.**