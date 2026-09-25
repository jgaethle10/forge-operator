# Saban x Evercraft Network capacity proof v2

Saban treats compute as a runtime resource, not as a fleet of pre-enrolled Evercraft boxes.

The seed resolves whatever compatible capacity is available at execution time, schedules logical agents across it, checkpoints state, and rebinds work when capacity disappears. The two local NodeSeeds are only the zero-infrastructure self-test. External capacity endpoints can be supplied at runtime through EVERCRAFT_CAPACITY_ENDPOINTS or --endpoints.

## Run the self-test

npm run proof:saban-network

## Run against available external capacity

EVERCRAFT_CAPACITY_ENDPOINTS="https://capacity-a.example,https://capacity-b.example" node systemia/network/saban-network-proof.mjs --agents 10000 --no-local

The architectural target is broader than HTTP NodeSeeds. A Universal Capacity Resolver should normalize cloud, carrier edge, VM/container, browser/WASM, partner, marketplace, and other legitimately allocatable compute into one capacity contract.

No Evercraft ownership or static enrollment is required. The scheduler cares about current allocatable capacity, workload compatibility, cost, latency, trust/evidence state, and lease lifetime.

## Offline continuity

The capacity proof above answers where Saban can run. The offline continuity layer answers whether an isolated operator can still reach trusted Evercraft roles and local runtimes when external internet is unavailable.

Run the isolated proof:

```bash
npm run proof:offline-continuity
```

The proof requires verified local Nexus, Guardian, Hearth, and team roles, requires a local-inference-capable peer, executes a Saban mission locally, checkpoints through Hearth, reaches Guardian, reaches a team runtime, and records receipts without using external cloud services.

See `OFFLINE-CONTINUITY.md` for the full continuity doctrine and the boundary between the local control-plane proof and future physical multi-hop field verification.

## Blackout resilience

Offline continuity proves that an isolated Saban seed can still reach local Nexus, Guardian, Hearth, and team runtimes. The blackout resilience layer tests what happens when that already-isolated fabric starts losing nodes.

Run the cascade drill:

```bash
npm run proof:blackout-resilience
```

The current automated drill replicates critical state across three Hearth nodes, verifies delayed-message expiry and duplicate suppression, then removes the primary Nexus, Guardian, team runtime, and two Hearth replicas. The mission must resume on the surviving Nexus from the final Hearth copy while Guardian, team runtime, and local inference remain available on secondary nodes.

This remains a control-plane proof. Physical Wi-Fi Direct, BLE, radio, power-loss, battery, and multi-device partition tests still require field receipts.


## Partition reconciliation

Blackout survival is incomplete unless the fabric can reconnect safely. The reconciliation layer validates checkpoint lineage, rejects corruption, refuses to auto-resolve genuine forks, plans Hearth replica refill, and classifies recovered delayed work so irreversible actions are held instead of replayed.

Run the proof:

```bash
npm run proof:partition-reconciliation
```

The same proof also exercises authenticated AES-256-GCM delayed-delivery envelopes, destination binding, tamper rejection, expiry, and stable-message replay protection.
