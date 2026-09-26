# KAIDANCE Pulse

The safe pulse is the answer surface for the operational question: **How is KAIDANCE?**

It exposes only enough information to answer health and continuity questions:

- state,
- resident/not resident,
- cycle number,
- last cycle key/time,
- cycle age,
- heartbeat target,
- coverage-receipt validity and key,
- admitted/held counts,
- allowlisted privacy-safe hold categories with bounded counts,
- deployment receipt,
- current Compute node ID,
- latest continuity-supervisor action/receipt,
- independent field-attestation state.

It intentionally excludes mission snapshots, evidence references, filesystem paths, capacity endpoints, lease IDs, allocator credentials, and private topology.

A CI proof or simulated NodeSeed run does **not** set field attestation to verified. That flag requires a separate real-runtime receipt.


## Safe hold categories

The pulse never exposes arbitrary mission source names. Hold categories are independently allowlisted at the pulse boundary.

The first supported category is:

- `remote_device_trust`: number of attested remote devices waiting for explicit authorization.

This category does not contain node IDs, fingerprints, request receipts, broker routes, mission evidence, or authorization state beyond the fact that review is waiting. Unknown internal categories are discarded from the pulse.
