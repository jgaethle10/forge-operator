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
- `scheduler.mjs`: bounded physical worker pool with retry/rebind semantics.
- `kernel-proof.mjs`: recovery, 10,000-agent planning and media-sharding proof.
- `../chum/saban-adapter.mjs`: CHUM product-discovery adapter.
- `chunk-adapter.mjs`: neutral bounded shard adapter for product-specific executors.

## Allocation doctrine

Saban distinguishes logical agents from physical workers. A formation can contain 10,000 logical agents without launching 10,000 operating-system processes. Logical work is leased over a bounded worker pool.

For contracts using `role_item_cartesian`, Saban covers every role × work-item pair before beginning duplicate passes. This prevents random hash allocation from leaving important roles or shards untouched.

## Failure doctrine

Workers hold time-limited leases. If a worker disappears, the job returns to the queue after lease expiry unless its retry budget is exhausted. Checkpoints and work state are serializable and can be written atomically so another runtime can resume the formation.

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
npm run proof:saban-kernel
npm run proof:saban-chum
npm run proof:saban-media
```

Run the discovery watershed:

```bash
npm run saban:watershed
```

## Publication and authority boundary

Inventory is not publication. Finding a product does not automatically expose it. Public discovery still requires admission to the public product directory with canonical URLs, truthful intents, authority, boundaries and the correct human-confirmation rules.

Internal/admin surfaces, credentials, customer data, private topology and undeclared side effects stay outside public multiplication and distribution.
