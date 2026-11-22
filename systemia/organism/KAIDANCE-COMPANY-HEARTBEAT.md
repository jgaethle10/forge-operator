# KAIDANCE: one-company heartbeat bridge (300 seconds)

**Status: source implementation and test gates only until a real scheduled run and owned resident receipt are observed.**

## Why this exists
Kaidance's pulse is the company clock, not an independent fleet of cron jobs. Systemia is the mission authority, Saban supplies admitted execution capacity, and each specialist owns its delivery/proof contract. The product catalog and resident service configuration already exist; this bridge connects their truthful inventory to the existing Kaidance mission-fabric snapshot shape.

## What the first lane actually does
The existing `kaidance-frontier-field.yml` five-minute GitHub Actions schedule runs the company bridge before the existing frontier cycle. It:
1. Reads the canonical 69-item public product catalog (count may change), all configured resident service bindings and explicitly declared company lanes.
2. Discovers workflow-manifest file counts without treating source files as running services.
3. Identifies products with no named responsible lane and emits an **unexecuted** adapter-admission queue. A product is observed, **not automatically assigned a running worker**.
4. Fingerprints bounded Worlds source files. When code changes or the last proof ages beyond 60 minutes, an explicitly enabled, bounded Node source-proof adapter runs existing Worlds tests and records pass/fail. The code is never silently rewritten or deployed by that QA step.
5. Writes `latest.json`, `queue.json`, `state.json` and a true `evercraft.kaidance.mission-snapshot.v1` to the configured private/CI output directory. A same-five-minute duplicate exits without minting new progress.
6. Adds that optional mission snapshot to the existing Kaidance frontier cycle's *same* run, rather than constructing a replacement collider.

The bridge deliberately reports `code_changes:0`, `autonomous_development_workers_launched:0` and `counts.admitted:0` until actual dispatch and independently checked progress exist. A source test pass is not a feature, production release, sales outcome or verified human-facing improvement.

## Deployment path and scheduler accuracy
- The existing GitHub `*/5` cron is best effort. Delay, skip, cancellation, rate limits and backlog are possible. Do not advertise a guaranteed 300-second production wake from GitHub Actions.
- The existing **Systemia Core Resident Supervisor** now has an optional `kaidance-company-heartbeat` cycle service, cadence 300. It is **inactive until the owner provisions `SYSTEMIA_COMPANY_HEARTBEAT_OUT_DIR` and redeploys** the reviewed supervisor on admitted Evercraft-owned Compute. That directory must be private, durable and writable by the service user, not the read-only source checkout. No service restart, deployment, lease or public pulse was performed in this PR.
- The resident Kaidance mission publisher must be explicitly configured to ingest the same private snapshot root. The committed optional `systemia/collider/mission-sources.json` path is a source/default staging reference; a different private resident output location requires a matching private config before activation.
- The current `public/kaidance` observatory is a separately authorized projection. Do not project company-private receipts, worker state or customer information into it without the signed/revocable publication gate.
- Example local source proof (does not start a scheduler):
  `node systemia/organism/kaidance-company-heartbeat-runner.mjs --out artifacts/kaidance-company-heartbeat --prove-worlds`
- Unit tests:
  `node --test tests/kaidance-company-heartbeat.test.mjs`

## Next engineering phase: real continuous development
A company-wide loop should not indiscriminately execute all projects every 300 seconds. Each cycle should reconcile one canonical goal ledger and dispatch a bounded number of **fresh, dependency-ready** work leases. Implement with existing Systemia durable goal dispatcher and Saban capacity/admission, not a new privileged agent platform.

Required before enabling any new autonomous code-building adapter:
- Stable `mission_key / goal_key / work_key / dedupe_key`; owner, product, result criterion and explicit input evidence.
- Fresh source/release checks, memory preflight, dependency gating, maximum active work, CPU/token/time budgets and retry limits.
- Named adapter exists, side effects declared and a durable lease checkpoint saved **before** executing. No replays of uncertain remote effects.
- Changes occur on isolated branches with tests and reviewable PRs. Never allow a raw model output to directly rewrite `main`, publish, spend, email, access private customer data, or alter security authority.
- Reconcile independently verified execution receipts back into the one Systemia goal and then into the next Kaidance heartbeat. Idle or failed jobs must **not** count as progress.
- Product onboarding should include **unpublished research and internal projects**, not just the public 69-product index. The current coverage count is explicitly a **partial company inventory**, not proof all Evercraft work is connected.

Target: a heartbeat that knows what changed, which job moved, what actually shipped and what needs a next bounded action, without an ungoverned five-minute churn machine.


## Admitted-goal bridge: optional on the existing resident service

The existing 300-second kaidance-company-heartbeat service now accepts
--goal-file from SYSTEMIA_KAIDANCE_GOAL_STATE_FILE. This is NOT a new scheduler.
Only an already-admitted Systemia goal state file can supply work, so public
product inventory is never converted into automatic execution authority.

Initial bounded work type: worlds-source-proof. It checks the current Worlds
source fingerprint against a newly executed successful company heartbeat
Worlds test no older than fifteen minutes. If exactly one task is dependency
ready, not gated, and not previously attempted, the preexisting durable goal
dispatcher persists its execution checkpoint BEFORE invoking the adapter.
A successful read-only task receives an evidence reference and terminal goal
state. Another heartbeat cannot rerun the already completed work. Missing
proof, stale sources, paid/provider work and unapproved tasks fail closed.

The bridge creates goal-dispatch.json and goal-mission-snapshot.json inside
the existing heartbeat output directory, and the existing frontier mission
fabric consumes that snapshot as an optional source. A completed read-only
goal task is NOT autonomous engineering, deployment, payment, publication,
live Saban execution or a customer outcome.

### Owner runtime activation

1. Verify the existing Systemia Core resident supervisor/service state on the
   admitted owned node. GitHub Actions does not deploy Penguin/NextGen.
2. Use the existing Systemia goal-cli to admit an exact private goal plan.
   The goal file must be outside the repository checkout and mode 0600.
   Never commit the goal ledger, private provider credentials or approval keys.
3. Provision SYSTEMIA_COMPANY_HEARTBEAT_OUT_DIR as private durable storage
   and SYSTEMIA_KAIDANCE_GOAL_STATE_FILE in the private supervisor environment.
   Retain the SINGLE existing Kaidance resident service and its 300s cadence.
4. Check consecutive resident invocations and the goal ledger's revision,
   attempt, task state and receipt references. Configure the existing private
   resident mission publisher to ingest the optional admitted-goal snapshot
   from the same private output directory. Source CI is not owned runtime.
5. Future state-changing Saban, code-writing, Clip and Payments adapters
   require their own explicit capability admission, signed approval where
   necessary, independent outcome verification and no uncertain replay.

Test gate:
node --test tests/kaidance-company-heartbeat.test.mjs tests/kaidance-goal-advance.test.mjs

No private goal file or resident deployment is provisioned by this source
change. The default CI receipt is an explicit private_goal_not_configured hold.
