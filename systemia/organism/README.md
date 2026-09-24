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
