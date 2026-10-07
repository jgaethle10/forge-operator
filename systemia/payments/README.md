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

## Owned resident checkout path

The public Fabric checkout path uses an Evercraft-owned local hop:

```
Fabric offer page
  -> Evercraft Payments purchase intent
  -> loopback Raven Nexus payment runtime
  -> settlement adapter
  -> Stripe
```

The resident Raven payment runtime binds only to loopback and owns the persistent Evercraft order ledger. Fabric receives only a private bearer-token file path and the loopback purchase-intent URL. Stripe credentials remain inside the Raven provider boundary and may be resolved from the encrypted Evercraft provider vault.

Current resident defaults:

- purchase-intent URL: `http://127.0.0.1:8791/v1/purchase-intents`
- Raven service: `evercraft-raven-payments.service`
- Evercraft order state: `/var/lib/evercraft/payments`
- Raven/Fabric bearer token: `/var/lib/evercraft/raven-secrets/payments-token`
- provider credential vault: `/var/lib/evercraft/home/credentials`

Fabric rejects Base44 purchase-intent URLs and rejects arbitrary remote payment-intent origins. It does not receive Stripe credentials.

The canonical entry-offer registry currently covers the public Fabric checkout doors for Website Audit, IBM i Rescue, Legacy Rescue, and FindMyPart. The runtime ignores caller-supplied price values and resolves amount/currency from that canonical registry.

A checkout session is still **not payment proof**. Creating or reusing a checkout leaves `payment_state=unpaid` and `fulfillment_release=false`. Fulfillment requires a separate authoritative settlement-verification receipt.

If the Stripe credential is not present in the Raven-owned encrypted vault, the owned payment transport may still be healthy but checkout creation fails closed. Do not substitute a legacy transport or direct Stripe path to make that state appear green.

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
