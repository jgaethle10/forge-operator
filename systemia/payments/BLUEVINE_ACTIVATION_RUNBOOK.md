# Evercraft Payments | Bluevine-first cash register activation

**Status 2026-10-20:** Owner confirmed an Evercraft LLC Bluevine account exists. This is **founder-reported ownership**, not bank authentication, a saved bank account in Raven Nexus, an active merchant checkout, or evidence of received money. This repo must not carry bank details.

## Immediate manual collection (no new platform deployment)

1. Company officer signs in to Bluevine **directly** at https://app.bluevine.com/. In a verified session, inspect the **Sales → Invoices** section. If Sales is missing, Bluevine says the account may not be eligible; ask Bluevine support.
2. For a **specific approved customer and completed agreement**, issue an official Bluevine invoice with the exact offer scope, legal payee **Evercraft LLC**, price and canonical Evercraft order reference. Do not send speculative invoices or request payments without customer consent.
3. If Stripe payment processing is not enabled, Bluevine can create invoices, but **card/wallet/ACH debit payment links are not available** until the account administrator connects Stripe via Bluevine. A customer can separately initiate a standard ACH credit into eligible Bluevine Business Checking after receiving official approved payment instructions. Do not email or publish routing/account numbers from this repo.
4. Copy the opaque Bluevine invoice ID back into a private Evercraft Payments order record (use \`recordOfficialInvoiceCreation\` for the tracking state). Keep it **unpaid**.
5. Independently verify received funds in a trusted bank/provider statement. Ordinary incoming ACH or checks do *not* appear in Bluevine's Sales Transactions ledger, so do not rely on that view for all payment methods. Match transaction ID, date, currency, amount, business payee, invoice and order; prevent reuse across orders; account for ACH returns/reversals. Do not mark paid or release work from a screenshot, buyer callback, open checkout or invoice creation.

## Product-specific first paid test

Existing approved offer: \`systemia.website_audit_quick_win_49.v1\`, $49 USD. Create an Evercraft receivable only when a real buyer explicitly agrees. An existing buyer form returned **HTTP 402** during an independent external read at the time of this document update and must not be reused without retesting. No customer charge or payment has been performed as part of this PR.

## Future digital checkout

- Bluevine's card/wallet/ACH debit payment links **require connected Stripe** in the Bluevine Sales dashboard. Bluevine reports 2.9% + $0.60 for online cards/wallets and 1% for ACH debit; first payment and bank availability may take additional time.
- Keep Evercraft Payments as canonical order source, Raven Nexus for provider secrets and approved settlement adapters. Do not send customers to a generic direct Stripe checkout when an Evercraft canonical order exists.
- Add live provider webhook/readback and a unique settlement receipt before enabling paid fulfillment. Verify bank account ownership and exact payout destination *in the protected provider dashboard*, not here.
- Do not claim Zelle is supported by Bluevine. SoFi personal checking is excluded from Evercraft business settlement.

## Sources
- https://www.bluevine.com/faq
- https://www.bluevine.com/accept-payments/payment-links
- https://support.bluevine.com/s/article/Roles-and-Permissions-for-Accepting-Payments
- https://support.bluevine.com/s/article/How-do-I-use-the-Transactions-Dashboard

## Current blockers
- No authenticated Bluevine control available through the connected ChatGPT tools.
- No verified Bluevine invoice ID, real transfer, payee-facing payment link, bank readback or merchant setup.
- PR code and tests are not a production deployment; do not merge without review or assert checkout is fixed.
