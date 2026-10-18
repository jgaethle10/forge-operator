# Evercraft Fabric | Replicate the working buyer pipeline across the portfolio

**Date:** October 17, 2026. **PR:** https://github.com/jgaethle10/forge-operator/pull/1374  
**Direction:** The founder personally checked the working buyer journey through the Stripe-hosted checkout. Preserve and replicate that established handoff. Do not start a second payments architecture or cite an older source audit as proof the founder's observed path is broken.

## The reusable route

**Discovery / product page → exact scoped offer and price → contact/needed inputs → explicit human checkout decision → Evercraft Payments central order and Raven Nexus provider adapter → Stripe-hosted checkout.**

Everything after opening Stripe still requires a real and separate receipt for provider-paid status, entitlement and delivery. No money was charged to establish this PR.

The owned Fabric offers page already has generic fixed-offer rendering with buyer email and price. The existing transitional buyer-door directory has 13 explicit offers whose form/checkout redirect to Stripe was demonstrated in previous synthetic probes and whose actual checkout page was inspected by the founder. The sensible next action is to connect every exact matching product to that already working pipeline, not to replace the payment backend.

## Thirteen approved offer continuations

The code-generated rollout matrix is authoritative for current source coverage and exact cents/keys. All these are existing fixed-price human entries, NOT new prices or new charge permissions.

| Product | Current offer price | Native Fabric offer | Agent-level product mapping |
| --- | ---: | --- | --- |
| Website Quick Win Audit | $49 | `/offers/website-audit` | Existing exact mapping |
| Workflow X-Ray | $250 | `/offers/workflow-xray` | **Next-release exact mapping staged**, awaiting deployed MCP canary |
| Browser Workflow Diagnosis | $149 | `/offers/browser-diagnosis` | Hold: specialist contract not explicitly paired |
| Evercraft Payments Founding Integration | $750 | `/offers/payments-pilot` | Hold: exact merchant/authorization contract not paired |
| FindMyPart Quick Hunt | $19 | `/offers/part-quick` | Existing exact FindMyPart mapping |
| FindMyPart Deep Hunt | $49 | `/offers/part-deep` | Existing exact FindMyPart mapping |
| FindMyPart Rescue Hunt | $99 | `/offers/part-rescue` | Existing exact FindMyPart mapping |
| Legacy Software X-Ray | $250 | `/offers/legacy-xray` | Hold: this is not the $299 Legacy Rescue Scan |
| IBM i 7.4 Upgrade X-Ray | $250 | `/offers/ibmi-xray` | Hold: this is not the IBM i Estate X-Ray |
| Site-Survive Rapid Audit | $250 | `/offers/site-survive` | Existing exact mapping |
| Evercraft Sign Founding Pilot | $250 | `/offers/sign-pilot` | Hold: identity/consent and handoff review |
| TOWI Rapid Evidence Scan | $750 | `/offers/towi-evidence` | Hold: research capability currently lacks verified fixed pricing |
| EventWave Single Event Boost | $49 | `/offers/event-boost` | Existing exact EventWave mapping |

**Important:** `/offers/<slug>` shows the approved **source-defined native Fabric entry**. A source URL in a GitHub branch is not a new production deployment receipt. Keep the existing buyer doors operational until the new owned route has a verified live canary. Never redirect blindly to an unrelated or unavailable URL.

## Required product-onboarding template

Each additional portfolio product needs one approved SKU and stable `offer_key`, exact fixed cents/currency, a product-specific input contract and deliverable, a scope/terms and refund rule, the known Evercraft Payments confirmation boundary, a test against the existing central checkout adapter and, after provider verification, its own fulfillment entitlement and shipping receipt. This is an **onboarding template**, not authorization to invent prices, create customer orders, sell legal/regulated services outside their gates or advertise unavailable features.

For each product, separately record:

1. **Offer/source parity:** public description, actual capability, fixed price, approved offer key, eligible customer and mandatory intake inputs.
2. **Checkout parity:** an independent GET to the exact offer page; human consent/email; successful approved provider handoff without placing a charge.
3. **Payment truth:** Stripe checkout reached is not `paid`; payment status only follows provider evidence and canonical order reconciliation.
4. **Delivery truth:** correct specialist admits a real job with Systemia, authorized inputs, output, recipient access and refund/dispute policy.
5. **Production release:** Systemia independent admission, code/CI/edge release receipt, rollback and no interruption of any currently functioning route.

## Implementation and review state

- `systemia/commerce/portfolio-checkout-rollout.mjs`: deterministic reconciliation of the 13 existing buyer doors with native checkout contracts and candidate product mappings.
- `systemia/commerce/portfolio-human-buyer-handoffs-next.json`: proposed expansion from 4 live-mapped capabilities/6 buyer options to 5/7, without altering currently deployed Fabric’s 4/6 protocol.
- `tests/portfolio-checkout-rollout.test.mjs`: tamper, duplicate, false receipt, price drift and wrong-product rejection.
- `Fabric Portfolio Checkout Rollout` GitHub CI: code validation only; no production rollout, actual new payment or provider settlement.
- The six unmapped approved offers are **not blocked from their existing human offer pages**. Their held state is only an explicit AI capability-to-product match, which must not guess based on similar names or equal prices.

Next highest leverage: admit candidate under existing Systemia distribution mission, deploy the scoped read-only Workflow X-Ray mapping after independent review, then verify external agent gets the exact $250 human link. In parallel, review the six unmatched specialist definitions and exact authorized SKU contracts. Stage any approved matches as a subsequent small release; preserve real checkout and payment receipt gates.

No promotional outreach, public deploy, secrets, payment captures or delivery claims authorized by this document.
