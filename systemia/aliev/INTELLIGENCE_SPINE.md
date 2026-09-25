# AliEV Intelligence Spine

Status: P0 implementation contract for Systemia issue #210.

## Canonical lineage

Original RIVET was the broad EV intelligence platform. That intelligence platform was repurposed and rebranded as AliEV when modern RIVET became the reporting and customer-delivery company.

This lineage is semantic, not destructive. Legacy records may retain historical RIVET identifiers, but their canonical product lineage is AliEV when they belong to the original intelligence platform.

## One-machine boundary

EV sources / crawlers / TOWI / FAIE -> Canonical Data Foundry + Entity Graph -> AliEV intelligence authority -> evidence package v1 -> RIVET reporting/customer delivery -> BEAST MODE verified artifact logistics -> authorized destination -> outcomes back to Foundry and AliEV.

Systemia owns admission, deduplication, dependency checks, priority, capacity, standards, sequencing and receipt lineage. Saban may fan out bounded reconciliation and verification work. Neither creates new data authority.

## Evidence invariants

- missing is never zero
- modeled is never observed
- registration flow is never active stock
- mapped charger inventory is never utilization
- announced is never operating
- aggregate usage is never silently converted into individual session telemetry
- program presence is never incentive eligibility
- source authority, license, geography, effective time, freshness and semantics travel with the observation

## AliEV evidence package

Modern RIVET consumes one source-backed package from AliEV rather than rebuilding EV intelligence independently.

Schema: `evercraft.aliev.evidence-package.v1`.

Required envelope fields: `site`, `generated_at`, `observations`, `derived_signals`, `artifacts`, `lineage`, and `quality`.

Each observation must preserve a source record identifier, authority, license/provenance, geography, effective time, observed/sourced/modeled state and freshness. Derived signals must identify their input observations and method/version.

## RIVET boundary

RIVET owns customer intake, report requests, entitlement/payment state, presentation, report assembly, QA and authorized delivery. It may cache an AliEV package for reproducibility, but the cache is not an independent truth store. Corrections to EV intelligence flow through AliEV/Foundry lineage.

## Legacy reconciliation

Do not bulk rename or destroy historical RIVET records. Reconciliation produces aliases with legacy product, legacy record id, canonical product, canonical entity id, lineage state and source-backed mapping evidence.

Allowed lineage states: `mapped`, `ambiguous`, `quarantined`. Ambiguous mappings fail closed to review. No inferred alias may overwrite source provenance.

## Artifact lane

Site plans and report artifacts use the existing `evercraft.beast-mode.cargo.v1` lane. `DELIVERED` requires destination existence, exact SHA-256 and byte count, provenance, permissions and a receipt. HTTP success alone is not delivery proof.

## Release canaries

The machine is not unified until receipt-backed tests prove all of these:

1. A known legacy RIVET intelligence record is queryable through AliEV with historical lineage intact.
2. A fresh EV observation admitted through Foundry becomes queryable through AliEV.
3. AliEV emits `evercraft.aliev.evidence-package.v1` and RIVET consumes that exact package to render a report.
4. Sites 1-7 travel AliEV -> BEAST MODE -> RIVET with exact destination readback verification.
5. The 6405 W Chestnut Ave authenticated regression canary reaches `generation_state=ready` with source-backed evidence.
6. Owner/team and paid-customer report paths are verified independently.
7. Outcome/performance observations can return to Foundry without mutating historical source evidence.

No code review, build pass, contract fixture, HTTP 200, or UI screenshot substitutes for these authenticated end-to-end receipts.
