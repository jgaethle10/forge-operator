# Evercraft Payments | Provider-independent commerce

**Evercraft Payments owns the order. Providers only move funds.** Stripe is optional, never the default or a prerequisite. Raven Nexus governs API connections when an outside rail requires one.

```text
customer / agent / Evercraft product
                ↓
        Evercraft Payments
        owned quote + order + invoice ID
                ↓
  buyer selects an ENABLED payment rail
                ↓
┌───────────────────┬────────────────────────────────┐
│ Direct/manual     │ External financial rails       │
│ cash / check      │ eligible bank transfer, Zelle,  │
│                   │ PayPal/Venmo/Cash App business, │
│                   │ optional card processors       │
└───────────────────┴────────────────────────────────┘
                ↓
   verified receipt / reconciliation
                ↓
       entitlement and fulfillment
```

## Ownership

Evercraft owns order IDs, offer/price/currency, buyer consent, chosen rail, invoice/reference, payment-evidence lineage, verified settlement status, refunds/reversals as business records, product entitlement, and fulfillment decisions.

A merchant may collect direct cash or checks or use eligible business bank/app accounts where allowed by that rail's terms. This is **not** Evercraft operating a bank, a card network, an escrow service, or a payment institution. For electronic acceptance, third-party banks/payment providers remain necessary, but **no single provider is compulsory**.

## Initial source implementation

- `payment-routing.mjs` defaults to **no processor and no payment rail**, supports cash, check, bank transfer, Zelle business, PayPal business, Venmo business, Cash App business, and explicitly selected card processors. A payment rail is not advertised as ready without operator-verified merchant availability.
- `sovereign-order-ledger.mjs` creates private owner-only on-disk Evercraft orders with strong IDs and fixed-price cents; startup/reload does not need Stripe.
- Method selection only produces *instructions-ready* after the merchant confirms the rail is genuinely supported and the buyer consents. It never creates a payment.
- A buyer's screenshot, payment reference, email, or verbal claim enters *unverified claim* status only. No paid or fulfillment transition exists in the unconnected v1 source. This is intentional until a trusted internal reconciliation service authenticates posted bank credit, cleared check, authenticated business provider receipt, or witnessed cash payment.

## Required launch gates

1. Confirm which specific Evercraft-owned business bank account or business payment app accepts **commercial** payments. Zelle requires a bank offering Zelle to that business account; do not advertise it from a consumer-only enrollment. Provider costs and customer protections vary.
2. Configure merchant payment destinations **only in authenticated private Systemia**, never in GitHub or public machine catalog. Never take a payment destination from customer input.
3. Install the owner-only order store behind an authenticated first-party API and invoice/handoff UI. Add authorization, idempotence, durability/backups, buyer method confirmation, amounts, tax handling, and reconciliation before making public promises. The draft library alone is **not deployed**.
4. Bank/app/manual evidence must be verified by authenticated trusted processes and auditable operator reconciliation. Cash must be counted/receipted; a check needs clearance. Never mark an order paid from claimed transfer, screenshot, public callback, checkout redirect, or mere payment initiation.
5. Activate the entitlement and delivery only after independent authoritative settlement confirmation and accepted fulfillment criteria. Reversals and refunds must update economic history.
6. Give customers clear pricing, contact, invoice/payment reference and refund/terms information; respect each platform's business terms and applicable tax and recordkeeping duties.

## Coexistence / migration

Previously staged Stripe account identity and Raven Stripe bridge work can remain available as **optional** adapters. Do **not** ask the operator to create another Stripe key to unblock Evercraft. Historical October 2026 Stripe checkout canaries and manifests are snapshots, not claims of current payment readiness. Legacy HTTP 402 intake and draft PRs are separate from the sovereign order initiative.

Existing Fabric native storefront and payment return code may still reference Stripe-specific behavior; those paths must be audited, refactored and acceptance-tested before replacing production routing. Do not flip live customer-facing checkout on the basis of this README or unit tests.

## Security

No payment or bank details in public code, agent prompts, or URLs. Public order disclosure, money transmission and external provider access require their own scoped authentication. Direct provider checkout must never bypass Evercraft Payments. Local store files are ordinary private application records, not tamperproof regulatory ledgers or proof that funds cleared.
