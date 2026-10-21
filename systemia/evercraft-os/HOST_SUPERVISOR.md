# Evercraft OS persistent user host

Evercraft OS can now run as a persistent user-session supervisor on an ordinary Linux-class machine without replacing the kernel.

The host is intentionally a composition layer above the existing operating-system substrate.

## Boot shape

```text
systemd user session
      ↓
Evercraft OS Host Supervisor
      ├─ Evercraft Home on loopback
      ├─ OS source/device preflight
      ├─ authorized install-ledger observation
      └─ capability-capsule reconciliation
             ↓
        installed apps materialize
        uninstalled apps reconcile away
```

The existing Local Organism remains responsible for NodeSeed, Evercraft Compute, Yard, KAIDANCE, Systemia Core, Fabric, remote admission, and other compute continuity responsibilities.

The OS host does not duplicate that machinery.

## Reconciliation

The supervisor periodically reads the contract-ready Evercraft app catalog.

For each contract-ready app it derives the current install state for the local NodeSeed node ID and reconciles the corresponding capability capsule:

- installed + capsule absent → materialize capsule
- installed + capsule valid → leave it in place
- uninstalled + capsule present → remove capsule metadata
- contract drift or integrity failure → record a reconcile failure

Reconciliation never installs an app by itself. Only the Passport-gated install ledger can change install state.

## Evercraft Home

Phase 1 runs Evercraft Home on loopback using its existing development/local authorization boundary.

The supervisor refuses a non-loopback Home host.

This is not the final multi-user production identity mode. It is a safe user-session bootstrap for owned machines while the full OS identity/bootstrap UX is developed.

## Systemd user installer

`install-user-host.sh`:

- requires Node.js 22+
- requires systemd user services
- copies the reviewed source tree into the user's Evercraft install root
- stores state under the user's private local state directory
- creates no public listener
- uses no sudo
- enables `evercraft-os-host.service`
- verifies the emitted host status receipt

The default Home address is:

```
http://127.0.0.1:4310
```

## Authority boundaries

The host supervisor:

- does not grant app install authority
- does not grant Passport scopes
- does not grant device capabilities
- does not launch installed apps merely because they exist
- does not claim kernel replacement
- does not claim the Local Organism is present unless separately verified

Capability launch remains the Systemia + Execution Gate path.
