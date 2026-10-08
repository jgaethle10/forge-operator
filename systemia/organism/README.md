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


### Read-only mission freshness

`goalSnapshot` recomputes readiness from persisted tasks without changing mission state. The snapshot's `updated_at` reflects the **last persisted write or heartbeat**, not the instant an operator requested status. This prevents status polling from fabricating fresh-looking progress or masking stalled missions. Complementary postflight monotonicity is enforced by the durable dispatcher. Neither invariant establishes a provider-confirmed customer outcome.

### Signed human-gate authorization

A string such as `human:approved` is **not authorization**. For a task with `human_gate_required`, Systemia now needs a signed, bounded human-approval envelope (Ed25519) whose canonical claims bind to the exact `mission_key`, `goal_key`, `work_key`, `systemia.goal.authorize` scope, receipt reference, and issue/expiry times (maximum 24 hours). Signing credentials are **not** part of this repository; an authorized approval issuer must own and protect the private key.

A trusted supervisor must provision `EVERCRAFT_SYSTEMIA_APPROVAL_PUBLIC_KEY_PEM` securely at the goal CLI's runtime. The CLI pins this to the signer ID `systemia-human-gate-v1`. The caller supplies only the signed envelope JSON; its own public key or a free-form approval reference is never a trust anchor. Without configured trust, gated execution fails closed.

```bash
npm run goal -- authorize ./state/mission.json gated-work ./signed-human-approval.json
npm run goal -- start ./state/mission.json gated-work
```

The signature is verified once at authorization and **again at dispatch**, preventing an expired persisted claim from authorizing new execution. The goal planner also force-enables human gates for consequential work types from the Systemia control-plane contract: `trust_change`, `external_message`, `outreach`, `external_purchase`, and `payment`, even if a caller submits `human_gate_required:false`. It also forces the gate whenever the task declares one of the contract's consequential impacts (financial obligation, legal, employment, safety, trust-boundary, destructive release, messaging, purchase, and related actions), even when the work type is `execute`. The file-based CLI does not itself generate approvals or appoint new issuers. This protects the local Systemia goal gate only; Passport, interaction preflight, payment, deployment, and other product-specific authorities still apply independently. External signer provisioning, revocation, credential rotation, and production deployment are not asserted as complete by these source tests.

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

### Read-only provider refetch collector (source integration seam)

`goal-provider-refetch.mjs` provides `refetchAndStoreProviderObservation`, a bounded **privileged-runtime** library for an owner-audited provider adapter. It requires a matching, pinned attempt/provider and signer before invoking `adapter.refetchAttempt`; the callback must return a scoped lookup observation correlated to the exact attempt. Positive `completed` claims require a correlated provider record reference and completed status. A canonical hash of bounded provider evidence is signed in the existing Ed25519 observation envelope, then persisted under the existing revision lock. Only the hash, opaque provider receipt reference, signer identity and limited status survive in mission state, never raw upstream response bodies or bearer tokens. An ambiguous `not_found`, `unknown`, timeout, or callback failure **never** authorizes replay. If the hold changes during the lookup, the final CAS mutation rejects the stale observation.

**Source-to-production boundary:** This contract does NOT instantiate a real provider HTTP client, discover usable provider credentials, certify GET-only behavior, guarantee upstream eventual consistency or authenticate provider-issued signatures. The `read_only` adapter declaration is not a sandbox. An owned runtime must supply its own audited credentialed read-only adapter, managed signer key, rotating/revocable trust anchors, upstream operation correlation and real canary evidence before any production reconciliation can be claimed. The test fixtures use ephemeral keys and mock lookups. No actual financial, publishing, customer, provider or recovery disposition action is executed by the collector.

### Signed provider observations for interrupted work

