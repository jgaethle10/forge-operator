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
