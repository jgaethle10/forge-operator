# Linux user-session boot

Evercraft OS Phase 0 intentionally runs above an existing Linux-class substrate.

The Linux user-session supervisor is the first persistent boot surface for that model.

## Boot sequence

```text
systemd --user
    ↓
Evercraft OS user supervisor
    ↓
OS source preflight
    ↓
Node-specific install-ledger reconciliation
    ↓
capability capsule integrity verification/materialization
    ↓
Evercraft Home on loopback
    ↓
boot receipt
```

The supervisor does not grant installation, execution, payment, or device authority.

## Capsule reconciliation

Only products with an install-ledger history for the current node are reconciled.

If the ledger says a product is installed, the supervisor verifies or materializes its capability capsule.

If the ledger says it is uninstalled, the supervisor reconciles the capsule away.

A tampered capsule is not repaired silently. It produces a hold and the OS boot receipt is marked `held`.

Evercraft Home remains available on loopback in a held state so the owner has a local repair surface.

An unexplained capsule directory with no matching install-ledger lineage also creates a hold.

## Home

The first Linux boot surface binds Evercraft Home to loopback only.

Local auth is permitted only on loopback. Passport-backed Home can be configured separately once identity signing material exists.

This installer creates no public ingress.

## Privilege model

The persistent service is a systemd **user** service.

The generated unit uses:

- `NoNewPrivileges=true`
- `PrivateTmp=true`
- `ProtectSystem=strict`
- `ProtectHome=read-only`
- a narrow writable state root
- `LockPersonality=true`
- `RestrictSUIDSGID=true`

The supervisor itself requires no root privileges and does not replace the kernel.

## Relationship to Local Organism

Evercraft Local Organism remains the owned compute/runtime substrate:

NodeSeed → Evercraft Compute → Yard → Systemia Core / Fabric.

Evercraft OS is the owner-facing operating layer above that substrate.

The user service orders itself after the Local Organism and wants it when available, but Home can still surface a held/local state rather than inventing remote runtime health.

## Truth boundary

A successful boot receipt proves:

- required OS source anchors are present;
- this node's install ledger was reconciled;
- no capsule integrity hold was observed when state is `ready`;
- Evercraft Home started and answered healthy on loopback;
- no public ingress was created by the supervisor.

It does not prove every Evercraft backend, specialist runtime, external provider, payment rail, or remote node is healthy.


## Receipt-aware health recovery

The installer also creates a 60-second systemd user timer.

The health observer first verifies the canonical boot receipt. Only after that does it probe the loopback Home URL recorded in the receipt.

Recovery is deliberately narrow:

- verified boot receipt + healthy loopback Home → healthy, no restart;
- verified boot receipt + unreachable Home → restart recommended;
- invalid/tampered boot receipt → held, no automatic restart;
- verified non-loopback Home target → held, no probe and no restart;
- capsule hold with healthy Home → remains a repairable held state, not a restart loop.

When the health observer exits with the dedicated recovery code, systemd activates the bounded recovery unit and restarts only the Evercraft OS user supervisor.
