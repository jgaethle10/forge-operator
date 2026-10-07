# Translation Layer — NFL Big Data Bowl 2027

## Systemia admission state

Preparation is authorized. Kaggle competition rules have **not** been accepted through this workstream, competition data has not been accessed, and no submission has been made.

## Problem

The launch brief asks competitors to connect NFL Scouting Combine player-tracking movement with regular-season NFL tracking in a way that is useful to coaches, scouts, and front offices.

Translation Layer treats that as a transfer problem rather than a raw athletic-ranking problem:

**Combine movement → role-aware movement signature → comparable on-field behaviors → evidence-backed scouting/development signal.**

## Reuse-first Evercraft fit

Existing Evercraft strengths that can be reused without fabricating sports expertise:

- provenance and evidence-state labeling;
- feature lineage and modeled-vs-observed separation;
- similarity and ranking systems;
- uncertainty-preserving decision support;
- visualization/report packaging;
- Systemia build/test and Raven QA.

## Candidate analytical spine

1. Normalize drill tracking into mechanically meaningful features such as acceleration profile, deceleration control, change-of-direction geometry, path efficiency, peak/usable speed, asymmetry, and repeatability.
2. Build position-specific regular-season movement features that are behaviorally comparable rather than naively identical to Combine drills.
3. Learn translation relationships by position and role.
4. Produce prospect similarity neighborhoods and movement-transfer residuals.
5. Surface hidden-talent and development signals with uncertainty and supporting feature evidence.
6. Package results for football decision-makers, not only data scientists.

## Gates before real modeling

- Human accepts current Kaggle competition rules.
- Competition data access is confirmed.
- Current-year evaluation/submission requirements are captured verbatim.
- Data license and external-data restrictions are recorded.
- Raven validates leakage controls before any claimed result.

## Truth boundary

There are no model results in this scaffold. Any future metric must come from a reproducible run against provider-authorized data and be preserved with a receipt.
