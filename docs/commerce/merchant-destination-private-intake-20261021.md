# Evercraft Payments | Private merchant destination candidates

## Oct 21, 2026 source and consent boundary

The owner supplied **a Cash App URL, a Venmo handle, a Zelle QR image, and a PayPal QR image**, then directed engineering to push forward. These are **unverified candidate destinations**, not confirmation that an eligible business profile or bank account has been enrolled. User-supplied payment addresses are never included in this GitHub repo or public storefront.

The QR codes contain person-associated routing information. Zelle and PayPal QR payloads, Zelle phone/name and QR image bytes must not be written to GitHub, logs or public LLM catalog. The local candidate record marks only `qr_present_not_stored`. Cash App/Venmo handles are supplied at private operator runtime and stored with owner-only filesystem permissions. Never infer PayPal Business eligibility from any QR or cash-app business eligibility from a Cash App profile URL alone.

## Private intake

`node scripts/evercraft-merchant-payment-candidates.mjs status` displays a redacted preflight only. It does not connect to providers or create orders.

`node scripts/evercraft-merchant-payment-candidates.mjs stage --owner-approved` consumes one JSON object via standard input, requiring exact keys `cashAppUrl`, `venmoHandle`, `zelleQrSubmitted`, `paypalQrSubmitted`. The two URLs/handles come from owner-directed values only. **Never put raw values in GitHub**, a CI variable, an agent prompt, a public query string, shell args or an unauthenticated web endpoint. On Penguin the operator may use a single-quoted local here-document to avoid interpolating special characters. This flow does not require Stripe.

Input structure with fictional fixture identities only:

```bash
cat <<'JSON' | node scripts/evercraft-merchant-payment-candidates.mjs stage --owner-approved
{
  "cashAppUrl": "https://cash.app/$TESTMERCHANT123",
  "venmoHandle": "@Test-Merchant-123",
  "zelleQrSubmitted": true,
  "paypalQrSubmitted": true
}
JSON
```

The *only* write is a private on-disk file at `~/.local/state/evercraft/payments/private/merchant-destination-candidates.json` (mode 0600, parent 0700). Staging does **not** modify live Fabric routing, other registry versions or credentials; it will not overwrite existing intake. Status output includes no handles, account numbers, QR material or payment instructions.

## Post-intake verification gates

1. **Cash App**: verify business enrollment/account ownership and terms for accepting goods/services transactions.
2. **Venmo**: verify business profile or another expressly supported goods/services acceptance method; do not assume a personal handle is an authorized merchant.
3. **Zelle**: confirm bank account is eligible for Zelle small-business receipt, enrollment, available recipient and reference/reconciliation; do not publish a personal QR/phone by default.
4. **PayPal**: verify that the supplied QR route is connected to a recipient authorized for goods/services or create a PayPal Business invoice/payment link.
5. Select only independently operator-approved eligible destinations for an authenticated Evercraft customer invoice, with exact fixed-price order/currency, buyer confirmation, customer support/refund policy and traceable order reference. Keep unverified methods hidden.
6. Reconcile with authenticated bank/app statements or permitted manual cash/check evidence. Buyer screenshots, payment claims, QR scans and redirect success are **not** proof of funds. Fulfillment remains held until authoritative evidence, reversals tracked.

CI validates that this stage cannot claim business enrollment, expose payment directions or mark an order paid. The four candidate statuses remain unverified in source and local private records until a future, separately reviewed operator attestation service is implemented.

Relevant provider docs: https://www.zelle.com/business ; https://venmo.com/business/profiles ; https://www.paypal.com/us/business/accept-payments/qr-code ; https://cash.app/us/en/legal/cash-payment-terms.
