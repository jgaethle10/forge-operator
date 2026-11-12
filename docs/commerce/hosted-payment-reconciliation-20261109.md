# Evercraft Payments | Systemia Existing Stripe Link Settlement Bridge
**Date:** 2026-11-09. **State:** SOURCE CANDIDATE, not deployed or attached to an authorized live Stripe account.

## Mission
Make our seven **already working** Systemia Stripe-hosted Payment Links report authoritative payment outcomes into the canonical Evercraft Payments ledger without disturbing those customer checkout URLs.

Do not rebuild a Payment Link, check HTTP 200 again, invent orders from page views, or substitute one offer for another.

## Components
- `systemia/payments/hosted-link-settlement-bridge.mjs`: exact-merchant, exact-SKU reviewer; requires Stripe session, line item, succeeded PaymentIntent, captured paid Charge, refund/dispute state and private account pin before reporting any paid receipt.
- `systemia/raven/stripe-hosted-receipt-reader.mjs`: GET-only Stripe REST adapter candidate; accepts a private owner-authorized live or restricted-live credential. Calls Stripe `/v1/account`, lists Checkout Sessions by exact `payment_link`, refetches sessions/line items/intents/charges. No mutation API.
- `scripts/evercraft-payments-hosted-import.mjs`: offline/no-op by default; optional `--scan` dry-run and double-gated `--scan --commit` private receipt writing.
- `systemia/payments/hosted-fulfillment-review.mjs` and `scripts/evercraft-payments-review-queue.mjs`: **private, non-executing Systemia review proposal** generator. Regenerates a review snapshot from the existing private payment journal. Enforces source-account/offer/order identity and preserves refund/dispute holds. No PII, customer messages, entitlement issuance, shipping jobs, agent dispatch or automatic scope approval.
- `systemia/payments/hosted-relay-review.mjs` and `scripts/evercraft-payments-relay-review.mjs`: prepare deduplicated, **owner-only** operational alert intents for the **existing Systemia Notification Fabric / Evercraft Relay**. Payment review is normal priority; reversal review is high, never safety-critical. No buyer contact details in alerts. The CLI is offline by default and `--plan` only reads the private journal. `--send` requires `EVERCRAFT_PAYMENTS_RELAY_SEND_APPROVED=yes`, a separately specified private owner principal and live Relay service credentials. The send path has NOT been invoked in this engineering session and Relay delivery is not attested.
- `tests/hosted-link-settlement-bridge.test.mjs`, `tests/stripe-hosted-receipt-reader.test.mjs`: synthetic provider tests, no real Stripe calls.
- `.github/workflows/evercraft-payments-hosted-settlement.yml`: isolated acceptance tests, no payment-provider credentials.

## Exact account and offer binding
The authoritative seven-link IDs, Stripe product IDs, price IDs, names and amounts are read **as data** from `public/mesh/checkout-ready/verified-links.json`. The import requires a separately, privately approved exact Stripe `acct_...` merchant account ID. A mere account name of "Systemia" is not sufficient.

For each retrieved Checkout Session, the reconciling adapter refetches exact session, its one line item, PaymentIntent and latest charge. The import rejects:
- wrong merchant account, Payment Link, product, price, quantity, amount or currency
- incomplete or unpaid checkout, test-mode event in live settlement
- an unconfirmed intent or unverified uncaptured charge
- missing refund/dispute state, partial pagination coverage, or malformed provider responses

An exact verified paid, unreversed order produces a **private** `paid_pending_review` record with no buyer contact details. If a charge is refunded or disputed, the order moves to `reversal_review_hold`, and the journal will never automatically move it back to `paid_pending_review`.

The private journal is append-only and single-writer locked. Repeat scans don't create duplicate paid receipts. It never triggers shipping, emails, entitlements or work execution; these remain separately gated by customer scope, capacity and consent.

## Safe NextGen validation: no Stripe access, no payments
Run in a detached worktree for this PR:
```sh
node --test tests/hosted-link-settlement-bridge.test.mjs tests/stripe-hosted-receipt-reader.test.mjs
node scripts/evercraft-payments-hosted-import.mjs
node scripts/evercraft-payments-review-queue.mjs
```
Without flags, the CLI reports `held_no_provider_reads_attempted` and makes **zero** network calls.

## Account access and operator-only actions (NOT executed in this development session)
Stripe connector account access was not approved during this session. No live reads, charges, payouts, receipts, revenue or customer records were inspected or changed.

On an authorized, private Evercraft-owned runtime **after explicit owner permission**, use `--scan` with `STRIPE_SECRET_KEY` and `EVERCRAFT_APPROVED_STRIPE_ACCOUNT_ID` in its secret environment. It performs Stripe GET-only dry-run. Do not paste credentials, customer PII, or full Stripe API responses into ChatGPT, GitHub issues, or Git.

`--scan --commit` additionally requires `EVERCRAFT_SETTLEMENT_IMPORT_APPROVED=yes` and creates review-only receipt records under a private local directory. It is **not authorized** for live execution merely because this PR exists.

## Release blockers
1. Owner-authorized Stripe account selection, legal merchant, permission scope and payout identity verified privately. Check actual paid/unpaid/refunded/disputed sessions and completeness; never claim zero sales from absent internal records.
2. Private Raven Nexus service deployment with secrets off Git, service-level authenticated access, rotation, tests, account pin, durable ledger backup/restore and signed receipts.
3. Reversal/dispute reconciliation beyond the current state snapshot, event replay, payout/fee accounting, and operational operator alerts.
4. Systemia order proposal, owner-only notification and customer-consented scoped fulfillment handoff with evidence. Current code only records the private review state.
5. Independent read acceptance on an operator-authorized account, unit/integration tests, signed Yard deployment receipt and rollback. Do not mutate or replace existing working Stripe Payment Links.

**Definition of success:** A real existing hosted-link purchase is recognized via its provider-backed session and exact SKU, becomes one Evercraft Payments order in `paid_pending_review`, and stays locked until the responsible operator approves fulfillment. A reversed order is held and surfaced for review. Payout settlement remains a separate verified state.

Related: `audits/EVERCRAFT_PAYMENTS_STRIPE_RELATIONSHIP_AUDIT_2026-11-05.md` on PR #1896.
