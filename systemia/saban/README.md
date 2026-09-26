# Saban

Saban is Evercraft's portfolio-scale admission, multiplication, scheduling and reconciliation layer. It can multiply a registered software capability into bounded logical workers while keeping physical concurrency, side effects, retries and publication rules under explicit contracts.

```
request
  -> contract lookup
  -> admission + budget gate
  -> partition / shard
  -> formation recommendation
  -> logical-agent allocation
  -> leased physical worker pool
  -> heartbeat / checkpoint / retry / rebind
  -> adapter execution
  -> reconciliation
  -> receipt
```

CHUM is the first discovery-scale consumer. Media fanout is the second proof lane. The same kernel is intended for other Evercraft software once each product declares a safe multiplication contract and adapter.

## Core modules

- `multiplication-registry.json`: software contracts, limits, roles, scaling strategy and side-effect boundaries.
- `multiplier.mjs`: command-line orchestrator and generic logical-agent planner.
- `admission.mjs`: validates contracts and grants bounded swarm resources.
- `autoscaler.mjs`: recommends logical and physical formations from workload and telemetry.
- `work-state.mjs`: leased job state, checkpoints, retries, dead-letter state and atomic persistence.
- `scheduler.mjs`: bounded physical worker pool with retry/rebind semantics, stable idempotency keys and execution timing.
- `quality-gate.mjs`: fail-closed contract quality checks for completion, roles, reconciliation, source integrity and product-specific requirements.
- `nodeseed-pool.mjs`: authenticated distributed worker pool with capacity/service placement, retry and node failover.
- `distributed-executor.mjs`: runs ordinary Saban plans across NodeSeed capacity without changing product adapters.
- `private-inventory.mjs`: strips private source identifiers before portfolio-inventory work enters Saban state or receipts.
- `portfolio-archaeology-adapter.mjs`: classifies private portfolio candidates into known public, likely alias, placeholder, internal-only, commercial-candidate and review lanes without publishing them.
- `kernel-proof.mjs`: recovery, 10,000-agent planning, persistence, autoscaling, idempotency, timing and media-sharding proof.
- `formation.mjs`: dependency-wave multi-software swarm orchestration. Independent nodes execute concurrently; dependent nodes wait for their declared prerequisites.
- `spawn-broker.mjs`: governed recursive child-swarm admission with depth, count, dedupe and total-agent limits.
- `registered-worker.mjs`: safe worker entrypoint that accepts only software already registered for multiplication.
- `contract-doctor.mjs`: validates contracts, budgets, adapters and scaling rules before CI passes.
- `../chum/saban-adapter.mjs`: CHUM product-discovery adapter.
- `chunk-adapter.mjs`: neutral bounded shard adapter for product-specific executors.

## Allocation doctrine

Saban distinguishes logical agents from physical workers. A formation can contain 10,000 logical agents without launching 10,000 operating-system processes. Logical work is leased over a bounded worker pool.

For contracts using `role_item_cartesian`, Saban covers every role × work-item pair before beginning duplicate passes. This prevents random hash allocation from leaving important roles or shards untouched.

## Distributed execution

Evercraft Compute NodeSeed exposes `saban.multiplier-assignment.v1`. A NodeSeed may execute a Saban assignment only through an authenticated capacity lease and only through `registered-worker.mjs`. The request names a registered software ID rather than an arbitrary code path. The registry resolves the adapter, contract validation runs again at the worker boundary, and the NodeSeed returns both a Saban worker receipt and an Evercraft Compute receipt.

This connects Saban's logical-agent model to NodeSeed capacity discovery without turning NodeSeed into a generic remote shell.

Node placement is capability-aware. Contracts may require minimum CPU/memory, executables such as `ffmpeg`, and named services. ForensiScope requires both the media toolchain and a configured transcription service before Saban will place its work on a NodeSeed. A node that can inspect media but cannot satisfy the full contract is rejected rather than partially admitted.

Each logical assignment has a stable idempotency key. The key crosses local retries, registered-worker receipts, NodeSeed checkpoints and failover so a rebound worker can prove it is continuing the same logical operation. Local and distributed receipts also record execution timing, including measured-job counts, average duration and p95 duration.

## Recursive formations

A Saban formation is a dependency graph of software swarms. Nodes may use different software contracts, logical-agent counts, worker pools and reconciliation rules. Saban executes the graph in dependency waves, so unrelated work can run concurrently instead of waiting in a global serial line. The spawn broker can admit child formations, including additional CHUM formations, while enforcing maximum depth, child count, per-child size, global logical-agent budget and deduplication.

The spawn broker currently governs child admission and accounting. Automatic recursive execution of admitted child requests is intentionally separate from broker admission and must not be inferred merely because a child request was accepted.

## Failure doctrine

Workers hold time-limited leases. If a worker disappears, the job returns to the queue after lease expiry unless its retry budget is exhausted. Checkpoints and work state are serializable and can be written atomically so another runtime can resume the formation.

## Portfolio archaeology

Inventory is not publication. Saban may accept a private runtime inventory through the `portfolio-archaeology` contract, but source identifiers are stripped before the records enter work state. The archaeology swarm fingerprints source records, checks public-name and alias similarity, detects placeholders and duplicate inventory names, and produces an admission queue. It performs zero public discovery changes by contract.

