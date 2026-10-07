# Evercraft OS

Evercraft OS is the owned computing layer that composes the Evercraft primitives already present in this repository into one user-owned, agent-native operating environment.

The first objective is not to replace the Linux kernel, Android kernel, firmware, or hardware drivers. The first objective is to make those layers interchangeable implementation details beneath an Evercraft-owned control plane.

## Product thesis

A conventional operating system primarily organizes processes, windows, files, devices, and local permissions.

Evercraft OS adds a higher-order contract:

- identity that survives any one device,
- scoped authorization and revocation through Passport,
- provenance-aware context and institutional memory,
- Systemia mission admission and orchestration,
- Saban capacity discovery and workforce formation,
- Evercraft Compute and Yard placement,
- Evercraft Network continuity across changing transports,
- provider-independent commerce through Evercraft Payments,
- a first-party human surface through Evercraft Home,
- receipt-backed state instead of green-status theater.

The computer is therefore not one laptop or phone. It is the authorized set of devices, compute, memory, network paths, agents, and services that the owner can lawfully bring into one operating environment.

## Initial stack

```text
hardware / firmware
        ↓
Linux-class host or compatible substrate
        ↓
NodeSeed device identity
        ↓
Evercraft Compute + Yard
        ↓
Evercraft Network continuity
        ↓
Evercraft Identity + Passport
        ↓
Evercraft Context Fabric
        ↓
Systemia mission authority
        ↓
Saban capacity and workforce
        ↓
Evercraft Payments
        ↓
Evercraft Home
```

The ordering is a responsibility graph, not a claim that each layer is a bootloader or kernel subsystem.

## Authority invariants

1. Evercraft Identity proves who the subject is. It does not grant arbitrary capability.
2. Passport owns scoped authorization, consent, delegation, revocation, and action permits.
3. Systemia remains mission authority.
4. Yard and Evercraft Compute own workload placement and runtime admission.
5. Saban may discover and assemble legitimate capacity, but it may not commandeer ungranted compute.
6. Evercraft Network owns transport and continuity, not mission authority.
7. Context Fabric may retrieve authorized memory, but memory never becomes execution authority.
8. Evercraft Payments owns canonical economic orders. Settlement providers remain replaceable adapters.
9. Evercraft Home is the human front door, not a bypass around Systemia or Passport.
10. Missing evidence is a hold, not a healthy status.

## Why userspace first

A kernel fork would force Evercraft to inherit years of hardware enablement, driver maintenance, power-management work, secure boot integration, accessibility work, graphics compatibility, and device certification before the product could create meaningful user value.

Instead, Phase 0 runs above a Linux-class substrate and proves the Evercraft operating contract on hardware we already control. Later we can descend into init, packaging, immutable images, AOSP, firmware, and purpose-built hardware where that creates real advantage.

## Phase 0 acceptance criteria

Phase 0 is complete when one authorized machine can:

- identify itself through NodeSeed;
- preflight the required Evercraft source components;
- boot the owned Home surface without an external app platform;
- authenticate through Evercraft Identity;
- authorize through Passport;
- admit a mission through Systemia;
- place bounded work through Yard / Evercraft Compute;
- allow Saban to use only legitimately offered capacity;
- preserve Context Fabric evidence semantics;
- preserve Evercraft Network continuity contracts;
- create an Evercraft Payments order without making Stripe or another processor the product boundary;
- emit receipts that distinguish source presence, runtime health, authority, and execution.

## This directory

- `os-manifest.json` is the canonical Phase 0 composition contract.
- `runtime.mjs` performs source-level boot preflight and emits a machine-readable operating envelope.
- `runtime.proof.mjs` proves the current repository satisfies the Phase 0 composition invariants.

This preflight deliberately does not claim that a service is deployed, reachable, authenticated, or healthy merely because its source exists. Runtime health stays the responsibility of the owning subsystem.
