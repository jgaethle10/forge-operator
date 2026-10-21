# Evercraft Payments

Evercraft Payments is the canonical payment and economic-order layer for Evercraft.

## Non-negotiable routing invariant

```
customer / agent / product
        ↓
Evercraft Payments
        ↓
Raven Nexus provider boundary
        ↓
settlement adapter
        ↓
Stripe (currently connected)
```

Stripe is a settlement adapter. It is not the Evercraft product surface.

Products must not create a separate Stripe-first commercial path when Evercraft Payments is available. A customer-facing product should create or reference an Evercraft payment order, and the order may settle through the currently connected Stripe adapter behind Raven Nexus.

## What Evercraft owns

Evercraft Payments owns the canonical representation of:

- payment order
- product / offer identity
- quoted price
- customer confirmation state
- currency
- settlement routing
- payment receipt linkage
- entitlement state
- fulfillment state
- refunds / reversals as economic events
- agent-commerce authority
- provider-independent transaction lineage

A processor response alone must not become the canonical business record.

## What Raven Nexus owns

Raven Nexus is the governed provider connection boundary. Payment-provider credentials and adapter connectivity belong behind that boundary rather than inside product code or public discovery artifacts.

Current operator-declared provider state:

- Stripe is connected through Raven Nexus.
- Evercraft products should route payment through Evercraft Payments.
- Stripe remains replaceable settlement infrastructure.

Do not publish provider credentials, secret identifiers, or private Raven topology.

## Product integration rule

A new Evercraft product may declare:

```json
{
  "commerce_layer": "evercraft_payments",
  "settlement_route": "raven_nexus",
  "provider": "stripe",
  "provider_role": "settlement_adapter"
}
```

This metadata expresses architecture, not proof that a specific offer has a live checkout. Product-specific checkout readiness still requires a verified Evercraft payment-order path and authoritative settlement receipt.

## Anti-regression rule

Do not:

- tell a customer to use a generic Stripe link when an Evercraft Payments order exists,
- treat Stripe as the source of product entitlement,
- make product code depend directly on Stripe credentials,
- bypass Raven Nexus for provider credentials,
- create parallel processor-specific order truth,
- describe Stripe as Evercraft's payment product.

The user-facing brand and product surface is **Evercraft Payments**.

## Durable Systemia Stripe account reference (October 21)

The *operator-approved ChatGPT Stripe connector* can confirm an account identity,
but its OAuth session/API credentials are managed by that external connector and
**cannot be copied, escrowed, or delegated into Penguin merely by remembering
the account**.

To stop losing the correct account association, Systemia persists a local,
private **identity-only** connection reference. It contains only the Stripe
account context identifier, account display name, mode (live/test), observation
date and Evercraft Payments / Raven Nexus routing boundaries. It does **not**
contain an OAuth token, API key, bank number, payment receipt, verified checkout,
or authority to move money.

Run **once** from Penguin after fetching and reviewing this change:

```bash
node scripts/systemia-stripe-connection.mjs --register \
  --stripe-context "<account ID confirmed by the authorized Stripe connector>" \
  --account-name "Evercraft Media & Technologies" \
  --livemode true --observed-date 2026-10-21 --confirm-live
node scripts/systemia-stripe-connection.mjs --status
```

By default, the registry file is at
`~/.local/state/evercraft/systemia/payments/provider-connections/stripe.json`
or under `$XDG_STATE_HOME` when configured. Its containing directory must be
private (`0700`), the file is owner-only (`0600`), and a repeated registration
with the same identity is idempotent. A different Stripe account or livemode
requires an explicitly reviewed `--replace` and, for live mode,
`--confirm-live`.

The account ID is **never committed to GitHub**, sent in URL query strings, or
stored in a public offer catalog. The status command masks its identifier.

Future Systemia/Raven workers may read this identity reference to choose
the intended account **after** obtaining their own authorized connector
connection/secret through Raven Nexus. No worker may infer working Stripe
credentials, a checkout, or settled payment from its mere existence.
`requireStripeRuntimeAuthorization()` deliberately fails closed until a
separate authenticated provider adapter is reviewed.

**Live findings, not a payment claim:** the authorized Stripe connection
listed the Evercraft Media & Technologies account in live mode on October 21,
2026. A read-only `GET /v1/payment_links` query returned zero Payment Links.
That is distinct from the existing public buyer-forms HTTP 402 hold. First
repair the authorized processor checkout/receipt path, then promote individual
offers only with provider-backed settlement and order/entitlement linkage.
