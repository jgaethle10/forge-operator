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



## Self-healing health watch

The user-mode installer also enables `evercraft-local-organism-health.timer`. Once the Crostini user manager is alive, the timer checks the loopback NodeSeed every 60 seconds and writes:

```text
~/.local/state/evercraft/organism/health-watch.json
```

The watcher is intentionally narrow. It may restart only `evercraft-local-organism.service` in the same user systemd scope. It has no sudo/root path, no arbitrary command lane, no public listener, and it never reads or returns allocator tokens.

A healthy check proves the real NodeSeed `/v1/health` endpoint is alive. If the service is active but the NodeSeed is unhealthy, the watcher performs one bounded restart, waits for the real health endpoint to recover, and records either `recovered` or `degraded`. A cooldown prevents restart thrashing.

This does not claim that Crostini itself can survive ChromeOS suspending or stopping the Linux VM. The host boundary remains explicit. It does mean that once Linux is running, a wedged local organism should heal without turning the founder into a process babysitter.

The resident network observer also reads the non-secret organism and health-watch receipts and probes NodeSeed directly. Authorized Remote Operator status can therefore report whether the local organism, Remote Operator capability, Fabric, TLS edge, and router automation are healthy as separate layers.

## Outbound remote admission

The local organism can attach to the canonical remote-capacity broker without opening any public listener on the Chromebook/Crostini side.

Configure the broker before installation:

```bash
EVERCRAFT_REMOTE_BROKER_URL="https://<verified-broker-origin>" \
bash systemia/compute/install-local-organism-user.sh
```

The installer stores that URL in `~/.config/evercraft/local-organism.env` with mode 0600 and the user service reads it through `EnvironmentFile`. Reinstalling without a new broker URL preserves the existing private configuration.

The organism always writes:

```
~/.local/state/evercraft/organism/remote-admission-request.json
```

That request contains the NodeSeed node ID and public device-key fingerprint, plus the explicit facts that the transport is outbound-only and that physical field certification is not claimed. It contains no allocator token or private key.

A broker does not trust the request by itself. Systemia must separately authorize the exact device fingerprint. Registration then still requires the live broker challenge and NodeSeed Ed25519 attestation.

### Failure behavior

Remote admission is deliberately non-fatal to the local organism.

If the broker is unavailable or the fingerprint is not yet authorized:

- NodeSeed remains loopback-only and alive;
- KAIDANCE continues locally;
- Systemia Core continues locally;
- the admission keeper retries with bounded exponential backoff;
- local health reports remote admission as disconnected/degraded.

Once the broker becomes reachable and the device is authorized, the same running organism attaches outbound automatically. No local runtime redeploy and no public ingress are required.
