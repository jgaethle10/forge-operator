# Evercraft App Fabric

App Fabric is the compatibility membrane for moving Evercraft applications off Base44 without forcing every product to rewrite its data, function, integration, and auth call sites at the same time.

It is Evercraft-owned infrastructure. It is not a Base44 proxy and Base44 remains read-only during migration.

## What it currently proves

The local proof covers:

- durable entity CRUD
- filter, sort, count and field projection
- bulk create and bulk update
- update-many and delete-many
- upsert
- aggregate
- function invocation
- Core, installable and custom integration invocation
- current-user identity boundary
- bounded service-role boundary
- default-deny authorization
- durable state across store restart
- atomic entity snapshots
- mutation receipts and state hashes

Run:

```bash
npm run proof:app-fabric
```

## Compatibility surface

The client intentionally mirrors the high-value Base44 SDK geometry already observed across the estate:

```js
client.entities.Widget.list(...)
client.entities.Widget.filter(...)
client.entities.Widget.get(...)
client.entities.Widget.create(...)
client.entities.Widget.update(...)
client.entities.Widget.delete(...)
client.entities.Widget.bulkCreate(...)
client.entities.Widget.updateMany(...)
client.entities.Widget.count(...)
client.entities.Widget.aggregate(...)
client.entities.Widget.upsert(...)
client.entities.Widget.bulkUpdate(...)

client.functions.invoke(name, input)
client.integrations.Core.Operation(input)
client.integrations.Provider.Operation(input)
client.integrations.custom.call(provider, operation, input)
client.auth.me()
client.auth.updateMe(...)
client.asServiceRole
```

The point is to preserve application behavior while the authority underneath changes from Base44 to Evercraft.

## Authority boundary

The gateway cannot start without an authorization callback.

Normal requests resolve an Evercraft subject and then require an explicit allow decision. Service-role requests require a separately validated Evercraft service permit. A bearer token alone does not grant entity, function, or integration authority.

App Fabric does not create a hidden portfolio-wide administrator.

Evercraft Identity authenticates humans. Evercraft Passport remains the authorization authority. App Fabric only provides the compatibility surface through which those decisions are enforced.

## Data boundary

The current `DurableEntityStore` is an owned, receipt-backed baseline for migration and bounded production workloads. It uses atomic snapshots, per-app/entity locks, state hashes and mutation receipts.

It is not a claim that one local filesystem should carry every workload in the portfolio forever. Apps with write volume, availability, replication, search, analytics or geographic requirements beyond this store must satisfy their migration gate against a stronger Evercraft data implementation before cutover.

The compatibility API is deliberately separated from the storage implementation so the backing store can evolve without forcing every migrated app to change its application code again.

## Realtime boundary

Realtime entity subscriptions are deliberately not faked.

`entities.<name>.subscribe()` currently fails closed with `realtime_not_configured`. The Base44 Exit factory has a separate `realtime_bus` landing target and `realtime_replatformed` cutover gate for applications that depend on subscriptions.

An app that needs realtime does not cut over until that contract is implemented and parity-tested.

## Migration use

App Fabric belongs under the canonical Base44 Exit Program:

`systemia/migrations/base44-exit`

The migration factory determines whether an app can use App Fabric as-is, needs a stronger backing implementation, or has additional blockers such as OAuth re-authorization, storage migration, webhooks, scheduled work, commerce, realtime, custom domains or machine-facing discovery.

A passing App Fabric proof is infrastructure evidence. It is not by itself permission to move production traffic.
