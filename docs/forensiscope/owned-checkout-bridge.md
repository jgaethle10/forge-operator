# ForensiScope checkout through owned Evercraft Payments

Release state: PRIVATE STAGING ONLY. The real ForensiScope checkout route
is not enabled on the public buyer page. Current connected payment
directory reports an unavailable ForensiScope checkout with a provider
HTTP 402 hold. This change does not bypass that hold.

The owned-checkout-bridge.mjs module accepts only an owned HTTPS payment
operations URL, never direct provider credentials or arbitrary Stripe
links. It reuses existing canonical ForensiScope duration prices.

Preconditions before the provider request:
- A real authenticated customer identity and customer email from the
  server's trusted identity provider, not caller-supplied email.
- Explicit buyer confirmation for a persisted, customer-owned order.
- Exact offer key and amount checked against the published five tiers.
- Media rights confirmation on the server-owned order.
- Fresh capacity flags for format, size, owned resumable ingress,
  processing, private delivery, and payment-route verification.
- A durable owned capacity reservation with a matching order key.
- A configured and explicitly enabled owned payment operations endpoint.

Request shape follows the existing owned Fabric offer checkout:
action=create_checkout, exact offer_key, owned order_key, authenticated
customer_email, first-party source_ref, owned return_origin, and paths
for success/cancel. A checkout response is accepted ONLY when provider
response is successful, order, SKU, amount, currency and HTTPS URL
match, and the owned order persistence callback acknowledges storage.

Checkout handoff response states payment_state=unpaid,
provider_paid_verified=false, entitlement_granted=false,
upload_authorized=false, and job_started=false. It does not authorize
media transfer, start analysis, or establish a paid sale. The existing
resumable-upload and private-job services separately require
authoritative Evercraft Payments settlement and private access grants
before admitting media/returning results.

The unified customer runtime optionally accepts checkoutBridge and
exposes POST /v1/forensiscope/checkout on its LOOPBACK-ONLY private
listener. Body contains order_key and confirmed=true. The trusted
authorizeBuyer callback must supply subject and email. Without a
connected, enabled bridge it returns a hold. The public health record
continues to say public_checkout_enabled=false.

Missing production pieces:
1. Signed buyer identity and customer account/session service.
2. Durable buyer-owned order creation/preflight and idempotency across
   retries, plus capacity reservation cancellation/reconciliation.
3. Real deployment wiring to the owned Evercraft Payments operations
   endpoint and independent provider settlement readback (held 402).
4. Verified HTTPS private ingress, real execution capacity, report
   access grants and end-to-end mobile-device payment receipt canary.
5. Refund/dispute and privacy/retention handling.

Local tests use *synthetic* HTTP provider responses only:
node --test tests/forensiscope-owned-checkout-bridge.test.mjs

There are no real Stripe charges, customer uploads or production checkout
receipts in these tests. Public ForensiScope buyer page remains an
inquiry until a live verified release.
