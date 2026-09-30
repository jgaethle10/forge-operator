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
client.entities.Widget.importEntities(...)
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
client.auth.isAuthenticated()
client.auth.register(...)
client.auth.verifyOtp(...)
client.auth.resendOtp(...)
client.auth.resetPasswordRequest(...)
client.auth.resetPassword(...)
client.auth.loginViaEmailPassword(...)
client.auth.logout(...)
client.getConfig()
client.asServiceRole
```

The point is to preserve application behavior while the authority underneath changes from Base44 to Evercraft.

## Drop-in Base44 SDK adapter

`base44-sdk-compat.mjs` exports `createClient()` and `createAxiosClient()` with the call shapes observed in live Evercraft Base44 applications.

That includes the generated `src/api/base44Client.js` pattern, cross-app `createClient({ appId })` use, the generated auth context's public-settings request, entity import, and the registration / OTP / password-reset methods currently used by products such as AliEV and Evercraft Clip.

The adapter intentionally ignores Base44-specific routing hints such as `functionsVersion` as runtime authority. The destination is resolved from an explicit Evercraft App Fabric origin, an owned same-origin deployment, or `EVERCRAFT_APP_FABRIC_URL`. A legacy `appBaseUrl` is metadata only and is never treated as the destination runtime.

The temporary compatibility token keys include legacy browser storage names so existing generated pages can survive cutover before a later cleanup removes the old naming. That is compatibility state, not Base44 authority.

Run:

```bash
npm run proof:base44-sdk-compat
```

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

Realtime entity subscriptions are backed by the Evercraft realtime bus.

`entities.<name>.subscribe(callback)` opens an authorized server-sent event stream with durable sequence IDs. Entity mutations publish into a hash-chained app/entity event log and clients expose the last delivered sequence so reconnects can resume after a known cursor.

The Base44 Exit factory still keeps a separate `realtime_replatformed` cutover gate. The owned baseline existing is not enough by itself for every product. Apps that depend on ordering semantics, high fan-out, delivery guarantees or other Base44-specific subscription behavior must pass app-level parity before traffic moves.

## Migration use

App Fabric belongs under the canonical Base44 Exit Program:

`systemia/migrations/base44-exit`

The migration factory determines whether an app can use App Fabric as-is, needs a stronger backing implementation, or has additional blockers such as OAuth re-authorization, storage migration, webhooks, scheduled work, commerce, realtime, custom domains or machine-facing discovery.

A passing App Fabric proof is infrastructure evidence. It is not by itself permission to move production traffic.
