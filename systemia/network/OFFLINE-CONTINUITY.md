# Evercraft Offline Continuity Standard v1

## Objective

If ordinary internet access disappears, an authorized Evercraft member should still be able to open a local Linux environment, release Saban, discover reachable Evercraft peers, and route work to local or nearby Nexus, Guardian, Hearth, and team runtimes without pretending cloud services remain available.

This is a continuity architecture, not a claim that every transport or field deployment already exists.

## Core rule

Saban asks two different questions:

1. **What can I still reach?**
2. **What can actually execute this mission while isolated?**

The first is a network problem. The second is a compute/runtime problem. Evercraft Network must solve both through explicit evidence rather than optimistic assumptions.

## Minimum isolated stack

An offline-capable Evercraft environment needs:

- a **seed** on the operator device with the trust bundle, mission queue, receipts, and peer resolver;
- at least one reachable **Nexus** or equivalent compute node for executable workloads;
- **Guardian** nodes or services for safety/resource continuity functions where locally provisioned;
- **Hearth** nodes for durable local storage, checkpointing, message holding, and continuity services;
- one or more **team runtimes** capable of accepting Saban work locally;
- one or more authorized transports such as LAN, Wi-Fi Direct, BLE/store-and-forward, radio gateway, or another adapter;
- a local inference/runtime option for any agent task that would otherwise require a cloud model.

If no local model/runtime exists, Saban must degrade honestly to deterministic tools, cached knowledge, queueing, or store-and-forward. It must never label a cloud-dependent agent as available while the cloud is unreachable.

## Node roles

A physical device may carry more than one role.

- **seed**: operator bootstrap, trust verification, mission admission, receipts, topology view.
- **nexus**: allocatable compute and local agent/runtime execution.
- **guardian**: safety/resource continuity services with the same authority limits as the deployed Guardian capability.
- **hearth**: durable state, checkpoints, replicated queues, local reference bundles, delayed-delivery mailboxes.
- **team**: a locally runnable Evercraft specialist/agent endpoint.
- **gateway**: optional bridge to any surviving external network. A gateway is never assumed.

## Continuity modes

- **C0 online**: normal cloud/network operation.
- **C1 degraded**: internet impaired, local network and some gateways remain.
- **C2 isolated LAN**: no internet; authorized local IP peers remain.
- **C3 partitioned mesh**: peers appear intermittently; store-and-forward and checkpoint rebinding are required.
- **C4 disconnected island**: one device only; execute purely local capabilities and queue everything else.

Saban should continuously calculate the current mode from observed evidence.

## Required lifecycle

BOOT -> LOAD TRUST -> DISCOVER -> VERIFY -> INVENTORY -> MATCH -> LEASE -> EXECUTE -> CHECKPOINT -> FORWARD/REBIND -> RECEIPT -> RECONCILE

When connectivity returns, reconciliation must deduplicate messages, merge checkpoints safely, preserve receipt lineage, and avoid replaying consequential actions.

## Trust and safety

- no unauthenticated peer may become an execution target;
- discovery is not authorization;
- node role advertisements are claims until verified against the local trust bundle or an authorized enrollment path;
- private topology stays local and is not published into public CHUM discovery;
- consequential financial, legal, safety-critical, or external actions keep their existing human gates;
- store-and-forward payloads should be encrypted for the destination and carry expiry plus replay protection;
- loss of internet does not expand authority.

## Transport architecture

The node contract is transport-neutral. Initial proof uses local HTTP because it is easy to test. Production adapters may include:

- Ethernet / ordinary LAN;
- Wi-Fi Direct or local access-point mode;
- BLE for discovery and small store-and-forward envelopes;
- opportunistic authorized gateways;
- radio or other low-bandwidth bridges where lawfully integrated;
- USB/removable-media courier as a last-resort delay-tolerant adapter.

Saban should normalize all of them into the same peer and capacity contracts.

## What "release Saban" means

On an isolated operator laptop, the bootstrap command should:

1. load the local Evercraft identity/trust bundle;
2. determine whether external internet is usable but not require it;
3. discover reachable authorized peers;
4. classify peers by role/capability;
5. verify at least one execution path for requested work;
6. instantiate the local Saban mission graph;
7. execute locally when possible;
8. checkpoint to Hearth-capable storage;
9. route safety/resource tasks to Guardian-capable peers;
10. route compute work to Nexus-capable peers;
11. route specialist work to locally available team runtimes;
12. hold undeliverable work for store-and-forward;
13. reconcile automatically when peers or gateways return.

## Evidence states

Use explicit states rather than one binary "online":

- discovered
- identity_verified
- transport_reachable
- capability_advertised
- capability_verified
- execution_ready
- inference_ready
- store_forward_ready
- gateway_available
- stale
- unreachable

## Current proof boundary

systemia/network/offline-continuity-proof.mjs proves the control-plane contract on an isolated local test fabric. It does **not** prove real multi-device Wi-Fi/BLE range, field radio performance, battery endurance, local model quality, or a deployed Guardian/Hearth fleet. Those require hardware/runtime field receipts.
