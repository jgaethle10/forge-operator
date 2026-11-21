# Evercraft Payments | Own-bank ACH Credit Request Links (v1 source candidate)
Date: November 9, 2026

## Purpose
Evercraft should own every customer payment-request URL, accepted quote,
product/service identity, invoice reference and payment state. Stripe-hosted
links remain valid for their seven already verified original SKUs; bank credit
is an **optional additional settlement method**, not an automatic substitute
for every existing commercial service.

The first banking method is **buyer-initiated ACH credit** into a verified
Evercraft business account. Customer opens an Evercraft-owned request page,
reviews the agreed offer/amount, then instructs their own bank to initiate the
credit. Evercraft does **not** collect buyer bank logins or originate debits.

This is not an instant bank checkout button. ACH payments depend on the
customer's bank and the receiving bank; a bank (or authorized bank provider)
is still required to actually move money.

## Implemented in source
- Private, loopback-only Node runtime: systemia/payments/bank-credit-request-runtime.mjs.
- Authenticated operator API POST /v1/operator/bank-requests, consuming an
  OWNER-APPROVED, exact-price allowlisted product. The client cannot invent or
  override the price.
- Approvals required before issuing link: scope_approved, capacity_approved,
  buyer_confirmed. The operator owns those confirmations and must retain
  private signed contracts/approvals in the normal Systemia ledger.
- Stable, idempotent request ID with 256-bit HMAC authenticated bearer link:
  /pay/bank/bpr_<opaque-id>.<mac>. Existing matching requests are reused;
  different offer + same idempotency key is rejected.
- Durable, private file-backed request records (0700 directory, 0600 files).
  No account/routing details are written to the order record.
- Bank instructions exist ONLY in a private runtime configuration and can
  appear only through a valid unexpired link, never in GitHub Pages/README,
  public discovery JSON, GitHub logs, or a recipient-less public catalog.
- Returns the exact approved amount, recipient business, receiving bank,
  ACH routing number, receiving account number and unique transfer reference.
- All buyer views are noindex/no-store/no-referrer and use restrictive CSP.
- The request expires after 7 days; an expired URL is no longer a valid
  customer instruction. This is a link expiry, not expiration of funds.
- The only stored economic state is awaiting_bank_transfer. No code in this
  runtime marks paid, triggers fulfillment, initiates ACH/wire, or creates
  Stripe charges. A buyer screenshot is not bank-cleared evidence.
- Tests assert replay safety, authorization, missing bank configuration,
  amount mismatch, host restriction, escaping, absence of charge calls and
  fulfillment lock.

## Private bank reconciliation workbench (source added November 11)

- The original bank-credit request now carries a private, deterministic, **HMAC-keyed receiving-account fingerprint** in its order record; no routing or account number is stored there or returned by the operator JSON response. A bank-account rotation rejects old link views and idempotent replays rather than silently redirecting buyers to a different beneficiary.
- `systemia/payments/bank-credit-reconciliation.mjs` accepts *private, read-only* statement observations for a bank-credit candidate match. It checks: one unique request ID, exact transfer reference, one nonduplicated bank transaction ID, bank-posted credit direction/status, exact USD amount, and the receiving-account fingerprint.
- It flags wrong account, partial/overpayments, missing or extra references, pending/debit transactions and duplicate/multiple credits for manual investigation.
- **No uploaded or caller-supplied bank statement is treated as authentic.** Its output is `RECONCILIATION_CANDIDATE`, not `paid`. The statement has to be retrieved independently from the authorized merchant's bank or authenticated bank integration and reviewed under a separate approval gate before order settlement and Shipping fulfillment can change state.
- The workbench does not store bank transactions, transmit funds, ingest bank credentials, change orders, send invoices or publish sensitive data. A private, authenticated POST `/v1/operator/bank-credit/reconcile` endpoint accepts specific existing request IDs plus merchant-bank observations and computes a diagnostic match report without modifying payment state. The endpoint must never be exposed through the public ingress.
- `tests/bank-credit-reconciliation.test.mjs` verifies duplicate, missing, ambiguous, wrong account, wrong amount, unsupported evidence and fulfillment-locked outcomes, alongside account-rotation tests on the request server.
- Merchant-bank posting date may be later than link expiry; the link expiry only prevents new instructions, not accounting review of funds already transferred.

