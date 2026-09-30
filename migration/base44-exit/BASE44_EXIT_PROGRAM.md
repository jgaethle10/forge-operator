# Evercraft Base44 Exit Program

**Status:** ACTIVE  
**Start:** 2026-09-30  
**Canonical repo:** `jgaethle10/forge-operator`  
**Scope discovered:** 100 Base44 apps in the first inventory pass.

## Decision

Base44 is now a migration source and temporary compatibility layer, not the target runtime for Evercraft production.

We are not doing a blind lift-and-shift. Every product moves through a controlled strangler migration so customers and internal operators keep working while Base44 dependencies are removed underneath them.

## Non-negotiable exit definition

An app is **not migrated** because its frontend was copied. It is migrated only when all of the following are proven outside Base44:

1. source code is in Evercraft-controlled version control;
2. entity schemas and durable data are exported and reconciled;
3. authentication and authorization no longer depend on Base44;
4. server functions and background jobs execute on Evercraft-owned runtime;
5. secrets have moved into the Evercraft secret boundary and Base44 copies are rotated/revoked;
6. files/artifacts have durable non-Base44 storage;
7. scheduled/conditional work runs without Base44;
8. public routes and domains point to the new runtime;
9. health checks and customer canaries pass;
10. rollback is possible without re-enabling Base44 writes;
11. Base44 is read-only during soak;
12. Base44 is then decommissioned for that app.

## Migration order

### Wave 0: stop creating new dependency
- No new production service, durable state, workflow, scheduled job, secret, or canonical artifact may be introduced solely in Base44.
- Base44 changes are limited to safety fixes and migration adapters.
- Forge Operator becomes the canonical migration ledger.

### Wave 1: nervous system
Move these first because everything else depends on them:
- Systemia Command Center
- SYSTEMIA Marketing Agency / current KSS execution surface
- Raven Nexus
- Evercraft / Evercraft HQ
- Evercraft AI Suite
- canonical Data Foundry surfaces
- Systemia Audit Center / Remote Ops / Radar / Field Library / Atlas / Decision Lab

### Wave 2: revenue-critical products
- RIVET
- AliEV
- Evercraft Clip
- Evercraft Journal
- ForensiScope
- EverMaps
- TOWI / FAIE
- Evercraft Network

### Wave 3: portfolio applications
All remaining discovered applications follow the same contract. No orphaned Base44 entities, functions, domains, secrets, or cron jobs are allowed to survive the exit unnoticed.

## Architecture target

```
public edge / plugins / apps
        |
        v
Evercraft Yard / Forge public edge
        |
        v
Systemia control plane
        |
        +--> owned execution workers
        +--> durable database
        +--> object/artifact storage
        +--> secret boundary
        +--> job/event queue
        +--> observability + receipts
        |
        v
product services (RIVET, AliEV, Clip, Journal, ...)
```

Base44 may temporarily sit behind an adapter during migration, but no adapter is allowed to become the new permanent dependency.

## RIVET/AliEV lesson applied

The September site-plan failure exposed the exact reason this exit matters: a control plane can look sophisticated while execution still depends on a provider-owned sandbox that is unavailable, stale, or disconnected from the real worker.

For the new runtime:
- control plane and execution plane are separate but both must be live;
- every execution request gets an observed worker receipt;
- recovery drills exercise real workers, not only contract tests;
- canonical artifacts live in durable storage independent of UI/runtime provider;
- product state is reproducible from versioned source + data + lineage receipts.

## Per-app migration state machine

```
DISCOVERED
 -> SNAPSHOT
 -> EXPORT_SOURCE
 -> EXPORT_SCHEMA
 -> EXPORT_DATA
 -> PORT_RUNTIME
 -> PORT_AUTH
 -> PORT_JOBS
 -> PORT_STORAGE
 -> DUAL_RUN
 -> CANARY
 -> DOMAIN_CUTOVER
 -> BASE44_READ_ONLY
 -> SOAK
 -> DECOMMISSIONED
```

Any failed reconciliation returns the app to the previous safe state. Data writes are never dual-mastered without an explicit reconciliation protocol.

## Immediate work

1. Freeze creation of new Base44-only production dependencies.
2. Export the full source tree and entity schema inventory for every discovered app.
3. Build the Evercraft runtime contract once, then port apps into it rather than inventing a new hosting pattern per product.
4. Move Systemia + KSS execution first so recovery work does not depend on Base44 sandboxes.
5. Move RIVET/AliEV next and prove the First Seven recovery drill on the new execution plane.
6. Rotate secrets after each cutover.
7. Keep Base44 read-only during soak, then remove it app by app.

## Proof standard

The exit is complete only when a Base44 outage can occur and the Evercraft portfolio continues operating without customer-facing or execution-path dependence on it.
