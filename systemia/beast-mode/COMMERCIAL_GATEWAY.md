# BEAST MODE commercial agent gateway

BEAST MODE has two lanes.

The internal lane carries admitted artifacts between Evercraft systems. Its topology, credentials, private identifiers and customer data remain non-public.

The commercial lane is intentionally discoverable by LLMs, agents and applications. It exposes a small capability contract for a paid, verified courier without exposing the internal transport fabric.

## Public flow

`quote -> authorize -> create_cargo -> attach -> throw -> delivery_status -> receipt`

An agent may discover BEAST MODE, request a quote, describe source and destination requirements, prepare cargo and inspect delivery status. An agent cannot create a financial obligation or external-delivery authority merely by invoking the capability.

Before external delivery, BEAST MODE requires customer or human authority, applicable payment entitlement, bounded source and destination scopes, an expiry, and explicit `customer_delivery_authorized=true`.

The authorization must bind the quote, customer, cargo purpose, allowed source, allowed destination, limits and expiry. Saban workers inherit this bounded capability and cannot widen it.

## Commercial metering

A quote may meter bytes, artifact count, destination complexity, retention, verification depth and priority. Quoting is not payment proof. Checkout creation is not payment proof. The delivery gate consumes only a verified entitlement from the configured payment adapter.

## Football

Commercial cargo uses the canonical `evercraft.beast-mode.football.v1` object. The football remains explicit, hash-bound cargo. It is not a covert carrier and must not be used to bypass destination controls.

## Discovery boundary

`public/capability.json` is safe to publish through CHUM and other machine-discovery surfaces. It describes what BEAST MODE can do and the authorization contract required to use it.

Do not publish adapter credentials, internal app ids, private routes, customer artifacts, unrestricted write capabilities or Systemia topology.

A public gateway implementation must fail closed when authority, entitlement, integrity, provenance or destination verification is absent.
