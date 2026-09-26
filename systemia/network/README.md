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


## Durable continuity state

Replay protection and checkpoint lineage survive ordinary process restart through hash-linked append-only journals. The durable replay ledger fails closed on committed corruption and tolerates only an incomplete final tail as an interrupted uncommitted write. The checkpoint journal reconstructs standard reconciliation history after restart.

Run the proof:

```bash
npm run proof:durable-continuity
```

This is a filesystem/process-restart proof, not yet a sudden-power-loss field certification.


## Process restart recovery

The restart drill crosses a real process boundary. A new Node process must reject an already-executed secure envelope from persisted replay state, recover the last checkpoint, then survive a SIGKILL after an intentionally torn uncommitted journal tail.

Run the proof:

```bash
npm run proof:process-restart-recovery
```

This is stronger than object reload, but still not a physical power-loss certification.


## Air Relay v1

Evercraft Network can model an authorized civilian airborne node as a temporary relay in the same evidence-gated fabric used by NodeSeed and Saban.

Run the software proof:

    npm run proof:air-relay

The planner admits only documented civilian purposes, requires verified links plus explicit flight authorization and safe operating state, and keeps infrastructure-avoidance estimates labeled as modeled. It does not perform flight control or claim that planned radio paths have been field verified.

See AIR-RELAY.md for the contract and truth boundary.


## Aircraft Relay v1

Evercraft Network can also model an explicitly participating civilian aircraft as transient future capacity.

Aircraft Relay separates two states:

- verified overlapping contact windows may form a live relay;
- predicted operator-approved contact windows may form a forecast data-ferry plan only.

Predicted contact never becomes a live route merely because an aircraft is scheduled to pass overhead. Aircraft participation must be explicit, flight-control access must remain disabled, and onboard networking must remain isolated from flight-critical avionics.

Run:

    npm run proof:aircraft-relay

See AIRCRAFT-RELAY.md for the contact-window, store-and-forward, and truth-boundary contract.
