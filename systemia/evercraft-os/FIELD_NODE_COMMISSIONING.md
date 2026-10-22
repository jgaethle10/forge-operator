# Evercraft OS | Node001 + Node002 local identity commissioning

**Scope:** Read-only operator handoff. This is part of the existing [12-lane Evercraft OS program](./parallel-program.json), not a second worker runtime or an automatic release authority.

## What exists now

- NodeSeed already provides `GET /v1/capacity` and nonce-bound `POST /v1/attest`.
- `field-node-probe.mjs` challenges that **local** NodeSeed over `127.0.0.1`, `localhost`, or `[::1]` only. It verifies the Ed25519 signature, the live nonce, freshness, supported-workload digest, labels, exact pinned device identity and the expected node ID.
- The complete result is a sanitized read-only receipt. No private key, bearer token, public key PEM, complete raw attestation or raw HTTP failure body is displayed.
- The proof CI uses disposable localhost NodeSeeds. CI green **never means** Node001 or Node002 has been touched.

## Physical machine field use (after separately validating the source/release)

On **each machine separately**, find the actual installed NodeSeed loopback endpoint from its **existing local NodeSeed receipt** or current local service configuration. Never use the public Fabric MCP URL as a substitute. Locate the **expected node ID and public-key SHA-256 fingerprint independently** from the approved private Yard/Device roster, not by trusting whatever the unverified endpoint returns.

Within a trusted Forge checkout containing this tool, execute:

```bash
node systemia/evercraft-os/field-node-probe.mjs \
  --endpoint 'http://127.0.0.1:YOUR_LOCAL_NODESEED_PORT' \
  --expect-node-id 'YOUR_PINNED_NODE_ID' \
  --expect-fingerprint 'sha256:YOUR_PINNED_64_HEX_FINGERPRINT'
```

If the existing NodeSeed requires bearer authentication for attestation, the local operator can place the **existing local allocator token** in `EVERCRAFT_LOCAL_ALLOCATOR_TOKEN` within the local trusted environment **without entering it as a command argument**. Do not transmit it to ChatGPT, GitHub, chat messages, logs or public repositories. Do not invent or rotate secrets as part of this status-only test.

When an origin is unavailable, a pin is missing, a challenge fails, or the local NodeSeed isn't running, the result is **HOLD**, not permission to install a new listener or alter the node.

## What a successful local probe establishes

Only: “A live process on this local machine's loopback endpoint has answered a fresh cryptographic challenge with the private key corresponding to the independently pinned device public key. Its capacity claims match the signed challenge.”

It does **not** establish that the physical hostname is Node001/Node002, that its device key is still trusted by Yard, that the broker route is healthy, that the machine is independently field-certified, that remote jobs are permitted, or that a product can be billed and fulfilled.

## The separate release gates

| Gate | Required independent evidence |
| --- | --- |
| Local identity | Passing signed challenge and expected fingerprint from trusted Device/Yard custody |
| Physical provenance | Owner field confirmation plus existing hardware field-certification receipt; not inferred from virtual CI |
| Broker path | Authenticated fresh existing Remote Operator status, exact registered device, replay protection |
| Device authorization | Yard trust decision, explicit candidate approval reference, not a stale enrollment request |
| Execution | Exact Systemia mission, Passport/Execution Gate permit, bounded workload, signed job receipt |
| Customer service | Verified order/settlement, entitlement, actual deliverable and customer acknowledgment |
| Continuity | Forced interruption and recovery on two *approved physical* nodes with reconciled job and payment IDs |

### Current restrictions remain in force

- **Node001 / Chromebook:** historical revoked credential cannot be restored by a local signature test; use the established Yard enrollment review.
- **Node002 / HP NextGen:** reported shadow signed telemetry is not job-execution admission. Leave `remote_jobs_enabled=false` until a specific, independent authorized review. The HP graphics timer is a separate local-only workflow.
- **Node003 / HP tower:** not included in this commissioning gate.
- No Base44 reintroduction, external compute spend, RIVET hold bypass, production publisher activation, checkout initiation, social posts or unsolicited outreach.

### Proof command for developers

```bash
node --test systemia/evercraft-os/field-node-probe.test.mjs
```

The tests exercise live localhost NodeSeed challenge responses, incorrect or missing pins, spoofed signatures, replayed challenges, altered capacity claims, forbidden nonloopback URLs and unauthorized attestation. They do not use the owner's machines.
