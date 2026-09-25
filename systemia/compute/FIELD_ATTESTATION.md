# Node 001 field attestation

Evercraft now separates three claims that used to be easy to blur:

1. **Software proof** — the code path passed CI or an isolated execution proof.
2. **Device identity proof** — an enrolled NodeSeed proves possession of its persistent Ed25519 device key in response to a fresh Yard challenge.
3. **Field certification** — that device identity is paired with verified Node 001 physical acceptance evidence.

A cryptographically valid NodeSeed identity is not, by itself, a field-certified node.

## Device identity

NodeSeed creates a persistent Ed25519 keypair under its private root. The private key is mode 0600 and never appears in beacons, health responses, deployment receipts or pulse output. Capacity metadata exposes only the public-key fingerprint and whether attestation is supported.

Yard sends a fresh nonce to the authenticated `POST /v1/attest` endpoint. The node signs a strict statement binding:

- node ID,
- device-key fingerprint,
- challenge nonce,
- Evercraft Compute runtime,
- supported-workload hash,
- process start time,
- hashed Linux boot ID when available,
- observation time,
- an explicit `field_claim: false`.

The node is forbidden from certifying itself as a field node. Yard owns that decision.

## Node 001 physical evidence gate

Field enrollment requires `evercraft.node001.field-evidence.v1` with:

- environment observed as `field`,
- physical host,
- Linux,
- Debian 12+ or Ubuntu 22.04+,
- systemd verified,
- at least 6 GiB RAM,
- at least 8 GiB free disk,
- reboot persistence verified,
- offline operation verified,
- telemetry verified,
- opaque host identifier reference,
- test date,
- operator reference,
- source receipt reference.

CI and virtual-host evidence fail the field gate even when device signatures are valid.

## KAIDANCE pulse

Until a device passes both identity verification and the separate physical evidence enrollment, KAIDANCE reports:

```
field_attestation.state = "not_verified"
```

That status may only become `verified` after a real field enrollment exists for the exact device fingerprint and node ID.


## Direct Yard intake

A completed field evidence candidate can be consumed without hand-transcribing its fields:

```bash
node systemia/yard/enroll-field-device.mjs \
  --state-dir /private/yard \
  --evidence /private/field-evidence-candidate.json
```

After the exact device identity is enrolled and KAIDANCE is deployed through Yard, query the safe operational answer directly:

```bash
node systemia/yard/kaidance-pulse.mjs \
  --state-dir /private/yard \
  --deployment-id <kaidance-deployment-id>
```

The pulse command reads Yard's private deployment/lease state, challenges the live NodeSeed identity, evaluates field enrollment, and returns only the privacy-safe KAIDANCE pulse.
