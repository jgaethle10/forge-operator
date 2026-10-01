# Base44 Exit Program

Status: active

Base44 is legacy infrastructure for Evercraft/Systemia. It is not a destination for new builds.

## Canonical placement

- GitHub owns canonical source, schemas, tests, release metadata and immutable source history.
- Systemia owns orchestration, admission, dependency sequencing, authority policy, receipts and migration state.
- Yard / Evercraft Compute owns runtime, deployment, health checks, route verification and rollback.
- Base44 is limited to temporary extraction, compatibility and continuity while a bounded slice is still unmigrated.

## Runtime invariant

Evercraft-owned software is the runtime/control fabric. Systemia Core schedules work, Yard admits and deploys it, Evercraft Compute supplies the workload contract, and NodeSeed / outbound capacity transport bind authorized compute when capacity is needed. No named cloud provider is a prerequisite or canonical dependency. Physical compute is replaceable substrate, not the operating system of Evercraft.

The available-hardware-first rule applies during migration: discover and use already-authorized compatible capacity before considering any external infrastructure. A founder device may participate as optional capacity, but no personal device becomes a mandatory production dependency.

## Operating rule

No new Evercraft/Systemia product begins life in Base44. Existing Base44 apps may receive only continuity, extraction, security, migration or parity work required to complete cutover.

A slice is not migrated because code was copied. Completion requires source extraction, dependency inventory, data reconciliation, auth and integration parity, green tests, an immutable release reference, Yard deployment, live health and route verification, rollback proof and an observation window.

## Migration order

1. Systemia Core / KAIDANCE Collider and mission/receipt fabric.
2. Shared capability registry, execution checkpoints and first-party routing.
3. Machine commerce and public AI discovery edges.
4. Shared auth, data and integration adapters.
5. Revenue-critical customer products.
6. Guardian/EverNest-class safety and family products with stricter privacy gates.
7. Research, media, atlas and long-tail apps.
8. Retire legacy dependencies only after replacement receipts exist.

## KAIDANCE acceptance

The migrated Collider must expose a safe health surface that can report at least:
- last completed cycle,
- cycle age,
- heartbeat target,
- coverage receipt validity,
- admitted/held work counts,
- last deployment receipt,
- degraded/healthy state,

without exposing private mission content, credentials, customer data or internal topology.


## Evacuation factory

The portfolio-wide execution engine lives in `systemia/migrations/base44-exit/factory`.

The factory converts each legacy Base44 app into a redacted migration plan, determines which shared Evercraft landing primitives it needs, and blocks cutover until the applicable gates are satisfied. The source remains read-only during extraction. Source deletion, credential copying, plaintext secret export, DNS mutation and production traffic cutover are outside the factory's authority.

Shared landing primitives are intentionally reused across the estate:

1. public edge,
2. Yard runtime,
3. canonical data,
4. identity boundary,
5. secret store,
6. object storage,
7. resident scheduler,
8. connector gateway,
9. webhook gateway,
10. commerce boundary,
11. Fabric / CHUM discovery,
12. Portfolio Sentinel.

The Saban contract `base44-evac` assigns ten bounded specialist roles to each private inventory record and reconciles their findings into one portfolio receipt. Private Base44 identifiers stay out of the public repository.

Run a private plan with:

```bash
npm run base44:evac -- --inventory /secure/path/base44-estate.json
```

Run the bounded Saban fan-out with:

```bash
npm run saban:base44-evac -- --inventory /secure/path/base44-estate.json
```

A green plan means the migration requirements are explicit. It does not mean production traffic has moved.


## Compatibility membrane

The migration path does not require every generated Base44 client call to be rewritten at once. Evercraft App Fabric now exposes a bounded compatibility membrane for the call shapes observed in live portfolio applications:

- entity CRUD, bulk operations, aggregate, upsert, import and realtime subscription,
- function invocation,
- integration invocation,
- generated auth-context calls,
- public app settings,
- cross-app clients,
- Base44 SDK-style `createClient()` and axios helper usage.

The implementation lives in `systemia/app-fabric`. Compatibility is a bridge, not permanent Base44 authority. Destination routing resolves to Evercraft-owned App Fabric, and public cutover remains gated on parity.

The source archaeologist is `systemia/migrations/base44-exit/source-scanner.mjs`. It fingerprints cross-app IDs, reports environment variable names without values, inventories entity/function/auth/integration usage and counts hard-coded Base44 route dependencies without emitting those route values.

Run it against an extracted application tree with:

```bash
npm run base44:scan-source -- --source /secure/path/extracted-app
```

## Identity migration boundary

Evercraft Identity is the destination authority for app sessions. App Fabric binds to the existing Evercraft session format and server-side revocation ledger. Migrated users may be provisioned only with a verified migration, operator or delivered-challenge authority receipt.

