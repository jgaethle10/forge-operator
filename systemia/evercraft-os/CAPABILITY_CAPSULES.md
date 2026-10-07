# Evercraft OS capability capsules

The first Evercraft OS apps are capability-native, not arbitrary executable bundles.

For the current shared-runtime products, installation can materialize a small local **capability capsule** that tells the operating environment which governed Evercraft services the app binds to.

## Why a capsule

Copying an executable into a directory is not the useful part of an agent-native OS.

The valuable boundary is that an app can inherit:

- Systemia admission
- Passport authorization
- Context Fabric
- Evercraft Compute / Yard / Saban
- Evercraft Network
- Evercraft Payments
- notifications
- receipts

without receiving raw authority over those systems.

A capability capsule therefore contains contract metadata, not secret credentials or a shell entrypoint.

## Default sandbox

Current capsules fail closed:

- no direct shell
- no arbitrary process spawning
- no raw provider credentials
- no direct socket access
- no direct settlement-provider access
- no implicit device capabilities
- no arbitrary host-filesystem access
- no executable materialization claim
- no process-start claim
- no service-enable claim
- no runtime-health claim

Launching work remains a Systemia-mediated operation.

## Integrity

A capsule is bound to the package fingerprint recorded by the authorized install ledger.

If the underlying app contract changes after installation, materialization stops with a contract-drift hold until the OS receives a newly authorized install/update transition.

The capsule manifest is itself hashed. Local tampering fails closed.

## Removal

A capsule can be reconciled away only after the install ledger says the app is no longer installed. The ledger reaches that state only through a separately permitted OS uninstall transition.

Removal of this metadata capsule does not claim that arbitrary binaries were removed or processes stopped, because this phase never claims those existed in the first place.

## Future adapters

Later platform adapters can translate this same capsule contract into:

- a Linux user service/container
- an immutable desktop package
- an AOSP application/service boundary
- a WASM sandbox
- a browser worker
- a dedicated Evercraft device image

The authority model remains the same while the substrate changes.
