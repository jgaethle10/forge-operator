# RIVET Site Plan Runtime

This is the Evercraft-owned site-plan compiler runtime being evacuated from Base44.

## Authority boundary

Code lives in Forge Operator. Customer/project site data does not.

Runtime data is injected through:

- `RIVET_SITEPLAN_DATA_ROOT`
- `RIVET_SITEPLAN_SOURCE_ROOT`
- `RIVET_SITEPLAN_COMPILER_ROOT`

The default local data root is `var/rivet-siteplans/`, which must remain untracked.

## Current migrated stages

- identity normalization
- evidence/model compilation
- geometry compilation
- lineage/stale-descendant guard

Renderer, aerial acquisition, visual QA, correction orchestration, immutable artifact promotion, and Yard workload packaging are the next tranche.

## Non-negotiable invariants

- identity/address/parcel changes invalidate descendants by hash
- missing is never zero
- modeled is never observed
- existing-stall retrofit requires a defensible host surface
- proposed-new-build requires explicit civil scope
- external delivery is never authorized by compilation
- no Base44 filesystem, SDK, API, or function endpoint is required by these migrated stages
