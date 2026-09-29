# Evercraft Capability Mesh

Evercraft Capability Mesh is the adoption compiler for the shared Systemia nervous system.

The portfolio already has a public product registry and a capability runtime. Those answer two different questions:

- **Public registry:** what products are admitted to public discovery?
- **Capability runtime:** which executable adapter can perform a bounded work type?

The missing question was:

> **Has this product declared how it uses the common Evercraft trust and execution primitives?**

Capability Mesh answers that without inventing missing permissions.

## Product contract lanes

A product contract explicitly declares seven lanes:

1. **authority** — Passport product key and action scopes.
2. **context** — Context Fabric namespace and read/write scopes.
3. **meter** — Meter metrics, or an explicit reason metering is not required.
4. **intake** — Intake Fabric contract, or an explicit reason product-specific intake is not required.
5. **execution** — whether Execution Gate is required and for which scopes.
6. **relationship** — Interaction Ledger requirements, or an explicit reason they are not required.
7. **receipt_reconciliation** — where product receipts become institutional memory.

A contract also declares rollback policy, ownership, version, compatibility, and source evidence references.

## Missing means missing

The compiler never derives a Passport scope, Meter metric, or execution authority from a product name, README, public MCP route, or commercial offer.

If the contract is absent, the result is:

```
contract_state: missing
runtime_verified: false
```

If a lane says `not_required`, it must include a reason.

That makes architectural debt visible instead of quietly filling it with guesses.

## Source evidence is not runtime proof

The compiler checks whether declared source evidence paths exist.

That proves only repository evidence is present. It does not prove:

- the product is live
- the integration is deployed
- a provider can reach it
- the product is customer-ready
- the Meter path charges correctly
- the Execution Gate is actually enforced at the external product boundary

Runtime verification remains product-specific and receipt-backed.

## Adoption coverage

`adoption-coverage.json` is generated across every public product.

It exposes:

- complete declarations
- incomplete declarations
- missing contracts
- direct-door products that still lack a contract
- direct specialist doors that are not in the public product index

The first production canary is AliEV because the repository already contains concrete Execution Gate and Meter contract examples for RIVET report generation.

This is intentionally the beginning of a migration queue, not a fabricated claim that all 61 products are already wired.

## Long-term effect

New products should stop reinventing core infrastructure.

A product declares its contract, then Systemia can know which shared layers apply:

```
product contract
   ↓
Passport
Context Fabric
Meter
Intake Fabric
Interaction Ledger
Execution Gate
Direct Door
Receipt reconciliation
```

The compiler turns missing connective tissue into a machine-readable queue that KAIDANCE, Sentinel, Control Plane, and future product scaffolding can consume.