After a stale attempt is quarantined, a provider-specific privileged observer can independently refetch the upstream outcome and issue a **signed observation**. The original goal plan must explicitly set `provider_key`, which Systemia pins as `attempt_provider_key` at execution start. A signer cannot invent an absent provider or substitute another one after a crash. Capability adapters must now declare the matching `provider_key`; a mismatch (or missing provider identity) holds the task before dispatch, without incrementing its attempt. Systemia's new `goal-provider-observation.mjs` verifies Ed25519 message integrity and the runtime-configured trusted observer, exactly bound to the mission, goal, work, attempt, attempt key and provider. The envelope includes an opaque provider lookup receipt reference, hash of the fetched response, bounded timestamps (10-minute maximum validity), an `authenticated_provider_refetch` method claim, and an attested outcome (`completed`, `not_found`, or `unknown`).

**Truth boundary:** a valid signature proves which configured observer made a claim. It does not independently prove that the observer truly contacted the provider, that the provider guarantees finality, or that a charge, publication, or message actually completed. In particular, `not_found` is never interpreted as permission to retry. Even a signed `completed` observation leaves the task `blocked`, the effect state `unknown`, `producer_outcome_verified:false`, and `auto_replay_allowed:false`; further outcome acceptance or replay requires a separately designed authenticated provider-specific disposition process. The raw provider payload is not stored in the goal file.

Operator-only read and state-update surfaces (no dispatch):

```bash
npm run goal -- recovery-scan ./state/mission.json 3600000
npm run goal -- recovery-observe ./state/mission.json work-key 1 ./signed-provider-observation.json
```

The privileged goal runtime must provision `EVERCRAFT_SYSTEMIA_PROVIDER_OBSERVER_PUBLIC_KEY_PEM` and `EVERCRAFT_SYSTEMIA_PROVIDER_OBSERVER_PROVIDER_KEY` through managed configuration, with key ID `evercraft-provider-observer-v1`. No signer private key is generated or committed. Missing keys, forged/expired envelopes, wrong provider identity, changed attempts and replayed observations fail closed. Signed observations remain local source/file adapter evidence until a real provider lookup adapter, credential protection, signer rotation/revocation, durable Lineage sync and production acceptance are independently verified.

### Attempt-fenced result recording

Every `recordGoalOutcome` call now requires `expectedAttempt` and must match the currently persisted task attempt. This applies to completion, blocking, skip and retry. CLI callers supply the attempt number immediately after `result`, and capability adapters forward the attempt issued by `startGoalWork`. A late result from attempt 1 can never complete or retry a task already executing attempt 2. File-store optimistic revision checks still apply separately. This source invariant does **not** verify provider outcomes or authorize replay after crash quarantine.

### Skipped work cannot satisfy dependency or completion proof

A task recorded as `skipped` is terminal for that attempt but **not** equivalent to a successful prerequisite or achieved objective. `refreshGoal` requires dependencies to be `complete` before marking downstream work ready. Skipped predecessors explicitly block dependents and prevent mission-completion receipts, even if all other steps were completed. Independent ready tasks may continue without hiding the unresolved obligation. Optional tasks need separately authorized explicit success semantics, not a free-form skip receipt.

### One-time plan admission and replay guard

`admitGoalPlan` is only for a previously unplanned goal. Replacing admitted tasks would erase in-flight or completed attempt data, receipts and approvals, allowing replay of consequential operations. Repeated or changed `goal-cli plan` requests now fail closed, including after completion or process restart. Plan amendments require a future separately authorized append-only mechanism which retains attempts and task lineage; the current CLI does not allow destructive replacement. This local invariant does not by itself prove production exactly-once external side effects.

### Volatile capability execution is read-only only

The legacy `executeGoalWorkWithAdapter` helper does **not** persist `startGoalWork` before the callback, so it may only execute an ungated adapter explicitly classified as `read-only`. It fails closed with `durable_dispatch_required` for all non-read-only adapters, all adapters declaring a human gate, and all goal tasks with a human gate, even if a valid signed approval is present. The hold includes `durable_checkpoint_persisted:false` and does not change the mission state or invoke the callback. Provider identity mismatches still fail before dispatch. To execute state-changing or gated work, use the explicit file-backed `executePersistedGoalWork` path, and only after independent operational authorization and adapter controls.

