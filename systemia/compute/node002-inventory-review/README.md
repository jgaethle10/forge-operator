# Node002 fixed inventory adapter | REVIEW HELD

**Status:** source-only review candidate; not installed or enrolled on the physical HP. No change to the existing `evercraft-node002-agent.service`, the localhost v0.5 inbox, Fabric port 8788, or Raven's quarantined execution authority.

## Why this exists

On October 14, 2026 (Pacific), the owner ran a **one-time, operator-pasted Python inventory** inside Ubuntu WSL2 on HP NextGen. Reported results: 12 logical CPUs, 8,177,627,136 bytes WSL memory, 1,023,932,964,864 bytes free on the Linux root filesystem, observation at 2026-10-15T04:18:53.877459Z, claimed SHA-256 `97c3aec3c06a414b2cb55ab0ef374e27b000b053831cb55a4159cd4471c88712`. These values remain **owner-reported, unsigned local evidence**. They are not an authorized remote compute receipt or source custody verification.

The physical host already runs:
- Node002 v1.2 shadow Ed25519 heartbeat collector (remote jobs disabled).
- Evercraft Fabric local MCP read-only runtime (localhost 8788).
- Evercraft Edge HP v0.5 authenticated inventory-only mission inbox (localhost 8878).

That inbox's `submit`/`claim`/`ack` protocol only records **local broker acceptance**. It does **not** verify job execution, Systemia admission, device signing, source custody, revocation, or isolation.

## This review candidate

`operator-inventory.mjs` uses the **existing** `../hardware-inventory.mjs` library, not a duplicate hardware probing stack. It:
- Accepts only explicit owner-local invocation (`--operator-local`), not remote polling, a submit/claim request, or custom paths/commands.
- Reads CPU, total memory, and available root filesystem space. No external process is launched; even the optional fixed `nvidia-smi` probe is suppressed.
- Emits an integrity digest, but reports `UNSIGNED_OWNER_LOCAL_ONLY`, `remote_execution_authorized:false`, and `production_execution_receipt:false`.
- Offers strict schema, timestamp, measurement, and digest checks that intentionally report `cryptographically_device_authenticated:false` and `execution_authorized:false`.

No network access, broker tokens, customer data, signer keys, shell commands, or service installation are involved.

### Additional signed-claim verification candidate

`signed-completion-verifier.mjs` verifies a future completion **claim** under an externally pinned Ed25519 public key, exact node/job/request/nonce/source digest, a domain-separated signature, and bounded timestamps. The module has **no signing private key**, no broker interface, no OS access, and never upgrades a signed claim into physical execution proof. Its result explicitly reports that Systemia authorization, active lease, revocation/atomic fencing, OS isolation, and production completion remain **unverified**. Synthetic test keys are generated only in the unit tests.

A successful signature means the expected device *key* signed the statement. It does **not** mean a verified inventory ran on a real host, that a device key wasn't copied, or that an independently authorized worker completed anything.

### Development-only tests

```bash
node --test systemia/compute/node002-inventory-review/*.test.mjs
```

A CI pass verifies **repository code**, not physical execution on the HP. A CI runner's local measurements must never be labeled HP evidence.

### Owner-local invocation, only after source review

```bash
node systemia/compute/node002-inventory-review/operator-inventory.mjs --operator-local
```

This is still only a manual, unsigned inventory report, not the first remotely dispatched Systemia compute workload. Avoid duplicating manual tests unless needed during commissioning.

## Blocking gates before real remote execution

1. Independently reviewed and pinned delivery of the source to the HP, with provenance and expected digest verified outside of a writable Drive/README record; no force-install from chat.
2. Device fingerprint and trust-anchor custody established independently; **do not create a second untracked production device key** or copy private keys into GitHub/Drive/chat.
3. Two-role Systemia + Compute signed scoped work permit for the **exact** allowlisted adapter digest and this node, with signed admission, TTL and resource limits.
4. Fresh signed revocation witness and **atomic, durable work claim** bound to the authority epoch; monotonic rollback and ambiguous lease expiry fail closed.
5. Proven sandbox limits (one vCPU, <=1 GB, <=120s, network denied, no writes) on the **physical HP**, not just in GitHub CI/Base44 simulation. Existing architecture currently shows the HP user WSL environment; this is not an isolation attestation.
6. Device-origin signed completion envelope, externally pinned signing key, full evidence retention, and independent Systemia/Raven verification. Broker `delivered` is never promoted to `executed`.
7. Zero public ingress; use owner-approved outbound-only transport when separately commissioned, with revocation and rollback tests.

**Do not** toggle `remote_jobs_enabled`, `execution_allowed`, or remove the Node002 quarantine based on this PR.

## Integration direction

Reuse the existing Systemia `nodeseed-registered-worker.mjs`, NodeSeed identity, Yard admission, and Saban bounded scheduling only after their exact contracts are reconciled with the HP's currently installed inbox and telemetry identity. This module is a source-only, fail-closed inventory primitive, not a competing compute scheduler.
