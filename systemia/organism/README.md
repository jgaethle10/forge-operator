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


### Durable file adapter and CLI

`goal-store.mjs` provides an atomic JSON-file persistence adapter with optimistic revision checks. It is intentionally storage-simple so Yard Operator or another runtime adapter can swap in a database later without changing the goal-state contract. The file adapter survives process and chat boundaries and rejects stale writers instead of silently overwriting newer mission state.

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