This gives CHUM a discovery-before-admission lane without treating every old app, internal tool, alias or experiment as a public product.

## ForensiScope multiplication

ForensiScope is a registered Saban software contract rather than a generic media demo. The private execution lane:

- requires explicit source authorization and SHA-256 source identity;
- creates lossless, content-addressed time shards for remote NodeSeeds instead of forwarding private source paths;
- runs media probing, keyframe timeline extraction, exact and perceptual duplicate review, audio preparation, transcription and provenance checks in parallel;
- reconciles overlap-aware transcript segments and timestamps;
- verifies source/derivative integrity before the quality gate passes;
- produces a deterministic evidence graph and LLM evidence projection from the reconciled result;
- keeps public machine intake disabled until its independent security and commerce gates are actually cleared.

Transcription is an operator-configured executable contract. CI proves the interface and distributed stitching with a deterministic test engine. That proof does not imply that a specific production speech provider is installed or endorsed.

## Scaling doctrine

`coverage_amplification` is appropriate when repeated independent passes improve discovery or coverage, such as CHUM.

`work_conserving` is appropriate when the useful parallelism is bounded by actual shards, such as long-media processing.

Autoscaling can increase physical workers under queue or latency pressure and apply backpressure when failure rates rise.

## Commands

Check approved public-product discovery:

```bash
npm run saban:discovery:check
```

Generate approved discovery mirrors:

```bash
npm run saban:discovery
```

Plan a 10,000-logical-agent CHUM formation:

```bash
npm run saban:chum:10000
```

Run the generic multiplier:

```bash
npm run saban:multiply -- --software chum --auto
```

Execute and persist state:

```bash
npm run saban:multiply -- --software chum --auto --execute --state artifacts/saban-multiplier/chum-state.json
```

Resume persisted work:

```bash
npm run saban:multiply -- --software chum --auto --execute --resume --state artifacts/saban-multiplier/chum-state.json
```

Run kernel proofs:

```bash
npm run check:saban-contracts
npm run proof:saban-kernel
npm run proof:saban-chum
npm run proof:saban-media
npm run proof:saban-formation
npm run proof:saban-formation-waves
npm run proof:saban-portfolio-archaeology
npm run proof:saban-nodeseed-multiplier
npm run proof:saban-nodeseed-pool
npm run proof:forensiscope-security
npm run proof:forensiscope-artifact-return
npm run proof:forensiscope-distributed
```

Run the discovery watershed:

```bash
npm run saban:watershed
```

## Publication and authority boundary

Inventory is not publication. Finding a product does not automatically expose it. Public discovery still requires admission to the public product directory with canonical URLs, truthful intents, authority, boundaries and the correct human-confirmation rules.

Internal/admin surfaces, credentials, customer data, private topology and undeclared side effects stay outside public multiplication and distribution.


## Retry and lease safety

Registered Saban assignments carry an idempotency identity across local and NodeSeed execution. NodeSeed seals completed assignment records inside its private compute root, reuses the original result on retries, preserves that decision across a NodeSeed restart, and rejects reuse of one idempotency key for different logical work. Corrupted durable idempotency records fail closed rather than silently causing a second execution.

Distributed NodeSeed pools actively renew supported capacity leases while work is running. Requested lease TTL is sized against the assignment timeout, renewal outcomes are included in the pool receipt, and renewal timers plus leases are always released in a finally path.

## ForensiScope source boundary

ForensiScope authorized-source admission resolves canonical filesystem paths before containment checks. Existing media sources must remain inside admitted real roots, direct symlink sources are rejected, parent-directory symlink escapes are blocked, source SHA-256 identity is enforced, and a configurable source byte ceiling is applied before execution. These controls do not enable public machine intake; that remains a separate verification gate.


## Portable artifact return

Registered workers may declare bounded artifacts with an artifact ID, SHA-256 identity, size, extension, and media type. NodeSeed validates that the produced file is inside the lease-scoped worker artifact root, verifies its digest and byte count, copies it into a private content-addressed store, and removes the node-local path from the durable worker receipt.

The coordinator retrieves granted artifacts through the authenticated lease before release, streams them while recomputing SHA-256, verifies the byte count, stores them under its own artifact-return root, and rehydrates the result with a coordinator-local path. Durable idempotency replay can re-grant an existing content-addressed artifact after a NodeSeed restart without re-running the software adapter. Missing or corrupt durable artifacts fail closed.

ForensiScope uses this lane for prepared audio artifacts so distributed media reconciliation does not depend on a shared filesystem or a remote worker path.


## Failure classification

NodeSeed pool failures are classified before retry or quarantine decisions. Transport failures and node-service failures may quarantine capacity for the current run and can be retried on remaining eligible nodes. Expired or invalid leases disable only that leased node for the current run without asserting that the underlying device is unhealthy. Deterministic workload rejection, including an idempotency-key conflict, is non-retryable and does not poison otherwise healthy capacity. Integrity failures fail closed and quarantine the affected node.

Pool receipts expose failure_class, retryable, node_quarantined, and node_disabled_for_run on failed assignments and events. Node summaries distinguish healthy_at_end from available_at_end so lease exhaustion is not mislabeled as hardware or runtime failure.
