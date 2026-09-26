# Node 001 field kit

This kit turns the Node 001 acceptance contract into a repeatable machine procedure.

## Preflight

`field-preflight.mjs` checks what software can establish safely:

- Linux,
- Debian 12+ or Ubuntu 22.04+,
- systemd,
- at least 6 GiB RAM,
- at least 8 GiB free disk,
- obvious virtualization indicators,
- an opaque hash of the machine identifier.

A clean virtualization scan reports `not_proven`, not `physical`. Software does not award itself physical-host status.

## Install

`install-node-seed.sh`:

- requires Node.js 22+,
- creates a dedicated low-privilege `evercraft` service account,
- copies the complete reviewed Systemia runtime tree into `/opt/evercraft/forge-operator/systemia`,
- keeps state under `/var/lib/evercraft/nodeseed`,
- stores allocator authority in a root-only environment file,
- installs a hardened systemd unit,
- enables NodeSeed at boot,
- records the install boot ID hash for later reboot-persistence proof.

It does not print allocator credentials.

## Offline receipt

After the real reboot, deliberately isolate the machine so it has no default route, then run:

```bash
sudo node /opt/evercraft/forge-operator/systemia/compute/field-offline-check.mjs \
  --root /var/lib/evercraft/nodeseed
```

The check must observe no default route while still reaching Evercraft Compute locally over loopback. It writes a hashed `offline-receipt.json`. Restore normal connectivity only after the receipt is captured.

## Certify

Then run:

```bash
sudo node /opt/evercraft/forge-operator/systemia/compute/field-certify.mjs \
  --root /var/lib/evercraft/nodeseed \
  --physical-observed \
  --operator-ref '<operator receipt reference>' \
  --receipt-ref '<field test receipt reference>'
```

The certifier verifies the host rebooted since installation, the service is enabled and active, the offline receipt is valid and from the current boot/device, NodeSeed telemetry exists, and the device identity is present. Reboot, offline and telemetry claims each carry a receipt/hash reference. It writes a private `field-evidence-candidate.json`.

The resulting candidate is not a field enrollment by itself. Yard still validates the evidence against `evercraft.node001.field-evidence.v1` and binds it to the exact device fingerprint.


## Public edge admission

A field-certified NodeSeed may additionally become an Evercraft public-edge candidate. This is a separate admission gate because public ingress has stricter identity, TLS, and placement requirements than ordinary compute capacity.

Prerequisites:

- the normal field certification above is complete and `field-evidence-candidate.json` says `ready_for_yard_enrollment=true`,
- NodeSeed has a persistent Ed25519 device identity,
- a real wildcard certificate and matching private key are present on the field host,
- the certificate covers `*.<edge-domain>` and has at least 72 hours of remaining validity,
- the operator running the field command is authorized to configure that host.

First inspect the candidate without mutating the host:

```bash
sudo node /opt/evercraft/forge-operator/systemia/compute/public-edge-field-admit.mjs \
  --root /var/lib/evercraft/nodeseed \
  --base-domain edge.example.com \
  --tls-key-path /secure/source/wildcard-key.pem \
  --tls-cert-path /secure/source/wildcard-cert.pem \
  --public-port 443
```

When the candidate is correct, apply it:

```bash
sudo node /opt/evercraft/forge-operator/systemia/compute/public-edge-field-admit.mjs \
  --root /var/lib/evercraft/nodeseed \
  --base-domain edge.example.com \
  --tls-key-path /secure/source/wildcard-key.pem \
  --tls-cert-path /secure/source/wildcard-cert.pem \
  --public-port 443 \
  --apply
```

The apply path:

- copies the key and certificate into `/etc/evercraft/tls` with bounded permissions,
- adds `public-edge` and `gateway` placement labels while preserving existing labels,
- writes only certificate references and edge configuration into the root-only NodeSeed environment file,
- grants the low-privilege NodeSeed service only `CAP_NET_BIND_SERVICE` for low HTTPS ports,
- restarts NodeSeed,
- reads `/v1/capacity` over loopback,
- requires the same device fingerprint, signed-attestation support, edge labels, matching certificate fingerprint, and `public_edge.ready=true`,
- writes a private `public-edge-admission-receipt.json`.

The receipt never contains private-key bytes or certificate bytes. A field admission receipt still does **not** prove DNS, internet reachability, trusted public TLS from outside the node, MCP availability, indexing, or registry publication. Systemia's external public-edge canary must verify those independently before any direct MCP is promoted.
