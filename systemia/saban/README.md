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

## Hardware federation

Saban can compose a workload from multiple **explicitly authorized** Evercraft Compute machines instead of waiting for one perfect host.

The federation planner treats each machine as bounded role-local capacity. CPU, memory and storage are never fictionally merged into one process. A role must fit on one node. Different roles may be placed on different nodes, which allows a small gateway to own public ingress while a stronger machine carries browser or media work.

For Control Room, the deployable pattern is:

```
small field-certified gateway
  -> public HTTPS / Fabric
  -> loopback federated service bridge
  -> encrypted outbound-capacity broker
  -> authorized stronger browser NodeSeed
```

The remote machine opens no public listener. The broker mints a short-lived relay credential scoped to one verified resident service. The gateway never receives the remote node allocator secret. The relay cannot deploy workloads, browse the remote filesystem or pivot to another service.

Visibility is not authorization. Machines discovered on a LAN, Wi-Fi network, Bluetooth neighborhood or other ambient surface remain unusable until they are explicitly enrolled and attested into the Evercraft capacity fabric.

Run:

```bash
npm run proof:saban-hardware-federation
npm run proof:saban-hardware-federation-bridge
```

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


## Compute Exchange

Saban can now act as a buyer/router for physical compute rather than only consuming a preconfigured worker pool.

A compute request is normalized into `evercraft.saban.compute-demand.v1` with:

- workload class and optional container image;
- CPU, memory, storage and GPU requirements;
- placement and ingress constraints;
- trust floors;
- intended duration;
- cost ceilings;
- negotiation level: `discover`, `quote`, or `lease`.

The exchange asks multiple market adapters for offers and evaluates them under one policy. Zero-cost Evercraft capacity is preferred when it genuinely satisfies the workload. If owned/authorized capacity cannot satisfy the demand, Saban can continue into voluntary, partner, commercial or decentralized capacity markets instead of stalling.

### Current adapters

- `evercraft-broker`: connected NodeSeeds and outbound devices already admitted through Yard. Capacity is represented as zero-cost offers and the selected node is acquired through a receipt-bound control grant. Allocator authority remains runtime-only and is deliberately non-serializable.
- `akash`: public no-auth supply discovery through Akash's provider network-data API, plus a guarded managed-market path for creating an order, collecting provider bids and accepting a lease.

### Negotiation authority

Discovery is read-only.

Creating a market order requires a demand-scoped `evercraft.saban.compute-authority.v1` with quote approval and `allow_market_orders=true`.

Creating a paid lease requires a separate approved authority for the same demand, an allowed-market match, an expiry check, `allow_spend=true`, and a hard total-cost ceiling. The Akash adapter additionally requires an explicit `uact/block` ceiling before it will open a bid round.

Unleased quote orders are closed after the negotiation round instead of being left dangling.

### External-market truth boundary

The repository does not contain market API keys, wallets or billing credentials. Public Akash supply discovery is live and requires no authentication. The order/bid/lease path is implemented but cannot truthfully claim a paid lease was created unless a runtime supplies valid market credentials and demand-scoped spend authority.

This keeps Saban capable of negotiating real compute without silently turning visibility into authorization or code execution into an open-ended purchasing permission.


## Zero-spend ambient compute doctrine

Production placement defaults to **zero spend**. Commercial capacity may be discovered so Systemia knows what exists, but it is visibility-only unless an operator explicitly enables commercial placement and separately grants demand-scoped spend authority.

The default search order is:

```text
healthy owned/authorized Evercraft nodes
  -> authorized ambient device capacity
  -> voluntary zero-cost capacity with declared terms
  -> hold and report missing capacity
  -> commercial capacity only after explicit opt-in
```

Saban does not require every useful device to become a general-purpose server. An authorized device may advertise a narrow set of registered workloads through `evercraft.ambient-capability.v1`. The ambient compute adapter turns those declarations into zero-cost compute offers without granting arbitrary code execution.

Examples of useful micro-node classes include owned/authorized smart appliances, routers, NAS devices, old phones, TVs, kiosks, vehicle computers, SBCs, and other embedded systems whose hardware and firmware permit a compatible adapter. A refrigerator-class device might carry health probes, sensor relay, queue relay, telemetry normalization, content hashing, cache fragments, or bounded chunk transforms. Larger stateful workloads still require a node that actually satisfies their CPU, memory, storage, persistence, and network contracts.

Visibility is never authorization. Seeing a device on Wi-Fi, Bluetooth, LAN, USB, or another ambient surface does not make it usable. Active compute requires an owner/authorization reference or voluntary-compute terms plus a compatible endpoint. Public/open protocols remain read-only unless their protocol explicitly declares an allowed passive operation.

