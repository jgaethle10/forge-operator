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


## Placement labels

A NodeSeed may advertise bounded placement labels such as 'ground', 'gateway', 'vehicle', 'temporary', or 'air_relay'.

Programmatic startup passes placementLabels. CLI startup accepts:

    --labels ground,gateway

or the EVERCRAFT_NODE_LABELS environment variable.

Labels are normalized to lowercase, restricted to safe identifier characters, deduplicated, capped, exposed through /v1/capacity, and copied into NodeSeed receipts. They describe placement characteristics only. They do not grant authorization, certify hardware, certify flight status, or override workload admission.

Saban resource profiles may use required_node_labels and forbidden_node_labels to constrain placement. This keeps the scheduler generic while allowing a mission to require a class such as air_relay or explicitly exclude it.

Run:

    npm run proof:nodeseed-placement
