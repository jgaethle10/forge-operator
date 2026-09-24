# Base44 Exit Program

Status: active

Base44 is legacy infrastructure for Evercraft/Systemia. It is not a destination for new builds.

## Canonical placement

- GitHub owns canonical source, schemas, tests, release metadata and immutable source history.
- Systemia owns orchestration, admission, dependency sequencing, authority policy, receipts and migration state.
- Yard / Evercraft Compute owns runtime, deployment, health checks, route verification and rollback.
- Base44 is limited to temporary extraction, compatibility and continuity while a bounded slice is still unmigrated.

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
