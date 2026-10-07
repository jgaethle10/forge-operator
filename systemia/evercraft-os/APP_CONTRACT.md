# Evercraft OS app contract

Evercraft OS apps are not standalone islands that each reinvent login, permissions, memory, compute, payments, notifications, and receipts.

An Evercraft-native app compiles against the shared operating spine.

## The inheritance model

A contract-ready app automatically targets the shared services:

- Evercraft Identity for authentication
- Passport for scoped authorization
- Context Fabric for provenance-aware memory
- Systemia / Execution Gate for consequential actions
- Yard / Evercraft Compute / Saban for legitimate capacity
- Evercraft Network for transport and continuity
- Meter for usage accounting where declared
- Evercraft Payments as the canonical commerce layer
- Notification Fabric for delivery
- receipt reconciliation back into institutional memory

Inheritance means the service is the standard OS integration point. It does **not** mean unrestricted access.

## Requested is not granted

The package compiler may expose scopes declared by Capability Mesh. Those remain requests or contract declarations.

The package itself grants:

- no identity
- no Passport scope
- no execution authority
- no compute lease
- no payment authority
- no device capability

Actual authority remains with the owning subsystem.

## Contract-ready is not installed

A product is currently `contract_ready` only when it has a complete Capability Mesh contract with adoption stage `shared_runtime`.

That does not prove:

- it is installed on a device
- a runtime is healthy
- a payment path is live
- a customer is entitled
- an action is authorized
- a sensor is available
- a device permission has been granted

The app catalog therefore exposes architectural readiness without manufacturing runtime state.

## Device permissions

No device capability is inferred from product name or product class.

A future package may explicitly request capabilities such as:

- camera
- microphone
- location
- Bluetooth
- telephony
- secure element
- filesystem scopes
- GPU/accelerator classes

Those declarations will still require Passport and runtime authorization before access.

## Current truth

The public product graph is much larger than the current shared-runtime contract set. That is useful pressure.

Products without a complete shared-runtime contract remain visible in the catalog but are held from the OS install flow. The operating system therefore turns architectural debt into a machine-readable migration queue rather than silently pretending every product is integrated.
