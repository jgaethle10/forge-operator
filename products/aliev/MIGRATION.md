# AliEV Yard migration

AliEV is the intelligence platform behind RIVET. This directory begins extraction of the live intelligence core from Base44 into the Systemia → Yard Operator → Evercraft Compute path.

## Boundary
AliEV owns ingestion, evidence/provenance, charger/session intelligence, traffic, utility/tariff, incentives, property context, modeling and bounded intelligence snapshots. RIVET owns commercial decision delivery, customer workflow, reports, site plans and the sales experience. Systemia owns admission, orchestration, policy and receipts. Yard / Evercraft Compute owns runtime and release.

## First contract
Preserve `energySiteLookup` with `mode: "rivet_report_snapshot"` first. The current source imports large generated traffic/AFIR cache modules; those are intentionally recorded as extraction dependencies rather than pretending this first commit is independently runnable.

A migration is not complete until a real RIVET request reaches `generation_state=ready` with source-backed evidence through the Yard path.
