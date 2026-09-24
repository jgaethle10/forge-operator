# Base44 Exit Program

Status: active

Base44 is legacy infrastructure for Evercraft/Systemia. It is not a destination for new builds.

## Canonical placement

- GitHub owns canonical source, schemas, tests, release metadata and immutable source history.
- Systemia owns orchestration, admission, dependency sequencing, authority policy, receipts and migration state.
- Yard / Evercraft Compute owns runtime, deployment, health checks, route verification and rollback.
- Base44 is limited to temporary extraction, compatibility and continuity while a bounded slice is still unmigrated.

## Rules

1. Do not create new Base44 apps for Evercraft/Systemia products.
2. Do not add new Base44-only runtime dependencies to migrated capabilities.
3. Do not declare a Base44 slice retired until code, data, auth, integrations and runtime behavior have independently passed parity.
4. Copying code is not migration completion. A slice is complete only after live deployment, health verification, route verification, data reconciliation and rollback proof.
5. Preserve existing authority gates during migration. Source-control movement does not widen payment, publication, outreach, privileged-access or sensitive-data authority.
6. Base44 data remains authoritative only for the specific unmigrated slice that still depends on it.
7. Secrets do not move through public GitHub. Private Core source, credentials, private endpoints, mission records and sensitive state remain private.
8. Every retired Base44 dependency must have a named replacement and a retirement receipt.

## Cutover state machine

```
inventory
  -> extract
  -> normalize
  -> test
  -> deploy_to_yard
  -> live_canary
  -> reconcile
  -> shadow
  -> cutover
  -> observe
  -> retire_base44_dependency
```

A failure at any gate returns the slice to the last verified checkpoint.

## First migration target

Systemia Core / KAIDANCE Collider is the first control-plane migration because it coordinates the rest of the portfolio. Moving the brain first prevents a portfolio-wide migration from depending on a legacy orchestrator.

The private Core repository remains required. This public repository carries only public-safe contracts, release boundaries, validators and migration policy until the private repository is available through the authorized GitHub installation.