## Public-only payment gateway (November 15, 2026)

The new systemia/payments/bank-credit-public-gateway.mjs puts a separate,
strict loopback listener between customers and the private order runtime.
The public listener forwards **GET/HEAD only** for exact signed
/pay/bank/bpr_<opaque>.<signature> paths. It blocks /v1/operator/*,
other GET routes, POST, query strings and redirects. Unavailable upstreams
fail closed without leaking operator details.

When configured, the runner opens two local listeners:

- **127.0.0.1:8795 PRIVATE:** operator API and bank order storage.
  Never reverse proxy this service to the internet.
- **127.0.0.1:8796 PUBLIC-ONLY:** signed read-only buyer pages.
  This is the ONLY listener eligible for public reverse proxy.

The two ports may be overridden by EVERCRAFT_BANK_CREDIT_LOOPBACK_PORT and
EVERCRAFT_BANK_CREDIT_PUBLIC_LOOPBACK_PORT. The runner rejects held bank
configuration, missing approved offers and missing receiving-bank
confirmation before starting the public gateway.

Example Caddy fragment for an *already verified* owned HTTPS site,
subject to operator review, not automatically deployed:

```caddyfile
# Inside the existing site block. Preserve all unrelated site routes.
# handle preserves the /pay/bank/ path. handle_path would strip it.
handle /pay/bank/* {
  reverse_proxy 127.0.0.1:8796
}
# Never reverse_proxy public traffic to 127.0.0.1:8795.
```

Before exposure, inspect active Caddy routing for conflicting catchalls.
Verify that external GET /health, POST /v1/operator/bank-requests and
POST /v1/operator/bank-credit/reconcile cannot reach the private API.
Check no-store/noindex/no-referrer headers and exact approved service
terms on a test buyer page. Never paste a live bearer payment link into
GitHub, logs or a public test. A reachable buyer page does not prove payment.

## Deployment prerequisites (NOT complete in PR)
1. Confirm Evercraft's *own* receiving business account can accept domestic
   ACH credit transfers, including the actual beneficiary name, routing number,
   account number, account type, limits and reference support. If the bank can
   provide an alias or segregated receivables account, prefer it over exposing
   the operating account number.
2. Approve a first exact-priced offer with a real delivery capacity/date,
   bank-transfer and refund terms, and buyer scope acceptance. Bank-specific
   fees and return timing must be disclosed accurately.
3. Create a PRIVATE server configuration on Evercraft-owned Node001/Node002
   (mode 0600, outside source/web roots and backups with public exposure)
   containing the keys below. Generate independent 32+ byte secrets using
   an approved secrets manager; no keys or actual bank numbers in Git.
4. Configure an actual owned public HTTPS reverse proxy for the URL path,
   forwarding GET/HEAD /pay/bank/* only to 127.0.0.1:8796. Keep the
   operator runtime 127.0.0.1:8795 private and never public-proxied. TLS, rate
   limiting, access log redaction and deployment rollback must be verified.
5. Use the private configured publicOrigin. Deploy only after independent
   endpoint canary proves the real browser page shows EXACT amount, bank
   beneficiary, reference, expiry and no spoofable paid outcome.
6. Run a buyer-authorized small bank-credit transfer and independently
   match the **bank statement** transaction id, credited amount, beneficiary,
   receipt/reference and posting date to the Evercraft Payments order. Until
   the bank actually confirms receipt, status stays unpaid.
7. Connect the separately tested statement-matching workbench to a verified, permissioned merchant-bank data source and human review protocol. This PR produces candidates only; canonical paid status, return/refund/chargeback handling, and Shipping fulfillment release are still separate unimplemented gates.
8. Bank provider/API-enabled customer-approved Pay-by-Bank, RTP/FedNow Request
   for Payment, and supported business Zelle may follow after bank
   eligibility and integration approval. Do not advertise instant payment
   or use a third-party host without owner authorization.

## Deployment preflight and signed-link revocation (November 15)

The bank-credit rail has an explicit, **read-only release preflight**:

```bash
export EVERCRAFT_BANK_CREDIT_PRIVATE_CONFIG="$HOME/.local/share/evercraft/private-payments/bank-credit-private.json"
export EVERCRAFT_BANK_CREDIT_PRIVATE_STATE="$HOME/.local/share/evercraft/private-payments/orders"
node systemia/payments/bank-credit-preflight.mjs
```

The diagnostic prints only booleans and named holds, never merchant
routing/account numbers, operator tokens or HMAC signing keys. It requires a
private non-symlinked 0600 config outside the repository, private 0700 order
storage, two distinct strong tokens, an approved bank configuration and
at least one exact-priced authorized offer.

A green preflight means `LOCAL_STAGING_ONLY`, **not** that the bank has
independently verified the account, the public route is ready, money arrived,
or the service is commercially released. A held preflight exits nonzero.

An authorized operator can revoke a particular bank-payment instruction
using the PRIVATE local operator API. Example request body:

```json
{"request_id":"bpr_<opaque-request-id>","reason":"buyer_cancelled"}
```

`POST /v1/operator/bank-requests/revoke` requires the existing private
operator bearer token. Allowed reasons are `buyer_cancelled`,
`suspected_link_compromise`, `incorrect_terms`, `merchant_hold`.
The first revocation is immutable, marked in private 0600 storage, and
blocks the signed buyer link (HTTP 410) and future idempotent re-issuance.
The public-only gateway never exposes this route.

**Revocation cannot stop a bank transfer a buyer has already initiated.**
Bank deposits, returns, refunds, partial amounts and support inquiries must
still be handled through independently verified merchant-bank records.
Never delete the original order as a substitute for reconciliation.

## Safe first-party setup

The source now includes a secrets-only bootstrap for Node001/Node002. It
generates independent cryptographic keys **locally**, never prints them, never
prompts for bank numbers, and creates an exclusive 0600 configuration in a
0700 private directory outside the Git repository.

```bash
cd ~/forge-operator
node systemia/payments/bank-credit-bootstrap.mjs \
  "$HOME/.local/share/evercraft/private-payments/bank-credit-private.json"
```

The bootstrap intentionally leaves the state
`HELD_BANK_CONFIRMATION_REQUIRED`, with no bank account and no approved offers.
**It cannot process or issue a buyer link.** After independently confirming
Evercraft's eligible business receiving bank information, an authorized
operator edits this file on the local computer, adds the bank payee and
owner-approved exact-priced offers, and changes
`current_state` to `BANK_ACCOUNT_AND_TERMS_APPROVED`. Never share the
bank account or secrets in chat, GitHub, logs, social media or public files.

The runner refuses to start without the private approved-state schema,
0600 file permissions, a nonsymlink config path and verified local runtime
bank/offer configuration. A runtime starting is not a payment settlement or
public deployment acceptance.

## Private configuration contract (schema illustration; NOT live values)
All tokens and banking details below are placeholders and must NOT be copied
into the repository or pasted into a public chat.

{
  "schema": "evercraft.payments.bank-credit-private-config.v1",
  "current_state": "HELD_BANK_CONFIRMATION_REQUIRED",
  "operator_token": "<private cryptographically random 32+ byte value>",
  "link_signing_key": "<different private cryptographically random 32+ byte value>",
  "approved_offers": [{
    "offer_key": "evercraft.example.work_250.v1",
    "product_key": "evercraft.example",
    "name": "Scoped example service",
    "amount_cents": 25000,
    "currency": "usd",
    "owner_approved": true
  }],
  "bank_payee": {
    "receiving_account_confirmed": false,
    "bank_confirmation_ref": "<private receiving-bank confirmation reference>",
    "legal_name": "<verified legal account holder>",
    "bank_name": "<actual receiving bank>",
    "routing_number": "<verified 9-digit ACH routing number>",
    "account_number": "<verified account number>",
    "account_type": "business_checking"
  }
}

Set receiving_account_confirmed=true only after verified bank authority and
configuration; the program cannot itself validate account ownership.

Set environment:
- EVERCRAFT_BANK_CREDIT_PRIVATE_CONFIG=/path/to/private/0600-config.json
- EVERCRAFT_BANK_CREDIT_PRIVATE_STATE=/path/to/private/order-state
- EVERCRAFT_BANK_CREDIT_LOOPBACK_PORT=8795
- EVERCRAFT_BANK_CREDIT_PUBLIC_LOOPBACK_PORT=8796
- EVERCRAFT_BANK_CREDIT_PUBLIC_ORIGIN=https://fabric.systemiacommandcenters.com

Start with:
  node systemia/payments/bank-credit-request-runner.mjs

The operator API takes JSON:
{
 "offer_key":"evercraft.example.work_250.v1",
 "idempotency_key":"merchant-private-confirmed-order-20261109-001",
 "scope_approved":true,
 "capacity_approved":true,
 "buyer_confirmed":true
}

The response returns payment_request_url, reference, exact amount,
state=awaiting_bank_transfer, paid_verified=false and
fulfillment_release=false.

Private operator bank reconciliation diagnostic (no paid-status write):

POST /v1/operator/bank-credit/reconcile
Authorization: Bearer <same private operator token>

{
 "request_ids":["bpr_<private existing request ID>"],
 "observations":[{
   "source_type":"merchant_bank_statement_observation",
   "bank_transaction_id":"<private bank's posted transaction reference>",
   "receiving_account_key":"<internal HMAC destination fingerprint from order record>",
   "amount_cents":25000,
   "currency":"usd",
   "direction":"credit",
   "bank_status":"posted",
   "posted_at":"2026-11-11T16:00:00Z",
   "memo":"EC-<exact transfer reference>"
 }]
}

The returned report is an **untrusted-source match candidate**, never a
bank-verified payment. Keep this API on the operator side, not publicly
reverse-proxied. Read bank records from the authorized merchant account,
then apply a separate verified economic-event and fulfillment gate.

## Bluevine receiving-account option (verified public documentation November 15)

Bluevine publicly confirms that eligible Business Checking accounts can
receive ACH/wire deposits and direct customer payments. It also permits
business invoices without Stripe, with the customer instructed separately
how to pay. This is consistent with Evercraft's proposed **buyer-initiated
bank-credit** instructions. It does not prove that Evercraft's specific bank
account, payee identity, invoice permissions or inbound deposit monitoring
have been verified.

**Important:** Bluevine's hosted online card, wallet and ACH *direct debit*
payment links require a Stripe account connection. A Bluevine invoice without
Stripe is therefore NOT an online pay-now button. Bluevine also says Zelle
is not currently supported. Do not promise Stripe-free Bluevine pay-now,
instant funds, Zelle or automatic Bluevine bank notifications.

- Official invoicing FAQ: https://www.bluevine.com/accept-payments/invoicing
- Official June 2, 2026 ACH deposit instructions: https://support.bluevine.com/s/article/How-do-I-transfer-money
- Official June 2, 2026 receive-account guidance: https://support.bluevine.com/s/article/How-do-I-set-up-direct-deposits
- Official Bluevine acceptance roles: https://support.bluevine.com/s/article/Roles-and-Permissions-for-Accepting-Payments
- Official Bluevine/Zelle status: https://support.bluevine.com/s/article/How-do-I-deposit-funds-into-my-Bluevine-Business-Checking-Account

**Operator bank activation:** verify that an active business account is
actually Evercraft-owned, confirm its ACH-credit receiving instructions in
the financial institution's secure dashboard and test a permitted merchant-
authorized bank credit. Never copy account details into source, chat, public
issues or logs. Prefer a bank-issued receivables/virtual account if available.

## Bank facts / sources
- Nacha B2B ACH Quick Start: https://www.nacha.org/b2bquickstart
- Nacha Pay-by-Bank FAQs: https://www.nacha.org/pay-by-bank-faqs
- Zelle for Small Business (bank eligibility required): https://www.zelle.com/business
- FedNow participants (bank-led access): https://www.frbservices.org/financial-services/fednow-service/fednow-service-participants-service-providers/

## Truth and operating boundaries
**Not live from this PR**. No business bank account was read or configured,
no native public route was deployed, no actual customer link was sent,
no funds were moved, no paid receipt was independently verified and no
fulfillment entitlement was issued. Keep the prior seven original Stripe
URLs and their recurring buyer-form canaries intact. Never use Base44.
