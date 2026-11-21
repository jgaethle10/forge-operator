# FIRST-CONTACT-001 | Camera baseline and error-stress plan

**2026-11-09 · Model status: CI-tested synthetic software, not validated field instrumentation**

## Objective

Choose observer locations that give **measurable parallax** for a known target, test the impact of angular noise and shared misalignment, and *then* independently validate a real two-camera arrangement against ground truth. More camera separation improves range geometry only under otherwise comparable assumptions; it is not an unconditional field-accuracy guarantee.

## New offline planner

From the existing research branch checkout:

```sh
node --test systemia/research/first-contact/*.test.mjs
node systemia/research/first-contact/baseline-planner-cli.mjs systemia/research/first-contact/fixtures/baseline-plan-no-bias.json
node systemia/research/first-contact/baseline-planner-cli.mjs systemia/research/first-contact/fixtures/baseline-plan-shared-bias.json
```

Both JSON packets are explicitly invented synthetic examples, **not recorded sensor data**. The CLI hashes exact input bytes, performs no network requests and produces a summary of accepted/rejected solutions and errors **conditional on assumptions**. Read `baseline-sensitivity.mjs` for the model and `baseline-sensitivity.test.mjs` for the regression controls.

## Baseline thought experiment

Assumed first camera at ENU (0, 0, 0) meters, **stationary simulated** target at (0, 300, 20), second camera shifted laterally by the following amounts. Geometric angle uses exact invented positions.

| Lateral camera offset | Approximate angle between viewing rays |
| --- | ---: |
| 20 m | 3.81° |
| 60 m | 11.29° |
| 100 m | 18.40° |

These angles are geometry, not the observed angular accuracy of an iPhone, laptop or optical camera. The simulator injects **independent Gaussian** pointing noise and optionally a **shared azimuth bias**; it does not simulate lens distortion, camera clock errors, correlated position survey errors, refraction, false target association, wind or real-world weather. Large ray rejection can make the P95 of surviving samples look deceptively good; inspect **rejected fraction and reasons** as well.

### A physically manageable *candidate* layout

A modest **3-meter lateral baseline** and an ordinary stationary reference target **10 meters ahead** of camera A in an unobstructed, permitted space yield approximately `atan(3/10) ≈ 16.7°` separation if all three locations are level. This is a proposed layout, not a measured installation or accuracy endorsement.

Before collecting data, the operator must establish:

1. Two stable cameras and a safe, stationary reference marker with known ENU coordinates and permitted recording conditions.
2. An independent measurement of both camera centers, the marker center, and their uncertainties, not just a geolocation estimate on a phone.
3. Calibrated optical intrinsics and camera aiming/extrinsics so a detected pixel is converted to an azimuth/elevation with traceable uncertainty.
4. Verified clock synchronization and physically simultaneous target observations. Equal JSON timestamp strings alone are not proof.
5. Pre-capture error/rejection limits appropriate to measured calibration uncertainty and intended output accuracy, with a separate person reviewing survey and calibration source files.
6. A calibration record captured locally; no sensitive imagery, private locations or proprietary sensor feeds committed to GitHub.

**Do not set aggressive P95 criteria purely because a noiseless simulator passes.** The simulator tests mathematical sensitivity; field eligibility depends on measured hardware characteristics and survey accuracy.

## Required negative controls

- **Short baseline:** reduce lateral separation until the minimum-parallax gate rejects, demonstrating that an extremely weak range intersection is not treated as evidence.
- **Random pointing error:** hold the target fixed; compare simulated error statistics across baselines with the same seed and assumed angle error.
- **Shared systematic bias:** move both simulated azimuth angles by the same offset. Rays may still agree numerically while their inferred target position is wrong.
- **Tight ray-residual filter:** record the rejected fraction. A low error among only a few surviving synthetic samples does not prove general performance.
- **Wrong ground truth:** run the known-target calibration evaluator with an intentionally incorrect reference coordinate and verify that its numerical acceptance fails.
- **Desynchronization:** force a timestamp mismatch and confirm the two-view intake refuses an instantaneous reconstruction.

## Decision after the first authorized measurement

Compare a real, non-sensitive observed record against a separately surveyed reference target and preregistered acceptance criteria. Report measured median/P95/max position error, rejected samples, source provenance, camera calibration assumptions, and limitations. Mark result **FIELD_DATA_NOT_INDEPENDENTLY_VERIFIED** until the independent reviewer signs off. No claim about unusual aircraft, exotic propulsion, recovered material, or extraterrestrial origin may be inferred from this geometry trial.

No autonomous Systemia specialist is represented as running by this document; research intake is still NOT_DISPATCHED until a governed execution route and actual receipts exist.