Registration and password recovery use `systemia/identity/challenge-broker.mjs`. Pending registration credentials are encrypted in Evercraft Secret Store. Verification codes and reset tokens are stored only as hashes. The broker refuses to claim registration or recovery delivery unless a real delivery adapter returns a receipt.

This means generated Base44 auth pages can be made compatible without copying Base44 credentials or inventing a fake OTP path.

## Lossless entity transfer

Generic structured-data transfer lives in `systemia/migrations/base44-exit/entity-transfer.mjs`.

Each entity transfer must prove:

1. bounded pagination,
2. terminal source exhaustion,
3. stable source row count when the source exposes one,
4. unique migration keys,
5. immutable page objects in Evercraft Object Store,
6. per-page object hashes,
7. one deterministic whole-stream hash,
8. idempotent destination import,
9. destination field-by-field reconciliation for every source field,
10. mutation receipts for destination writes.

Raw pagination cursors, source secret values and traffic changes are excluded from the transfer manifest. A source that loops cursors, changes its asserted total, omits a next cursor before exhaustion, duplicates a migration key or disagrees with the final row count fails closed.

Run the proof with:

```bash
npm run proof:base44-entity-transfer
```

The transfer receipt proves data movement only. It does not authorize DNS changes, traffic cutover or Base44 decommissioning.


## Route cutover registry

Hard-coded Base44 endpoint strings are not a migration strategy. The receipt-gated route registry in `systemia/migrations/base44-exit/route-registry.mjs` separates four different states that legacy code previously blurred together:

1. **staged**: the owned destination exists as a candidate,
2. **verified**: a route binding and independent probe receipt match the candidate,
3. **active**: a separate cutover receipt explicitly authorizes traffic to resolve there,
4. **verified but inactive**: the candidate remains available after a hold or rollback.

Staging and verification never move production traffic. Activation is pinned to the expected immutable release and route-binding receipt. A legacy URL may be supplied during staging only to create a fingerprint; the raw legacy route is not persisted in the registry.

The owned specialist runtime and Yard public-edge controller no longer contain a Base44 gateway as a hidden default. If no owned specialist gateway is configured, transactional/specialist calls fail closed while the read-only Fabric directory remains available.

Run:

```bash
npm run proof:base44-route-registry
npm run validate:base44-owned-runtime-firewall
```

The firewall blocks hard-coded Base44 network destinations from critical owned runtime surfaces while still allowing compatibility terminology and migration tooling.


## Portfolio readiness board

The private estate should be evaluated as one migration portfolio, not as disconnected app rewrites.

`systemia/migrations/base44-exit/portfolio-board.mjs` combines redacted evacuation plans, the named migration queue, and the canonical landing-primitive policy. It reports:

- per-wave blocked gates,
- shared destination primitive coverage,
- unqueued private-source counts,
- shared blockers by affected-app count,
- exact or authority-backed alias queue matches,
- cutover-ready versus blocked state.

Unmatched source names remain private; their board rows use source fingerprints only. The board has no traffic, payment, source-mutation or decommission authority.

Run it against a private inventory with:

```bash
npm run base44:portfolio-board -- --inventory /secure/path/base44-estate.json
```

The authenticated live app listing was reconciled on 2026-09-30 in `live-page-observation-2026-09-30.json`. The listing again reached the 100-app ceiling, so 100 remains a minimum. Nineteen of the 24 named queue products were exact-name matches on the visible page, five require source/alias resolution, 81 visible apps were not exact-name assigned to the named queue, and ten visible apps were titled `Untitled`. Those counts are evidence of inventory work still required, not proof that the unmatched sources are disposable or unrelated.

## Owned integration edge

`systemia/integration-edge/runtime.mjs` is the shared public ingress for migrated OAuth connectors and signed webhooks.

For new connector authorization:

- connector initiation is authenticated,
- OAuth state is random and hash-only at rest,
- the exact callback URI is bound into the state record,
- production callbacks require HTTPS,
- Base44 callback origins are refused,
- provider credentials are exchanged directly into Evercraft Secret Store,
- successful callback state is one-time and replay-resistant.

For webhooks:

- the raw body is verified before dispatch,
- HMAC signatures and timestamp replay windows are enforced,
- event IDs are idempotent,
- duplicate delivery does not redispatch work,
- payload bytes do not enter delivery receipts.

Provider-side OAuth redirect registration and webhook repointing remain explicit migration actions. Creating an owned endpoint does not claim the provider has been reconfigured.

## Public route overlay

The receipt-gated route registry can export active routes into the public discovery build without exposing staged candidates.

`systemia/migrations/base44-exit/route-overlay.mjs` admits only active HTTPS routes with release, deployment, binding, probe and cutover receipts. CHUM's commercial discovery generator now resolves Machine Commerce through this overlay when `EVERCRAFT_ACTIVE_ROUTE_OVERLAY` is supplied. With no active route, the existing legacy public door remains in place. Staging or verification alone never changes generated public routing.
