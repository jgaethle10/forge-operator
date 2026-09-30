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
