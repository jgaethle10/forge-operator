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
- copies the current reviewed Forge source into `/opt/evercraft/forge-operator`,
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
