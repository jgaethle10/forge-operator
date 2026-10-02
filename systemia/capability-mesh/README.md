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

Adoption coverage is rendered live by `mesh.mjs` from the current public-product registry, direct-door ledger, product contracts, repository evidence paths, and ratchet baseline. No checked-in generated coverage file is authoritative.

The live render exposes:

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


## Executable runtime policies

Capability Mesh compiles each complete product contract into a runtime policy on demand. Runtime policy snapshots are not source authority.

The policy is not a grant. It is the exact machine-readable declaration that downstream Systemia code may use to construct bounded inputs.

For example, the AliEV contract maps:

```
product_key: aliev
action: report.generate
Passport product: rivet
Meter product: rivet
Meter metric: site_reports
Meter quantity: 1 report
specialist door: aliev
context namespace: aliev
```

`buildExecutionGateInput()` turns that declaration into the shape expected by Evercraft Execution Gate. The caller supplies the actor, resource, exact request and Meter subject, while the product contract supplies the scope-to-meter and product-to-specialist semantics.

A caller cannot substitute an undeclared scope or select a different Meter metric.

`buildContextBinding()` similarly exposes the product's Context Fabric namespace and required scopes without granting those scopes.

This shifts product integration from hand-written glue toward **contract-compiled infrastructure**.


## ForensiScope canary contract

ForensiScope is the second explicit product contract, but the contract intentionally stops at the machine surface that is currently proven.

The registry manifest explicitly tells clients to start with `classify_media_route`. Public developer status verifies the remote MCP participates in live initialize/tools-list canaries, while also stating that secure machine media intake remains verification-gated.

Accordingly the current Capability Mesh contract declares:

```
product_key: forensiscope
action: classify_media_route
Passport product: forensiscope
Meter: not required for route classification
specialist door: forensiscope
context namespace: forensiscope
secure machine media intake: verification-gated
automatic media transfer: false
machine media-analysis action: not contracted
```

Published duration pricing is not converted into a Meter metric, because pricing tiers are not evidence of a machine usage-meter contract. Likewise the existence of internal distributed media proofs does not upgrade the public machine-intake boundary.

This is the intended behavior of Capability Mesh: make the strongest source-supported contract possible, then stop exactly where the evidence stops.


## No-new-debt ratchet

Capability Mesh has a dated migration baseline for the portfolio that existed when the shared trust-chain program began.

The baseline does **not** excuse missing contracts. Existing gaps remain visible migration debt. Its purpose is to distinguish migration work from regression.

After the baseline:

- a new public product without a complete contract is a blocking regression
- a grandfathered public product that gains a new specialist door without a complete contract is a blocking regression
- a new specialist-only door outside the public product index requires explicit human review
- existing uncontracted products remain medium-priority migration findings instead of falsely making the whole portfolio unavailable

Portfolio Sentinel consumes the ratchet state. New adoption debt is high severity; grandfathered debt remains medium. This means the migration can proceed incrementally while the architecture can no longer get worse quietly.

The rule is intentionally asymmetric:

> We may inherit old debt. We do not create new debt.


## Evercraft Clip canary contract

Evercraft Clip is the third explicit contract and demonstrates how Capability Mesh handles a product whose public MCP is intentionally read-only even though deeper authenticated production workflows exist.

The public machine contract declares only:

```
get_clip_capabilities
plan_clip_job
```

It does not contract private-media upload, checkout, paid rendering, or social publishing. Facebook, LinkedIn, and Instagram publishing code paths may exist inside authenticated Clip workflows, but that is not public agent publication proof. TikTok remains explicitly unverified.

The contract therefore compiles planning into the specialist route without inventing Meter charges, payment state, rendering authority, or publishing authority.


## Adoption stages

Contract completeness and shared-runtime integration are deliberately separate.

Every product contract declares one adoption stage:

- `shared_runtime` — the contracted machine actions are allowed to compile into the shared Passport / Context / Meter / Execution Gate path.
- `private_runtime` — a verified product-private runtime exists, but shared Evercraft trust-chain integration is not yet claimed.
- `discovery_only` — the public product record is intentionally discovery/front-door only; private workflows may exist, but no shared machine execution contract is claimed.

A complete `private_runtime` or `discovery_only` contract satisfies the no-unknown-debt ratchet because the architecture is explicit, but it stays in `contracted_not_shared_runtime` migration work. `buildExecutionGateInput()` and `buildContextBinding()` fail closed unless the product is `shared_runtime`.

This distinction prevents "we documented it" from becoming "Systemia may execute it."

## Current-trunk adoption snapshot

The current integration branch evaluates 64 public products.

- 7 have explicit complete contracts
- 4 are `shared_runtime`: AliEV, ForensiScope route classification, Evercraft Clip read-only planning, FindMyPart free Part Passport triage
- 1 is `private_runtime`: Opportunity Fabric
- 2 are `discovery_only`: EverNest Atlas and Systemia University
- 57 grandfathered public products remain in the migration queue
- 11 public direct-door products still need contracts
- the ratchet remains PASS because all three products added after the original 61-product baseline now have explicit contracts

The baseline is not moved forward to hide new products. New products are contracted against the original migration boundary.


## FindMyPart canary contract

FindMyPart is the fourth shared-runtime contract and the seventh explicit product contract overall.

The contracted machine action is exactly the live free first step documented by the product:

```
free_part_triage
```

It creates no charge and can produce an evidence-aware Part Passport. Paid Quick/Deep/Rescue hunts, checkout, vendor contact, purchase, fitment claims, inventory claims and successful resolution are not inherited by this contract.

That lets Systemia route free triage through the shared trust chain while keeping commercial and compatibility claims behind their own evidence and human-confirmation boundaries.


## Derived state is disposable

Capability Mesh intentionally keeps derived coverage and compiled runtime policy out of the source-of-truth path.

Authoritative inputs are:

- `registry/public-products.json`
- `public/.well-known/evercraft-direct-door-readiness.json`
- `systemia/capability-mesh/contracts.json`
- `systemia/capability-mesh/ratchet-baseline.json`
- referenced source evidence

`mesh.mjs --check` renders current coverage in memory and fails on incomplete explicit contracts or ratchet regressions. `runtime.mjs --check` compiles current runtime policies in memory and verifies that none grant authority.

Portfolio Sentinel calls the live renderer directly each cycle.

This prevents a moving `main` branch from invalidating a PR merely because a generated snapshot was computed against an older base. Derived state can be reproduced at any time; source truth cannot be silently replaced by it.
