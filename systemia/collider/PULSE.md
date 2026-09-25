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
- deployment receipt,
- current Compute node ID,
- latest continuity-supervisor action/receipt,
- independent field-attestation state.

It intentionally excludes mission snapshots, evidence references, filesystem paths, capacity endpoints, lease IDs, allocator credentials, and private topology.

A CI proof or simulated NodeSeed run does **not** set field attestation to verified. That flag requires a separate real-runtime receipt.
