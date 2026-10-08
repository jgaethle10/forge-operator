# Systemia Organism Runtime

This directory contains the provider-independent coordination kernel for Evercraft's **one-organism** operating model.

The design target is not "many agents that cooperate." It is one mission nervous system with many temporary hands.

```
objective
  -> shared mission state
  -> authority / human gates
  -> fresh memory check
  -> duplicate suppression
  -> complementary role assignment
  -> bounded execution
  -> observed reconciliation
  -> coordination receipt
  -> next collective motion
```

## Boundaries

**GitHub is durable source.** The organism kernel is committed and verified here.

**Yard Operator / Evercraft Compute are runtime.** The kernel must not require Base44 authentication or a Base44-specific data model.

**Saban is elastic musculature.** NodeSeeds and logical agents may scale execution capacity, but they do not become independent mission authorities. Every admitted unit of work still belongs to one canonical mission state.

**Memory is time-bounded.** An agent whose contract requires memory preflight cannot receive ordinary work if its memory state is stale, unknown, blocked, or outside its freshness window. Memory-repair work is deliberately exempt so the organism cannot deadlock while healing itself.

**Human gates survive orchestration.** Consequential money, legal, safety, employment, trust-boundary, and explicitly founder-gated actions remain held until the relevant human authorization exists.

## Kernel

`kernel.mjs` is dependency-free and storage-agnostic. Runtime adapters provide persisted mission state, work ledgers, memory state, leases, execution receipts, and deployment receipts.

The kernel owns these invariants:

1. one canonical `mission_key` per coordinated body;
2. shared state is read before work lease/execution;
3. equivalent active or sufficiently evidenced terminal work is suppressed;
4. stale required memory holds ordinary execution;
5. memory repair remains admissible;
6. unresolved human gates hold execution;
7. completion is not accepted until observed postflight reconciliation emits a coordination receipt;
8. coherence is never promoted green from configuration or silence.

## Proof

Run:

```bash
npm run proof:organism
```

The deterministic proof exercises:

- stale-memory hold;
- memory-repair exemption;
- duplicate suppression;
- human-gate preservation;
- 100 logical "fingers" sharing one mission state;
- successful reconciliation to green;
- failed reconciliation back to amber.

This proof is source/runtime-kernel evidence only. It does not by itself prove a production Yard deployment. Production promotion still requires the repository release contract: CI pass, immutable artifact, Yard deployment, live route/runtime verification, and a deployment receipt.

## Persistent goal runtime

`goal-runtime.mjs` adds a serializable, provider-independent outcome loop on top of the organism model. A goal can be planned into dependency-aware work, paused, persisted by a runtime adapter, resumed after the original chat or worker is gone, held at explicit human gates, retried after observed blockers, and completed only with evidence or execution receipts.

Planning and continuity are separate from capability availability. Phone calls, advertising, payments, publishing, or other consequential actions may enter a goal plan only when a real adapter exists, and their existing human or product-specific gates remain authoritative.

Run `npm run proof:goal-runtime` for the deterministic continuity proof, or `npm run proof:systemia` for the full organism plus goal-runtime proof set.


### Interrupted work and safe recovery holds

A persisted task can remain `executing` after its worker disappears. This does **not** prove that an external action failed. Systemia now persists an attempt-specific deduplication key and heartbeat, and exposes a conservative recovery inspection. Inspection only classifies stale work as **suspected interruption**. Nothing is automatically resent, published, charged, or retried.

The local operator flow is:

```bash
npm run goal -- heartbeat ./state/mission.json work-key 1
npm run goal -- recovery-scan ./state/mission.json 3600000
npm run goal -- recovery-hold ./state/mission.json work-key 1 2026-10-07T12:00:00.000Z 3600000
```

A recovery hold uses both expected attempt number and last heartbeat time, validated against the current goal state. If anything changed, the hold fails without overwriting newer work. A held task keeps its attempt identity and becomes `blocked` with `effect_state: unknown`. Ordinary `outcome ... retry` cannot clear it. This is deliberately a **quarantine**, not autonomous replay; an authenticated source-specific outcome-reconciliation adapter and separately authorized release operation remain future requirements. A stale heartbeat alone does not prove a worker is dead. Only call `recovery-hold` after checking the owner/worker and relevant source operation.

This local adapter is neither a multi-host distributed lease nor evidence of production resident scheduling. The completion and authority gates stay independent.

### Single-admission goal plans and replay protection

`admitGoalPlan` only accepts a previously unplanned goal (`status: planning` and no tasks). A second `goal-cli plan` call is **not** an edit operation: resetting tasks could erase completion receipts or make an already sent message, purchase, or deployment eligible for another execution. Attempts to re-admit the same or a different plan now fail closed without changing local persisted state. Genuine amendments must use a separately designed, explicitly authorized append-only plan-revision operation that preserves existing task IDs, attempts, dependencies, and evidence; this PR does not introduce that operation. A successful source regression test is not a production distributed-consensus or exactly-once side-effect guarantee.

### Durable file adapter and CLI

`goal-store.mjs` provides an atomic JSON-file persistence adapter with optimistic revision checks. It is intentionally storage-simple so Yard Operator or another runtime adapter can swap in a database later without changing the goal-state contract. The file adapter survives process and chat boundaries and rejects stale writers instead of silently overwriting newer mission state.

Concurrent writers now take a cross-process exclusive `<state-file>.lock` directory before checking the stored revision and atomically replacing the JSON. Only one writer can commit a given revision; competing writers must reload the latest goal and retry their *decision*, not replay the old state. An existing lock fails closed. If a worker crashes leaving an orphaned lock, the owning operations supervisor must first verify no writer is alive and inspect the saved JSON before explicitly removing that specific lock directory. Do not implement blind age-based lock deletion or assume a file rename is a verified customer outcome. This adapter protects local file coordination; it does **not** establish multi-host consensus or durable Lineage production persistence.

`goal-cli.mjs` exposes the runtime as a small operator surface:

```bash
npm run goal -- init ./state/customer-goal.json customer-goal "Finish the requested outcome"
npm run goal -- plan ./state/customer-goal.json ./plan.json
npm run goal -- status ./state/customer-goal.json
npm run goal -- authorize ./state/customer-goal.json gated-work authorization:ref
npm run goal -- start ./state/customer-goal.json work-key
npm run goal -- outcome ./state/customer-goal.json work-key complete exec:receipt "" evidence:ref
npm run goal -- receipt ./state/customer-goal.json acceptance:ref
```

The CLI does not create new external authority. It only persists and advances work that the goal runtime already admits.
