# Evercraft Blackout Resilience Standard v1

The goal is not to claim that Evercraft cannot fail. The goal is to eliminate avoidable single points of failure and make every surviving fragment useful.

## Survival doctrine

A healthy Evercraft continuity fabric should degrade in layers rather than fall off a cliff.

1. **No single gateway dependency.** Loss of public internet or a carrier route must not destroy local control.
2. **No single compute dependency.** Critical Saban missions checkpoint frequently enough to resume on another Nexus-capable node.
3. **No single memory dependency.** Critical state should be replicated across multiple Hearth-capable nodes before the system treats it as durable.
4. **No single safety-resource dependency.** Guardian continuity functions should have more than one reachable serving node where deployment scale permits.
5. **No single team-runtime dependency.** Locally executable specialist runtimes should be replaceable or restartable from checkpoints.
6. **No cloud truthfulness violation.** A cloud model or API that cannot be reached is unavailable, not "degraded but ready."
7. **No replay after partitions.** Store-and-forward envelopes need stable IDs, expiry, deduplication, and eventually cryptographic replay protection.
8. **No authority expansion during emergencies.** Loss of infrastructure does not silently grant new financial, legal, surveillance, or safety-critical authority.

## Minimum critical redundancy target

For a mature deployment, target these as engineering objectives rather than current deployment claims:

- Nexus execution: N+1 for critical missions.
- Hearth state: replication factor 3 for critical checkpoints, with geographic and power-domain diversity where possible.
- Guardian serving path: N+1 where the deployment depends on Guardian locally.
- Team runtime: restartable from signed artifact + checkpoint on a second compatible compute node.
- Gateways: zero required for local operation; multiple heterogeneous gateways when external reach is available.
- Trust material: locally available with bounded expiry/revocation semantics and an offline-safe recovery path.

## Blackout invariants

The blackout drill must keep proving:

- the mission resumes after the primary Nexus disappears;
- the latest committed checkpoint remains available after losing at least two of three Hearth replicas in the local proof;
- Guardian continuity remains reachable after losing its primary serving node;
- a team runtime remains reachable after losing its primary serving node;
- local inference remains available on a surviving compute path when the mission requires inference;
- duplicate delayed messages are not executed twice;
- expired delayed messages are rejected;
- no external cloud endpoint is required by the proof.

## Brownout behavior

Resources should be shed in priority order rather than equally:

1. life/safety continuity and essential coordination;
2. identity, trust, routing, and receipts;
3. mission-critical local compute;
4. checkpointing and delayed delivery;
5. reference caches and communications;
6. ordinary workloads;
7. bulk analytics, publishing, and nonessential background work.

Saban should contract the swarm as compute or power disappears and preserve the highest-priority work first.

## Reconciliation after recovery

When partitions reconnect:

- compare receipt lineage and checkpoint generation;
- deduplicate delayed messages by stable message ID;
- reject expired or replayed commands;
- never replay irreversible actions merely because a queue reappeared;
- preserve conflicting state for review when automatic merge is unsafe;
- refill missing Hearth replicas;
- rebalance work away from battery-critical or thermally constrained nodes;
- restore cloud-dependent services only after live verification.

## Current evidence boundary

The automated blackout proof is a local-process control-plane and failure-semantics proof. It is valuable because it makes the invariants executable, but it is not yet a physical disaster-network certification.

Physical field receipts are still required for Wi-Fi Direct, BLE, separate machines, radio gateways, long-duration power loss, power-loss-safe storage, real local inference models, battery endurance, geographic partitions, and recovery after hours or days of isolation.
