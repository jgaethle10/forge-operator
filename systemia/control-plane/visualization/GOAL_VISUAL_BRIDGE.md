# Systemia Goal-to-Graph Bridge v0.1

This is an offline, operator-selected adapter from a locally persisted Systemia goal state into the existing Living Graph JSON import. It reuses the canonical `readGoalState` from `systemia/organism/goal-store.mjs`. It does **not** contact the live runtime or create a new mission authority.

## Run locally, on an owned machine

    node systemia/control-plane/visualization/goal-visual-bridge.mjs /absolute/path/to/existing/goal.json /private/output/visual.json

Open `systemia/control-plane/visualization/index.html` locally in a browser, choose **Import evidence JSON**, and select the output. The input must be an existing goal file you are authorized to read. No output is uploaded. The tool never modifies its input and refuses to overwrite its output.

## Privacy / truth contract

- The output omits goal key, mission key, task keys/titles, objectives, raw blockers, agents, provider identifiers, customer data, internal URLs, bank data, addresses, and raw evidence/receipt references.
- Relationships use ordinal labels `Work 001`, etc. They reveal declared dependency topology without original identities.
- It preserves the original persisted update timestamp. Export time cannot refresh it.
- Stale state (over 15 minutes) is stale; implausible future timestamps (more than two minutes) are unknown. Missing task heartbeat cannot become executing/healthy solely because a goal file was exported.
- Persisted human holds and completed tasks lacking receipt references are surfaced as gaps.
- A receipt reference is not signature verification. Verified receipt count is always zero.
- Invalid schema, oversized data, unrecognized task status, duplicate task key, missing dependency, symlink input, and existing output are rejected.
- Each snapshot expressly reports signature verification, Passport authorization, independent effect verification and execution authority as false.

This CLI is not a Passport-authenticated API or an authorized public export. Do not publish the original state file or exported snapshot.

## Next gate

1. Add an owned service that verifies authenticated Passport scope before exporting to another operator or device.
2. Bind approved mission and NodeSeed observations to independent receipt signature verification and downstream effect reconciliation.
3. Serve a read-only, identity-gated view and confirm physical Node001 and NextGen behavior; keep payment, communication, deployment and promotion authority separate.

## Proof

    node --test systemia/control-plane/visualization/goal-visual-bridge.test.mjs

CI validates local generated fixtures, not live Systemia production or node health.
