# Evercraft OS Systemia launch path

An installed capability capsule does not execute itself.

Evercraft OS launches capability work through the existing Evercraft authority chain:

```text
installed + verified capsule
        ↓
Systemia Control Plane mission admission
        ↓
Capability Mesh contract compilation
        ↓
Execution Gate prepare
        ↓
Passport action permit + optional Meter reservation
        ↓
Execution Gate start
        ↓
permit consumed + Meter committed
        ↓
registered specialist dispatcher
        ↓
owned or governed runtime
        ↓
dispatch receipt
        ↓
Execution Gate completion
        ↓
Evercraft OS launch receipt
```

## Systemia stays first

The launcher first asks the Systemia Control Plane to admit the work as a mission task.

A capsule cannot bypass Systemia by naming a specialist directly.

The mission admission receipt proves policy evaluation only. It does not grant execution authority.

## Execution authority

Capability Mesh compiles the installed product's declared authority, execution, route, and Meter semantics into the existing Evercraft Execution Gate input.

The Execution Gate:

- verifies Passport authorization;
- reserves Meter capacity where the action is metered;
- mints a single-use action permit;
- refuses dispatch while the lease is only prepared;
- consumes the permit at start;
- commits the Meter reservation at start;
- records completion against a dispatch evidence receipt.

No dispatcher is called before the gate reaches `started`.

## Dispatcher boundary

A dispatcher is registered by specialist slug. The current first owned dispatcher is AliEV/RIVET report generation.

The dispatcher does not receive raw provider credentials from the capsule. The RIVET dispatcher reads its private team token from a permission-restricted file owned by the runtime boundary.

If no dispatcher is registered, the launch remains held while the Execution Gate lease stays prepared. The action permit is not consumed.

## First real end-to-end proof

The proof runs:

- an installed AliEV capability capsule;
- Systemia mission admission;
- the real Capability Mesh contract for `aliev / report.generate`;
- the real Evercraft Execution Gate;
- the real Passport implementation;
- the real Meter implementation;
- a local owned AliEV source runtime;
- the real owned RIVET report runtime;
- the OS RIVET specialist dispatcher;
- report persistence and source-snapshot verification;
- Execution Gate completion and OS launch receipts.

The source runtime uses deterministic local proof geocoding so CI does not require a public network call.

## What remains separate

This path proves a governed capability execution. It is not yet a general arbitrary-process launcher.

A future Linux/AOSP/WASM adapter may execute local packaged workloads, but those adapters must preserve the same Systemia, Passport, Meter, capsule-integrity, and receipt boundaries.