`read-only` is a developer-declared capability classification, **not** a security sandbox or cryptographic proof of harmless callback code. Only vetted adapters with no externally observable mutation should use that path. Neither in-memory execution nor a synthetic callback receipt establishes production delivery or independently verified outcomes.

### Durable pre-dispatch execution checkpoint

`goal-durable-dispatch.mjs` provides an **explicit**, operator-invoked file-backed adapter execution path. It validates registry and provider eligibility, and requires a matching signed human-gate contract before invoking any non-read-only adapter. It then commits a `startGoalWork` revision to the local goal store **before** calling `adapter.execute`. This prevents crashes in the adapter from leaving the persisted state looking like work was never started. Concurrent requests for the same work cannot both start a second attempt through the same local file state. The disk CAS and `attempt_key` fences remain in force.

Postflight recording always captures a fresh completion clock after the adapter returns, then clamps that timestamp to the latest persisted task heartbeat inside the state mutation. This prevents a delayed callback from rewinding `updated_at` after a concurrent heartbeat. The durable-dispatch receipt includes `outcome_recorded_at`; the accepted attempt number and attempt key are rechecked inside the same CAS transaction. A host clock skew or late callback never authorizes re-dispatch or bypasses the recovery hold.

After execution, a strictly declared local **read-only** adapter may complete from its bounded source receipt, but its output does not establish production deployment or independently verified provider outcomes. Every external/bounded/human-confirmed adapter outcome, including self-reported success, exception, retry and skip, is conservatively quarantined as `effect_state:unknown` pending source-specific authenticated reconciliation. This includes the case where an upstream action succeeded but its acknowledgment was lost. No automatic retry or human-authority bypass occurs. If the process dies before it can persist its final outcome, the checkpoint remains `executing` and the existing stale-attempt recovery scanner can identify it.

This local library **does not** create a resident worker supervisor, distributed exactly-once dispatch, production deployment, durable Lineage remote receipt, or customer/payment verification. Runtime-specific adapters still require independent authorization, credentials, observation, and secure deployment. Tests use synthetic adapters only.

### Durable file adapter and CLI

`goal-store.mjs` provides an atomic JSON-file persistence adapter with optimistic revision checks. It is intentionally storage-simple so Yard Operator or another runtime adapter can swap in a database later without changing the goal-state contract. The file adapter survives process and chat boundaries and rejects stale writers instead of silently overwriting newer mission state.

Concurrent writers now take a cross-process exclusive `<state-file>.lock` directory before checking the stored revision and atomically replacing the JSON. Only one writer can commit a given revision; competing writers must reload the latest goal and retry their *decision*, not replay the old state. An existing lock fails closed. If a worker crashes leaving an orphaned lock, the owning operations supervisor must first verify no writer is alive and inspect the saved JSON before explicitly removing that specific lock directory. Do not implement blind age-based lock deletion or assume a file rename is a verified customer outcome. This adapter protects local file coordination; it does **not** establish multi-host consensus or durable Lineage production persistence.

`goal-cli.mjs` exposes the runtime as a small operator surface:

```bash
npm run goal -- init ./state/customer-goal.json customer-goal "Finish the requested outcome"
npm run goal -- plan ./state/customer-goal.json ./plan.json
npm run goal -- status ./state/customer-goal.json
npm run goal -- authorize ./state/customer-goal.json gated-work ./signed-human-approval.json
npm run goal -- start ./state/customer-goal.json work-key
npm run goal -- outcome ./state/customer-goal.json work-key complete 1 exec:receipt "" evidence:ref
npm run goal -- receipt ./state/customer-goal.json acceptance:ref
```

The CLI does not create new external authority. It only persists and advances work that the goal runtime already admits.
