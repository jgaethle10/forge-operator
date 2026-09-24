# Evercraft Compute Fabric

This subtree is an isolated staging bridge for Evercraft-owned runtime infrastructure. It is intentionally separate from the Forge Operator application code.

## Purpose

Unify the working pieces already proven across Evercraft Network, NodeSeed, Systemia Compute, Nexus and Saban:

Network/Nexus discovery -> authenticated node identity -> explicit compute-sharing policy -> measured spare headroom -> short-lived capacity offer -> deterministic match -> bounded lease -> isolated Linux workspace -> Saban work cell -> checkpoint/receipt -> release or rebind.

The hardware underneath is replaceable capacity. Evercraft owns workload identity, scheduling policy, evidence lineage and checkpoint state.

## Boundaries

- Hardware discovery is not compute authority.
- Only machines that explicitly expose authorized allocatable capacity may participate.
- Linux runtime and safe ephemeral workspace are separate capabilities.
- No arbitrary remote shell is part of `evercraft.capacity.v1`.
- Borrowed capacity is zero-spend by default.
- Public ingress is denied by default.
- Logical Saban scale does not imply equal physical machine count.
- One capacity offer is conservatively reserved by one active/planned lease until residual-capacity accounting is proven.

## Reproducible proof

```bash
cd platform/evercraft-compute
npm run proof:10
npm run proof:10000
```

The proof starts two independent NodeSeed processes, dynamically discovers their offers, negotiates leases, distributes logical Saban workers, kills one NodeSeed, and rebinds checkpointed workers onto the surviving NodeSeed.

## Current integration targets

1. NodeSeed `evercraft.capacity.v1`
2. Systemia `ComputeSharePolicy`
3. `ComputeCapacityOffer -> ComputeCapacityRequest -> MatchReceipt -> ComputeCapacityLease`
4. Saban work-cell planner/reconciler
5. Systemia five-minute heartbeat for capacity refresh and stale lease release
6. Evercraft Access Gateway for future metered external use

This branch is a staging lane only. Do not merge platform code into the Forge Operator product runtime without an explicit migration/repository decision.
