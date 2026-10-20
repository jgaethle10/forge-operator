# Evercraft cash register: multi-rail recovery gate

Status: engineering preflight only. **Not a deployed checkout, banking connection, or payment acceptance claim.** This change does not hold customer funds, charge a bank account, or verify settlement. All offers continue to use Evercraft Payments as canonical order owner and Raven Nexus as the protected provider boundary.

## Collection rails and the truth boundary

| Buyer choice | Proposed adapter | Prerequisite |
| --- | --- | --- |
| Cards, Apple Pay, Google Pay, Cash App Pay | Stripe hosted checkout | Merchant approval, live checkout integration and current canary |
| PayPal, Venmo | PayPal Checkout | PayPal Business account, credentials, eligible method, current canary |
| ACH debit | Authorized ACH processor | Merchant agreement, payer authorization, mandated verification and return handling |
| ACH credit | Business bank instructions | Bank verifies receivability; payer uses an order reference |
| Zelle | Eligible business bank Zelle | Bank confirms business enrollment; owner approves destination |
| Cash App transfer | Cash App Business | Business account eligible; owner approves business destination |
| Venmo transfer | Eligible business receiving profile | Business profile and transfer allowance verified |

A bank routing number and account number identify an account; they do **not** create ACH debit authority, merchant acquiring, card acceptance, a public payment API, or automatic payment verification. Do not place bank or wallet credentials in source, GitHub issues, logs, or ChatGPT messages. Enter them only in the provider's secure dashboard or Raven Nexus secret store.

## Implementation sequence

1. Preserve existing 13 offers and order IDs. Do not rewrite known URLs or touch a working production payment route.
2. Choose one low-risk $49 Website Audit order and confirm its actual fulfillment path. No new $149 listing until price approval.
3. Connect a verified business settlement destination through bank / provider onboarding, and record only opaque references in Raven Nexus.
4. Integrate a hosted provider checkout first. Use amount-in-cents, approved fixed price, order idempotency, a signed redirect, and a server-verified provider receipt.
5. Add PayPal/Venmo and ACH adapters only after matching approved merchant credentials and real current canary probes. Offer a manual transfer option only after account/business eligibility and bank destination instructions are owner-approved.
6. Reconcile all manual transfers via authoritative bank/provider records. Screenshots, customer-claimed payment, browser redirects or generated checkout sessions **never** unlock entitlement or fulfillment.
7. Independently test sandbox non-charging flow, a founder-authorized low-value real transaction, refund/return, duplicate webhook, duplicate customer click, and cash receipt reconciliation. No live charge without buyer authorization.
8. Only after an actual provider-paid receipt and Evercraft order/Shipping match may paid fulfillment be asserted. Current provider auth, actual deposit, payout timing, and platform deployment are still unverified.

## Module boundary

`multi-rail-preflight.mjs` is pure deterministic route preparation; it takes already-authorized server-side probe data and returns only a proposed handoff eligibility state. It cannot create a hosted payment, display unapproved bank details, mark an order paid or trigger Shipping. The merchant credential and reconciliation integrations remain required server work. Test with:

```sh
node --test systemia/payments/multi-rail-preflight.test.mjs
```

## Bank-specific receiving plan (verified documentation, 2026-10-20)

**Bluevine / primary:** Bluevine Business Checking can receive customer ACH credits, has an invoicing service without Stripe, and offers processor-powered card/wallet/ACH-debit links after an eligible Stripe connection. Bluevine expressly states that Zelle is *not* available. Cash App and Venmo can connect as third-party services, but that does not make them native Bluevine checkout methods.
- Sources: https://www.bluevine.com/faq ; https://www.bluevine.com/accept-payments/payment-links ; https://support.bluevine.com/s/article/How-do-I-manage-Invoices

**HAPO / secondary:** HAPO Commercial Checking publicly lists ACH origination and merchant services. Verify that Evercraft owns an actual *commercial* checking account and that it can receive the intended inbound transfer before activation. Business Zelle receiving is unverified. Do not use an individual's HAPO checking or savings for merchant receipts without explicit bank confirmation.
- Sources: https://www.hapo.org/business/accounts/checking-accounts ; https://www.hapo.org/business/resources/merchant-services

**SoFi / consumer, not Evercraft merchant:** SoFi checking supports consumer Zelle, but SoFi does not currently offer business checking or savings accounts. Do not make it an Evercraft settlement destination.
- Sources: https://support.sofi.com/hc/en-us/articles/4423451888909-What-personal-information-do-I-need-to-be-eligible-to-open-SoFi-Checking-and-Savings-accounts ; https://www.sofi.com/banking/zelle-faq/how-do-i-use-zelle/

### Implementation guardrails
- `bank-destination-policy.mjs` enforces Bluevine Business Checking or verified HAPO Commercial Checking for ACH credit, and bans Bluevine/SoFi Zelle merchant routing.
- HAPO business Zelle may only be enabled following a fresh *bank-verified* business enrollment and service check.
- The current user has named three financial institutions, **not** provided evidence that their particular accounts are business registered, merchant approved or integrated. All actual attempts stay blocked without the server-side bank evidence.
- Do not expose account or routing numbers in source, analytics, email or customer-visible materials unless the owner deliberately approves official invoice instructions in a secure system.
- Keep bank destinations separate from actual payment methods. Money must not count as received or unlock delivery without bank/provider verification.
