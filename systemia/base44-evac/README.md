# Base44 Evacuation Factory

This lane exists to move Evercraft software off Base44 without turning a platform migration into a portfolio outage.

The factory treats Base44 as a read-only source during extraction. It does not delete apps, revoke connections, rotate DNS, copy plaintext secrets, or perform production traffic cutover. Those actions have their own release and human gates.

## What the factory produces

Each source app becomes an `evercraft.base44-evac.app-plan.v1` plan with:

- a redacted source fingerprint
- feature inventory: entities, functions, auth, storage, connectors, webhooks, jobs, payments, public machine surfaces
- required Evercraft landing primitives
- cutover gates
- complexity score
- explicit blockers
- rollback and post-cutover monitoring requirements

The portfolio reconciliation produces aggregate demand across the whole estate so Evercraft can harden shared primitives before moving the hundredth app.

## Landing primitives

The contract is deliberately platform-level. Every migrated app can request the same small set of Evercraft-owned targets:

1. public edge
2. Yard runtime
3. canonical data
4. identity boundary
5. secret store
6. object storage
7. resident scheduler
8. connector gateway
9. webhook gateway
10. commerce boundary
11. Fabric/CHUM discovery
12. Portfolio Sentinel

If one of those primitives cannot satisfy an app contract, the correct result is a blocker, not a hidden Base44 dependency.

## Cutover doctrine

A successful build is not a successful migration. Traffic moves only after source capture, route inventory, schema/data verification where applicable, identity/runtime parity, provider re-authorization, secret re-keying, critical journey parity, observability, rollback proof, and post-cutover Sentinel coverage are satisfied.

Data-bearing applications also require a bounded write-freeze or verified dual-write/delta-sync strategy so the final snapshot cannot silently lose writes.

Provider credentials are never scraped out of Base44 and copied into receipts. External integrations are re-authorized against the Evercraft destination.

## Running a private portfolio plan

Keep the inventory outside the public repository.

```bash
node systemia/base44-evac/runner.mjs \
  --inventory /secure/path/base44-estate.json \
  --out artifacts/base44-evac/latest.json
```

For Saban fan-out:

```bash
node systemia/saban/multiplier.mjs \
  --software base44-evac \
  --inventory /secure/path/base44-estate.json \
  --auto \
  --execute \
  --reconcile
```

The Saban contract denies source mutation, source decommission, public publication, payment obligations, and automatic traffic cutover.
