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


## Self-bootstrap conductor

For a founder-authorized physical Linux machine, use the resumable conductor instead of manually sequencing the field scripts:

```bash
node systemia/compute/node-self-bootstrap.mjs --root /var/lib/evercraft/nodeseed
```

It always runs field preflight first and emits one state plus one next action. It never weakens the field-public-edge admission floor.

On an eligible machine, safe installation work can be advanced with:

```bash
sudo node systemia/compute/node-self-bootstrap.mjs \
  --root /var/lib/evercraft/nodeseed \
  --advance
```

The conductor intentionally stops for evidence that software cannot truthfully invent:

- one reboot to prove service persistence;
- an offline-survival observation captured while no default route is present;
- explicit physical-host confirmation;
- trusted public-HTTPS domain/TLS admission.

To capture the offline receipt after reboot, disconnect the machine from its default network route and run:

```bash
sudo node systemia/compute/node-self-bootstrap.mjs \
  --root /var/lib/evercraft/nodeseed \
  --capture-offline
```

After reconnecting, continue certification with explicit physical observation:

```bash
sudo node systemia/compute/node-self-bootstrap.mjs \
  --root /var/lib/evercraft/nodeseed \
  --advance \
  --confirm-physical-host
```

If a Systemia remote-capacity broker is configured, the same conductor can submit a signed outbound enrollment request without exposing the local allocator secret:

```bash
sudo node systemia/compute/node-self-bootstrap.mjs \
  --root /var/lib/evercraft/nodeseed \
  --broker-url https://<evercraft-control-origin> \
  --request-enrollment
```

Enrollment request is not authorization. Yard must explicitly authorize the exact node-id/device-fingerprint pair before the outbound node agent can receive commands.

The bootstrap status receipt is written to `bootstrap-status.json`. It contains no allocator token, private key, browser credential, TLS private-key bytes, or remote session token.