The zero-cost ambient adapter lives at:

```text
systemia/saban/ambient-compute-fabric.mjs
```

and production capacity planning defaults to zero-spend in:

```text
systemia/saban/production-capacity-plan.mjs
```

Commercial placement must be explicitly enabled with `SABAN_ALLOW_COMMERCIAL_CAPACITY=1`, and that switch alone still does not authorize a market order or spend.


## Ambient Fabric + MicroSeed

Saban now treats useful infrastructure as a **capability fabric**, not only as a pool of conventional servers.

The zero-spend resident path is:

```text
passive census
  -> observed device candidate
  -> explicit owner authorization
  -> MicroSeed manifest
  -> fresh heartbeat / attestation
  -> capability compilation
  -> workload anatomy
  -> heterogeneous placement
  -> bounded execution
  -> receipt / checkpoint / replay
```

Core modules:

- `ambient-census.mjs`: passive LAN/mDNS/Bluetooth observation with raw identifiers hashed before persistence. Observation never grants authority.
- `ambient-device-trust.mjs`: expiring, revocable trust lifecycle with manifest-drift and identity-drift holds.
- `ambient-device-registry.mjs`: persistent local registry for trust records and MicroSeed manifests.
- `microseed-device-bridge.mjs`: distinguishes real native-device compute from gateway-bridged observation, storage, network, or actuation capabilities.
- `ambient-compute-fabric.mjs`: turns only truthful compute capabilities into bounded zero-external-spend compute offers.
- `capability-fabric-composer.mjs`: composes network ingress, egress, storage, observation, and other capabilities across different authorized devices.
- `heterogeneous-fabric-planner.mjs`: shards and places work across mismatched devices with privacy, freshness, duty-cycle, power, and failure-domain constraints.
- `workload-anatomy.mjs`: decomposes larger products such as RIVET/AliEV into tiny shards, stateful core services, integrity work, backups, and witnesses.
- `device-safety-envelope.mjs`: primary-function-first resource governor. The appliance/router/phone's normal job always outranks Saban work.
- `capacity-organism.mjs`: resident zero-spend cycle that recompiles what capacity is actually usable now and reports missing capacity instead of inventing it.
- `microseed-executor.mjs`: bounded registered-workload executor with stable idempotency and safety enforcement.
- `microseed-gateway.mjs`: loopback-first trust-aware gateway for local Saban execution.
- `microseed-native-agent.mjs` + `microseed-native-agent-adapter.mjs`: exact-device execution path for hardware that truly runs a native agent, with credentials isolated from manifests and receipts.
- `ambient-device-cli.mjs`: explicit authorization, revocation, heartbeat, and local device-credential operations.

### Truthful appliance participation

A refrigerator discovered through Matter is not called a compute node merely because a nearby gateway can talk to it. It may advertise observation capabilities such as temperature or door state. It becomes compute only when the device itself has a verified native execution path or a specifically declared remote-compute interface.

That distinction applies to routers, televisions, kiosks, vehicles, chargers, phones, appliances, SBCs, and other embedded hardware.

### Primary function always wins

Saban evaluates CPU slack, memory reserve, thermal ceiling, battery floor, power state, network load, telemetry freshness, and a primary-function busy signal before ambient work runs. Unsafe or stale capacity disappears from placement automatically.

“Zero spend” means zero external compute-provider cash spend. It does **not** claim that electricity or incremental device energy is free. Ambient receipts preserve `incremental_energy_cost_state = not_measured` until it is actually measured.

### Resident deployment

`scripts/install-saban-capacity-organism.sh` installs:

```text
evercraft-saban-capacity.timer
evercraft-saban-capacity.service
evercraft-saban-microseed-gateway.service
```

The capacity organism refreshes every two minutes by default. The MicroSeed gateway binds to `127.0.0.1:8791` and uses locally generated secrets under the Saban state directory. Commercial-capacity use remains disabled.

The Chromebook Fabric edge doctor also installs or repairs this Saban resident stack when run with `--repair`.


## Resident Learning, Dispatch, and Capacity Hunting

The ambient fabric is now a closed-loop resident system rather than only a planner.

```text
passive census
  -> candidate profiling
  -> explicit authorization
  -> credential enrollment
  -> device conformance
  -> safe calibration
  -> production eligibility
  -> product work intake
  -> performance-aware placement
  -> bounded execution
  -> signed receipt
  -> performance learning
  -> circuit breaker / healing
  -> backlog-shaped capacity hunt
  -> repeat
```

### Signed physical truth

Native MicroSeed devices can hold an Ed25519 private key locally. The manifest contains only the public verification key and key ID. Device execution receipts and device safety telemetry can both be signed. The gateway verifies the exact device identity and payload before using them. Result tampering, telemetry tampering, device-ID substitution, and missing required signatures fail closed.

