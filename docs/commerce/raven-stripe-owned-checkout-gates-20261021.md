# Evercraft Payments: Raven-owned Stripe checkout bridge · October 21, 2026

## Proven source evidence

Authenticated read-only queries to the live **Evercraft Media & Technologies** Stripe account on October 21 found **five active product records, five active one-time prices, zero Payment Links, and zero Checkout Sessions**. Of these, two products are already approved Evercraft offers:

| Owned offer | Offer key | Cents | Provider catalog observation |
| --- | --- | ---: | --- |
| Website Quick Win Audit | `systemia.website_audit_quick_win_49.v1` | 4900 | Matching active one-time USD Stripe product and price |
| FindMyPart Quick Hunt | `findmypart.quick_hunt_19.v1` | 1900 | Matching active one-time USD Stripe product and price |

The other three active product records are Garage Field Notes assets and **are not** automatically allowed by this bridge. No provider writes, products, Payment Links, checkouts, charges, order receipts or payouts were created during this audit.

## Ownership and authorization

Evercraft Payments remains the canonical order and entitlement owner. Raven Nexus holds server-side Stripe credentials and must independently confirm the Stripe account identity and exact price for each accepted order. `systemia/payments/stripe-connection-registry.mjs` stores the intended account identity in an owner-only local file, but that identity **does not grant API authorization**. ChatGPT's managed Stripe connection is separate and cannot automatically be used by Penguin.

The Raven checkout bridge consists of:

- `systemia/payments/raven-stripe-price-bridge.mjs`: two-offer fixed-price allowlist and pure checkout planning; validates persisted canonical order, buyer confirmation, unpaid non-synthetic state, account identity and authenticated live price evidence. Outputs an idempotent Stripe Checkout Sessions request that contains only authorized price and order metadata.
- `systemia/payments/raven-stripe-checkout-adapter.mjs`: private, in-process Raven connector implementation. Requires a separately provisioned live Stripe secret in a restrictive, owner-only file beneath `~/.local/state/evercraft/raven-nexus/provider-credentials/`. It checks the authenticated Stripe account, `charges_enabled`, re-reads the exact Stripe price, makes the Checkout Sessions call with idempotency, and validates the returned open/unpaid hosted session.
- Paired tests exercise the consent, order, account, price, secret-file security, idempotency and no-fake-paid boundaries. Test fixtures use injected mock credentials and network responses; there are **no real Stripe writes in CI**.

**No production checkout is operational from these files alone.** None of these functions is connected to a public HTTP route or automatically installed on Penguin. This branch is a staged implementation and its PR is deliberately draft.

## Required field gates before live checkout

1. Explicitly authorize and securely provision a Stripe live API credential for the intended account into Raven Nexus's private credential storage on Penguin (never paste it into chat, commit it to Git, or put it into public checkout HTML). Restrict filesystem owner and permissions; verify service process access with no credential content in logs. A managed ChatGPT Stripe connection cannot be copied into the runtime.
2. Install an *authenticated*, internal Evercraft Payments order/ops service, with durable idempotent order persistence and offer/price binding. Do **not** expose a raw `createCheckoutSession` adapter over public MCP or untrusted HTTP.
3. Wire the existing Fabric checkout request contract `/api/offers/{slug}/checkout` through `EVERCRAFT_PURCHASE_INTENT_OWNED_URL` and `EVERCRAFT_PAYMENT_OPS_OWNED_URL`. Both must be approved owned HTTPS endpoints and their user-facing route must require positive buyer confirmation. The service must own the canonical order before calling Raven.
4. Verify a Stripe-generated Checkout Session's `client_reference_id`, authorized line-item price, cents/currency, account/mode, and expected Evercraft metadata. Show `checkout_prepared_unpaid` until payment verification.
5. Receive and cryptographically verify Stripe webhooks or securely re-fetch authoritative provider payment state using the authenticated Raven adapter; reconcile with order, offer, amount, currency, environment and idempotency. Generate canonical Evercraft receipt only after that check. Make replay processing idempotent.
6. Gate entitlement and fulfillment on an actual canonical paid receipt and separate product delivery acceptance. Never treat redirect, Checkout Session creation, email click, or an agent claim as a paid order.
7. Independently test public HTTPS, webhooks, client checkout, signed receipt, retry behavior and end-to-end fulfillment before marking any `sell_now` buyer CTA active.

The legacy buyer-form `HTTP 402` hold is a separate external dependency. Nothing here asks for an account downgrade, moves the live router, weakens receipt validation, or authorizes generic Stripe-first product checkouts outside Evercraft Payments.

## Safe checks

```bash
node --test systemia/payments/raven-stripe-price-bridge.test.mjs
node --test systemia/payments/raven-stripe-checkout-adapter.test.mjs
node scripts/systemia-stripe-connection.mjs --status
```

The status command masks the account identifier and truthfully displays `runtime_authorized:false` and `checkout_verified:false`. Do not merge, advertise live checkout, or promote payment/fulfillment from CI alone.
