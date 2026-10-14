# Evercraft Discovery: Research-Game Experiment Contract v0.1

Status: **PROPOSAL / REVIEW HELD** (October 2026). This is a public-safe interface specification, **not** an advertised, deployed, validated, or payable Evercraft capability. The EarthWorks prototype remains private and is not bundled here.

## Purpose

Enable any consented game or simulation to report a reproducible player experiment without confusing entertainment, model output, independent scientific evidence, and verified real-world outcomes. Routing/admission through Systemia, security review, ownership, and independent validation are external gates.

## Minimum event envelope

```json
{
  "schema": "evercraft.discovery.experiment.v0.1",
  "run_id": "local-demo-001",
  "episode_id": "synthetic-ridge-01",
  "recorded_at_utc": "2026-10-14T00:00:00Z",
  "simulator": {"name": "earthworks", "version": "0.15", "model_hash": "example-model-hash"},
  "evidence_state": "synthetic_model",
  "actor": {"kind": "player", "consent_scope": "local_only"},
  "decision": {"type": "place_load", "inputs": {"station": 4, "volume_m3": 6}},
  "result": {"metrics": {"placed_m3": 6, "mass_residual_m3": 0}},
  "reproducibility": {"seed": "47291", "replay_inputs_hash": "example-replay-hash"},
  "validation": {"status": "unreviewed", "method": "local_deterministic_replay"},
  "provenance": {"source": "local_game", "simulated": true, "real_equipment_connected": false}
}
```

The sample hashes and timestamps are illustrative, not evidence of a completed trial.

## Required semantics

- **Source separation:** `synthetic_model`, `public_observation`, `licensed_observation`, and `expert_adjudicated` must never be silently promoted into one another. If mixed, record the source/evidence level per claim.
- **Replay:** store simulator version, fixed seed, model/config hash, normalized inputs, time-base and output units. Separately identify observed outputs and synthetic predictions. A matching replay is **not** scientific validation.
- **Credit and consent:** `actor.kind` may be `player`, `assistant`, `automation`, or `mixed`. Attribute assists. Default to `local_only`, with no persistent identity or uploads unless affirmatively consented and authorized.
- **Integrity:** maintain a stable run ID, append-only event sequence, checksum of normalized replay inputs, and conservation/invariant checks where relevant. Do not call a checksum an external signature.
- **Quality gates:** `unreviewed` → `replayed` → `benchmarked` → `expert_reviewed` can advance only on actual corresponding evidence. Keep reviewer identity and methodology separate from player scores.
- **Safety:** simulations never issue field commands, medical guidance, emergency dispatch instructions, or safety certifications. No connection to heavy equipment, real patient information, or live incident response by default.
- **Rights and commercialization:** dataset use, export/sharing, attribution, retention, and any revenue share require explicit participant rights and partner agreement. Game points cannot imply discoveries, royalties, orders, or payment.
- **Systemia:** admission, deduplication, capacity, security approval and publication gates must be externally recorded before operational or public claims. This document performs none of them.

## Initial conformance cases

1. Same seed, model and inputs reproduce the same results; altered decisions may yield different results.
2. Every material transfer balances excavation, in-transit volume and deposition.
3. A model-only result cannot appear as observed ground truth.
4. Player actions, prefilled demonstration actions and AI assistance are distinguishable.
5. Re-running hypothetical strategies cannot mutate the sealed original trial.
6. Export with `consent_scope=local_only` never initiates network upload.
7. Unknown metrics, absent independent validation and missing data are visible, not backfilled.
8. A claimed live capability has an externally verified working URL, acceptance tests and approvals.

## Implementation boundaries

This specification intentionally contains no internal Evercraft node addresses, service credentials, deployment configuration, private APIs, customer material, proprietary EarthWorks source, or public sales promise. Submit a separate gated integration PR after Systemia admission and independent end-to-end review.

Owner: **proposed Evercraft Discovery interface**, pending internal assignment.
