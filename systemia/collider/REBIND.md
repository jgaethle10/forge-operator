# KAIDANCE Node Rebind

KAIDANCE continuity is no longer tied to one machine or one disk.

Yard can capture an authenticated private checkpoint containing Collider state, detect that the current resident service is unreachable, discover alternate compatible Evercraft Compute capacity, and restore the resident service there.

The checkpoint intentionally excludes mission snapshots and evidence payloads. It carries operational continuity state such as cycle number, last completed heartbeat, counts, coverage receipt key and deployment lineage.

## Continuity path

```
KAIDANCE on Node A
  -> authenticated checkpoint
  -> Yard private checkpoint store
  -> Node A unavailable
  -> capacity discovery
  -> exclude failed node
  -> authenticated lease on Node B
  -> hydrate KAIDANCE state
  -> bind new Yard deployment receipt
  -> verify health
```

A checkpoint is authority-gated and is never exposed through the public health surface. Mission snapshots remain a separate private input and must be available to the destination node before a new Collider cycle can consume them.
