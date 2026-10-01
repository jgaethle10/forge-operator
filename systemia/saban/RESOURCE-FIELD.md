# Saban Resource Field

Saban must not depend on a single cloud, machine, vendor, or network path to execute an admitted Evercraft workload.

The Resource Field is the layer that converts a workload need into verified execution capacity.

```
NEED
  -> DISCOVER
  -> CLAIM AUTHORITY
  -> BOOTSTRAP / ENROLL
  -> ATTEST
  -> BENCHMARK
  -> LEASE
  -> DEPLOY
  -> VERIFY
  -> ROUTE
  -> RECONCILE
```

## What counts as capacity

Capacity is broader than a cloud VM. A candidate can be:

- an already running Evercraft Compute node
- an owned computer that can be bootstrapped into a node
- an explicitly authorized peer device
- an approved partner machine
- a bare-metal machine that can be provisioned
- an approved provider instance
- temporary rented capacity when no better lane exists

The control plane is Evercraft. Providers are adapters.

## The resiliency rule

When a workload cannot run, Saban does not stop at "capacity unavailable."

It emits a scarcity signal and searches for another path. If the existing adapter set cannot satisfy the need, the next engineering task is to create a new adapter or capacity source.

That makes scarcity an input to engineering rather than a terminal failure.

## Memory is part of the fabric

"Memory" must remain technically honest.

Normal RAM is local to a machine. Saban must never claim that 64 GB on one computer plus 64 GB on another is one contiguous 128 GB address space unless a workload explicitly uses a distributed-memory runtime that provides those semantics.

Saban can still create larger effective memory systems through:

- sharded workloads
- replicated state
- object storage
- distributed key-value stores
- vector stores
- content-addressed caches
- checkpoint and spill layers
- application-level distributed memory

The Resource Field records the declared memory semantics for every workload so placement cannot quietly lie.

## Authority

"Any means necessary" means any legitimate execution surface Evercraft owns, has explicit permission to use, or is authorized to provision.

Unknown or unauthorized hardware is rejected even if it is technically reachable.

## External spend

External paid capacity may be discovered and prepared by Saban, but consequential new spend remains human-gated unless a bounded budget has already been explicitly authorized.


## Hardware truth

Hardware-aware placement is evidence-backed, not advisory.

Evercraft Compute inventories CPU, RAM, available disk, GPU count, GPU models, and VRAM. NodeSeed includes a normalized hardware claim inside its signed device attestation. When a workload declares a hardware requirement, Saban requires that signed claim and compares it with the node's advertised capacity before leasing the node.

An unsigned capacity hint may still be useful for discovery, but it cannot satisfy a hardware-sensitive placement decision.

## Execution lanes

The Resource Field preserves multiple execution shapes behind one acquisition decision.

1. Already-running NodeSeed capacity.
2. An explicitly owned local host bootstrapped into Evercraft Compute on demand.
3. Authorized Evercraft broker capacity.
4. Negotiated voluntary compute.
5. Other enabled decentralized adapters.
6. Approved external provider capacity.

The canonical market stack keeps Evercraft broker capacity ahead of voluntary and external markets. Visibility is not authorization, and paid execution does not become authorized merely because a provider is discoverable.

Negotiated adapters that expose an execution boundary remain negotiated adapters. The Resource Field does not force every provider to masquerade as a NodeSeed endpoint.

## Formation defaults

Distributed Formation searches for NodeSeed capacity by default and enables resilient acquisition unless the caller explicitly disables it. Public paid-market discovery is not enabled by default, and no paid lease authority is invented by the runtime.

An explicitly owned host can opt into local bootstrap with `EVERCRAFT_OWNED_HOST` or a matching bounded acquisition setting. Installing Evercraft software on a partner or voluntary machine does not silently make that machine Evercraft-owned.

## Relationship to existing Evercraft systems

The Resource Field sits above existing primitives rather than replacing them:

- Saban Formation decides how a job is decomposed.
- Saban Hardware Federation assigns verified roles to nodes.
- NodeSeed and Evercraft Compute bootstrap execution surfaces.
- Outbound Capacity Broker lets remote nodes contribute capacity without exposing them inbound.
- Yard deploys and verifies workloads.
- Continuity and blackout systems keep the fabric operable through failures.

The missing connective tissue is now explicit: Saban can translate a resource requirement into a ranked capacity plan, a spawn/enrollment plan, or a concrete scarcity signal that demands a new adapter.
