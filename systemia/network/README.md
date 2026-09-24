# Saban x Evercraft Network capacity proof v2

Saban treats compute as a runtime resource, not as a fleet of pre-enrolled Evercraft boxes.

The seed resolves whatever compatible capacity is available at execution time, schedules logical agents across it, checkpoints state, and rebinds work when capacity disappears. The two local NodeSeeds are only the zero-infrastructure self-test. External capacity endpoints can be supplied at runtime through EVERCRAFT_CAPACITY_ENDPOINTS or --endpoints.

## Run the self-test

npm run proof:saban-network

## Run against available external capacity

EVERCRAFT_CAPACITY_ENDPOINTS="https://capacity-a.example,https://capacity-b.example" node systemia/network/saban-network-proof.mjs --agents 10000 --no-local

The architectural target is broader than HTTP NodeSeeds. A Universal Capacity Resolver should normalize cloud, carrier edge, VM/container, browser/WASM, partner, marketplace, and other legitimately allocatable compute into one capacity contract.

No Evercraft ownership or static enrollment is required. The scheduler cares about current allocatable capacity, workload compatibility, cost, latency, trust/evidence state, and lease lifetime.
