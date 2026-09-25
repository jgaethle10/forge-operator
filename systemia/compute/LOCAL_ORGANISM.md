# Chromebook / user-mode local organism

This is the current replacement for the old Chromebook-specific Saban adapter.

It runs the same stack used everywhere else:

```
current NodeSeed
  -> Evercraft Compute
  -> Yard Operator
  -> KAIDANCE
  -> Systemia Core resident supervisor
  -> mission publisher + cycle workers
```

No duplicate capacity protocol, identity format, lease issuer or Saban-only runtime is created.

## Why this exists

A Chromebook Linux environment or another user-owned Linux session can become legitimate Evercraft capacity without exposing a public port and without depending on a named cloud provider.

The local organism binds NodeSeed to `127.0.0.1`, disables multicast announcements, persists the real NodeSeed device identity, keeps allocator authority in a private user-state directory, and deploys KAIDANCE and Systemia Core through the real Yard lease path.

## Chromebook / Crostini boundary

Crostini is a virtualized Linux environment. It can provide real authorized compute, but this runtime does **not** claim Node 001 physical field certification.

The safe KAIDANCE pulse remains:

```
field_attestation.state = "not_verified"
```

unless a separate machine satisfies the physical Node 001 field-evidence contract.

## User-mode persistence

On a systemd-capable Linux user session:

```bash
bash systemia/compute/install-local-organism-user.sh
```

The installer copies the reviewed source into `~/.local/share/evercraft/forge-operator`, stores runtime state under `~/.local/state/evercraft/organism`, and enables `evercraft-local-organism.service` as a user service.

The service creates no public ingress. Remote Systemia admission can be layered on later as an outbound-only transport without changing the local runtime contracts.
