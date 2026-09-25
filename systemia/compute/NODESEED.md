# Evercraft NodeSeed

NodeSeed turns an **authorized existing machine** into Evercraft Compute capacity. It does not create a cloud account and it does not require a named hosting provider.

## Runtime path

```
machine
  -> Evercraft NodeSeed
  -> Evercraft Compute
  -> capacity beacon
  -> Saban / Yard discovery
  -> authenticated allocator request
  -> bounded lease
  -> admitted workload
  -> receipts
```

The beacon is intentionally credential-free. It says only that capacity exists and where its safe capability endpoint is. A network-visible NodeSeed requires `EVERCRAFT_ALLOCATOR_TOKEN` before it will grant a lease.

## Start on a private machine

Loopback-only development:

```bash
node systemia/compute/node-seed.mjs --root /private/evercraft
```

LAN-visible operation:

```bash
EVERCRAFT_ALLOCATOR_TOKEN='<private secret>' \
node systemia/compute/node-seed.mjs \
  --root /private/evercraft \
  --host 0.0.0.0 \
  --advertise-host <this-machine-LAN-IP>
```

Do not commit allocator tokens, private mission state, host credentials, or customer data.

## Persistence

NodeSeed is dependency-free Node.js and can be supervised by the operating system or by a future Evercraft device bootstrap. The process should run under a dedicated low-privilege account with a private root directory. If the process dies, resident workloads stop; persisted KAIDANCE state and receipts remain on disk for restart recovery.

## Boundary

NodeSeed makes software capacity available. It does not grant Evercraft permission to commandeer arbitrary devices. A machine must deliberately run NodeSeed or otherwise expose a compatible, authorized capacity adapter.


## Node identity

Each NodeSeed materializes one persistent Ed25519 identity locally. The signing secret remains inside the NodeSeed root with restrictive permissions; only the public SPKI material and SHA-256 fingerprint leave the node.

Capacity beacons are signed. Saban verifies the signature and confirms that the live capacity offer reports the same public fingerprint before considering that offer internally consistent.

A valid signature is **identity evidence, not allocation authority**. It does not grant a lease, production permission, network membership, coverage, or emergency authority. Allocation remains a separate bounded handshake through the allocator gate.

This preserves dynamic capacity. A legitimate new node does not need to have been statically registered with Evercraft before discovery. Known fingerprints may be pinned by higher-level policy, but NodeSeed identity itself is not a mandatory central device registry.

The identity design carries forward the earlier Evercraft node/factory principles: Ed25519 public-key identity, local-only signing material, fingerprints for evidence, signed heartbeats, and separation of identity from authority.
