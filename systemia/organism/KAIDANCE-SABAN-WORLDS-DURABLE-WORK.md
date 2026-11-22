# KAIDANCE → Systemia Goal → Registered Saban World Engine Reviewer

This is the first **actual bounded work execution** attached to Kaidance's company heartbeat rather than just an inventory/proof report.

## Production truth

On its next qualified owned-source cycle, Systemia opens (or resumes) one content-addressed `evercraft.goal.state.v1` for the canonical Mossmere World Engine source bridge. Before calling a worker, the existing `goal-durable-dispatch.mjs` persists an attempt checkpoint under a stable `mission_key`, `goal_key`, `work_key`, and per-attempt dedupe key. It then invokes Saban's actual registered `world-engine-review` adapter, role `engine_architect`, for `toEngineWorld(initialWorld())`.

The Saban reviewer checks the canonical V1 world schema, identities, entities and architecture directives. The new bridge independently validates the registered adapter's reported world ID, role, status, findings and denied-effect boundaries before recording a local **read-only review** completion receipt. It writes `latest.json` plus the existing `evercraft.kaidance.mission-snapshot.v1` for the **same** Kaidance frontier Collider. The goal file stays on disk so the next heartbeat sees its completion and skips duplicate work.

When the source bridge or the reviewed Saban code changes, the source fingerprint changes and a **new** durable goal can be reviewed. A failed, missing or untrusted reviewer result is conservatively held in Systemia's existing `recovery_hold` state; it is *not* automatically replayed just because the five-minute clock fired.

This operates under the **existing** `kaidance-frontier-field.yml` best-effort cron and the optional existing owned Core resident service. No new scheduler, privileged agent, code-write adapter, Stripe write, social send or public deploy is created.

## What it is NOT

- It runs **one** registered Saban architect assignment locally, not all 23 World Engine roles and not an extra Node002 process.
- It reviews Mossmere's **source** builder-to-engine bridge; it does not survey Seattle Flightworks or Yakima historical geometry.
- It does **not** autonomously code, merge PRs, publish, charge customers or modify company products.
- CI runner state may be lost if the GitHub Actions cache is evicted. Source fingerprints and private goal storage provide stable **dedupe identities**, but continuous durability is proven only after owned resident activation and consecutive private receipts.
- A read-only review completion is an actual bounded task, **not a shipped feature**.

## Evidence

```bash
node --test tests/kaidance-worlds-saban-review.test.mjs
node systemia/organism/kaidance-worlds-saban-runner.mjs \
  --out artifacts/kaidance-worlds-saban-review
```

The owned resident service is optional until `SYSTEMIA_KAIDANCE_SABAN_WORLD_REVIEW_OUT_DIR` points to a protected, durable, owned directory. The first operator activation should verify that no other scheduler is running the same goal store, source fingerprints are stable, one actual read-only Saban receipt is produced, subsequent heartbeats skip the completed goal, and a reviewed source change starts a different goal.

## Next worker

After a real owned-runtime readback, add a code-development worker with its own explicit source-only, branch-only, reviewable PR adapter, bounded model inference, tool budgets, memory preflight, quality and security checks, and reconciled GitHub receipts. Such an adapter is **not yet admitted** and cannot inherit read-only Saban review authority. Its effects must remain isolated and gated.