`microseed-device-identity.mjs` creates and rotates device identities. Rotation archives prior public keys for historical receipt verification; current private material remains local and `0600`.

`microseed-native-bootstrap.mjs` creates a secret-safe native worker package containing the normalized manifest, local identity, bearer secret, state directory, and bootstrap receipt without printing the token or private key.

### Autonomous probation

`microseed-probation-organism.mjs` continuously advances devices that have already been explicitly authorized and credentialed. It cannot authorize a device or create a missing device credential.

It runs safe workload-specific conformance canaries, then bounded calibration samples. Failures enter exponential backoff instead of hammering the hardware. Conformance expires and is refreshed before production eligibility is trusted again.

### Product work intake and resident dispatch

Evercraft products can submit bounded jobs through `AmbientWorkQueue`, the CLI in `ambient-work-cli.mjs`, or the loopback-only authenticated API in `ambient-work-api.mjs`.

Submission authority is deliberately separate from MicroSeed execution-gateway authority. Jobs contain registered workload IDs and bounded JSON payloads, not arbitrary code.

`ambient-job-dispatcher.mjs` drains queued work through the current trusted zero-spend fabric. It resolves conformance-proven offers, applies privacy and resource requirements, uses learned device performance, executes through the MicroSeed gateway, persists checkpoints and receipts, retries with backoff, and dead-letters after the bounded retry budget.

The resident installer now maintains:

```text
evercraft-saban-capacity.timer
evercraft-saban-microseed-gateway.service
evercraft-saban-work-api.service
evercraft-saban-probation.timer
evercraft-saban-dispatch.timer
```

The Chromebook Fabric edge doctor requires and repairs the same resident set.

### Performance memory and circuit breaking

Saban learns per-device, per-workload latency, reliability, recent success rate, consecutive failures, preemption rate, thermal holds, throughput, and measured energy when actual power telemetry exists.

Three consecutive failures, sufficiently poor recent success, or repeated thermal holds can open a performance circuit and temporarily remove the device from placement. This does not revoke owner authorization. Later successful probation/calibration samples can close the circuit and restore eligibility.

Placement uses the exact MicroSeed device identity for learned performance. Plan stickiness prevents churn when a merely slightly better device appears, while failed or ineligible capacity forces checkpoint-aware migration.

### Backlog-shaped capacity hunting

`ambient-demand-radar.mjs` summarizes live queued, held, and retrying work into exact workload/resource demand. It preserves private-data requirements and distinguishes the minimum single-execution shape from preferred parallel capacity.

`ambient-capacity-hunt.mjs` matches that demand to passive compute candidates visible in the local census. A passive SSH/general-compute sighting may become an enrollment lead, but Saban explicitly records that ownership, resources, and authorization remain unverified. It does not actively probe or appropriate the device.

This keeps the acquisition loop demand-driven:

```text
what Evercraft is waiting to execute
  -> exact missing resource shape
  -> already-authorized capacity first
  -> passive owned-hardware candidates to verify/enroll
  -> zero-spend partner/voluntary paths only where allowed
  -> commercial capacity remains unauthorized unless separately approved
```


## Portable marketplace execution

Marketplace capacity is not assumed to be a full Evercraft NodeSeed. Saban may execute on a marketplace provider only when the selected software contract explicitly declares a portable worker for that market.

A portable worker declaration binds:

- a stable worker ID and version;
- the exact local worker file Saban is allowed to transfer;
- the provider image/runtime required to execute it;
- whether network access is allowed;
- whether arbitrary shell execution is allowed.

The first portable workload is CHUM:

- worker ID: `chum-portable-v1`;
- image: `golem/node:20-alpine`;
- worker: `systemia/saban/portable-workers/chum.mjs`;
- network access: disabled by contract;
- arbitrary shell: disabled by contract.

For Golem, Saban uploads only the registered portable worker plus a JSON assignment, invokes Node using the argv form of the provider execution API, validates the portable-worker receipt, returns the normal assignment result/checkpoint into the distributed scheduler, and finalizes the rental after the acquired pool finishes.

If a software contract does not declare a Golem portable worker, the Golem adapter does not advertise eligible supply for that demand. This keeps external compute acquisition fail-closed by software capability rather than treating every Evercraft workload as portable.

The automatic distributed fallback now supports two acquisition transports:

1. an acquired NodeSeed endpoint with allocator authority; or
2. an execution-ready negotiated market adapter implementing the bounded Saban assignment contract.

Provider concurrency ceilings remain authoritative even when a Saban plan requests a larger physical worker pool.
