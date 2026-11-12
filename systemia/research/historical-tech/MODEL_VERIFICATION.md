# HIST-TECH-001 | Stage 4 Mathematical Cross-Check and Negative Controls

**Scope:** Source-only independent *mathematical formulation* check, not an independent physical experiment or peer review. No device energized, measured, purchased, or deployed. Validation file: `elliptic-reference.mjs`; regression tests: `elliptic-reference.test.mjs`.

## Source and method
- Primary historical reference: Edward B. Rosa and Louis Cohen, *Formulæ and Tables for the Calculation of Mutual and Self-Inductance*, U.S. Bureau of Standards Bulletin, vol. 5, p. 6, Eq. (1), Maxwell’s coaxial-circle formula. Original: https://nvlpubs.nist.gov/nistpubs/bulletin/05/nbsbulletinv5n1p1_A2b.pdf
- Independent current NIST formulation: *Digital Library of Mathematical Functions*, §19.34, coaxial circles: https://dlmf.nist.gov/19.34
- Existing `coupling-model.mjs` evaluates the reduced Neumann line-integral directly over the relative loop angle.
- New `elliptic-reference.mjs` instead evaluates the equivalent expression in *complete elliptic integrals* `K(k)` and `E(k)`, each numerically integrated over a separate 0..π/2 angular domain. Both are physics-equivalent and use the same SI permeability approximation.
- The cross-check is intentionally limited to elliptic parameter `0.015 ≤ k² ≤ 0.995`; it refuses regimes where cancellation or the near-singular integrals threaten numerical confidence. 2048 vs. 4096 panel convergence is verified.

## Reproducible model-only comparison
Setup: ideal coaxial thin circular filaments; transmitter radius 25 mm, receiver radius 15 mm; two coincident transmitter turns, three coincident receiver turns. Ideal nonmagnetic free-space geometry with no wire thickness, metal, ferrite, resonance, load, resistance or thermal behavior.

| Axial gap (mm) | Direct Neumann (μH) | Maxwell elliptic (μH) |
| ---: | ---: | ---: |
| 10 | 0.0867990521 | 0.0867990521 |
| 20 | 0.0461163640 | 0.0461163640 |
| 30 | 0.0249829714 | 0.0249829714 |
| 40 | 0.0143771065 | 0.0143771065 |
| 60 | 0.0056866524 | 0.0056866524 |
| 80 | 0.0027115960 | 0.0027115960 |

The values shown are **two software calculations, not observed physical data**. Regression tests require agreement within 2 parts per million across the six spacings and two additional coil geometries, and separately test reciprocity, scaling, and invalid input rejection. The two formulations share physical assumptions; their agreement is not evidence of a novel power source or real device efficiency.

## Pretrial data-sanity hardening
The `bench-evaluator.mjs` validation now requires:
- A `receiver_absent` control whose loaded output power does **not exceed the stated output uncertainty**. A significant observed signal in the absent-receiver condition invalidates the minimum-control result.
- A `misaligned` control with at least 5° angular difference from an aligned trial **at the same separation**; changing both distance and angle without a matched aligned comparison no longer counts as this specific control.
- Existing checks remain: three aligned repeats, loaded DC input/output accounting, explicit nonzero uncertainty for measured entries, raw data references and a recorded safety review.

Synthetic fixture readings are still **not** measurements, and a passing `experimentalDesignComplete` only signals that the minimal validation checks were satisfied. It is not proof of safety, provenance, independent trial replication or publication readiness.

## Commands
```bash
node --test systemia/research/historical-tech/*.test.mjs
node systemia/research/historical-tech/bench-evaluator.mjs systemia/research/historical-tech/synthetic-example.json
```

## Next scientific gate
An independent human metrology/physics reviewer must inspect formula assumptions and the actual bench plan. A low-voltage product with documented power limits, calibrated instruments, correct DC source/load points, source-power inventory and a written stop-condition review must be approved **before** any energized trial. Only original raw observations with uncertainty and source provenance support an eventual physical claim.

**Never describe a GitHub issue, model comparison, or green CI job as actual Systemia/Saban worker execution or hardware testing.**
