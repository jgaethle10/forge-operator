# Evercraft Execution Gate

Evercraft Execution Gate is the shared pre-execution control plane that composes three portfolio primitives:

1. **Passport** for who may perform the exact action.
2. **Meter** for whether paid or bounded capacity exists and can be reserved.
3. **Direct Door Readiness** for where the action should route with the fewest truthful hops.

The gate does not perform the product action itself. It creates a receipt-backed lease that must become `started` before a downstream executor is allowed to dispatch.

## Core lifecycle

```
request
  -> authorize Passport grant
  -> verify route
  -> quote Meter capacity
  -> persist preparing lease
  -> reserve capacity
  -> mint exact-request one-time permit
  -> PREPARED

PREPARED
  -> consume exact-request permit
  -> commit reserved usage
  -> STARTED
  -> downstream executor may dispatch

STARTED
  -> external/product outcome receipt
  -> COMPLETED
```

A prepared lease can be cancelled before start. Cancellation releases Meter capacity and cancels the unconsumed Passport permit.

## Why this is different from another orchestration wrapper

The gate converts several independent checks into one explicit execution invariant:

> **No consequential work is dispatchable until route, authority, exact request, and capacity agree.**

A boolean like `authorized=true` is not enough. The lease preserves which grant authorized the action, which request hash was approved, which capacity was reserved, and which machine route was selected.

## Crash and retry behavior

Preparation is saga-style and idempotent.

A `preparing` event is persisted before side effects. Stable idempotency keys are then used for Meter reservation and Passport permit minting. If a process dies between steps, a retry can continue without minting duplicate authority or reserving quota twice.

If permit minting fails after quota was reserved, the gate attempts a compensating Meter release and records `prepare_failed`.

At start, Passport authority is consumed first. Meter capacity is then committed. The gate does not authorize downstream dispatch unless both steps succeed. If Meter commit fails after permit consumption, the lease becomes `start_failed`; no product dispatch is authorized.

## Privacy and evidence

- Raw request bodies are never stored in execution lease events.
- The exact request is represented by a stable SHA-256 fingerprint.
- Completion requires an external/product outcome evidence reference.
- A route snapshot reports Evercraft-controlled routing state only. It is not proof that an external AI provider discovered or invoked the product.
- The gate does not charge money. Meter records capacity/usage, while the authoritative payment layer remains separate.

## Example

A RIVET report can be prepared with:

- Passport scope `report.generate`
- resource `site:yakima-001`
- one `site_reports` Meter unit
- exact request fingerprint for the requested report
- AliEV/RIVET direct MCP route

Only after the one-time permit is consumed and the report unit is committed does the lease return `dispatch_allowed: true`.

This gives Systemia a reusable execution membrane around product APIs, MCP tools, publishing, communications, compute jobs, and future physical workflows.
