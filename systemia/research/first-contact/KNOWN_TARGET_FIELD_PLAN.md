# FIRST-CONTACT-001 | Known-target calibration acceptance plan

**November 9, 2026 · Research only · No observations collected yet**

## What is being validated

The immediate milestone is not alien propulsion. It is whether the existing Evercraft dual-bearing solver can estimate the position of a **known stationary target** from two independently positioned cameras, within a *predeclared error budget* and while refusing bad evidence.

The new `known-target-calibration.mjs` evaluates multiple synchronized bearing pairs against a supplied surveyed ground-truth ENU coordinate, reports the median / 95th-percentile / maximum **3D Euclidean positional error**, and computes the fraction of rejected observations. It does not authenticate calibration, surveying, timestamps or target identity. The `known-target-cli.mjs` produces a local SHA-256 receipt for a bounded JSON packet and makes no network calls.

## Safe test setup before any field collection

1. **Known target:** Choose an ordinary stationary, non-sensitive physical marker with independently recorded location relative to the cameras. No aircraft or restricted sites needed.
2. **Two observing devices:** Measure both camera positions in the same local East-North-Up frame. Record the measurement method, units, uncertainty, sensor IDs and intrinsic/extrinsic camera-calibration method.
3. **True angular measurements:** Convert target pixel coordinates to azimuth and elevation using independently calibrated optical and mounting geometry. A pixel position or a compass reading without error characterization is not a valid bearing.
4. **Timebase:** Verify simultaneous capture timing independently of timestamps written in a file. The current program requires identical integer millisecond capture times for each pair. Merely assigning equal timestamps does not validate synchronization.
5. **Same target:** Independently establish both cameras observed the same stationary reference point. Keep original media and independent survey records locally with appropriate privacy and rights controls.
6. **Predeclared thresholds:** Before capture, specify maximum permitted ray miss, minimum parallax, maximum allowed 95th-percentile position error, maximum rejected fraction, and minimum accepted independent samples. Do not loosen thresholds after viewing the result and then advertise a pass.
7. **Stress cases:** Test a known bad camera bearing, a clock offset, repeat observations, narrow parallax and a deliberately biased but geometrically consistent target. Verify that none are silently accepted.
8. **Independent review:** A second reviewer checks the ground-truth survey and camera calibration against original records, with a documented measurement uncertainty budget, before any real-world accuracy claim.

## Offline software rehearsal (safe synthetic data)

```bash
node --test systemia/research/first-contact/*.test.mjs
node systemia/research/first-contact/known-target-cli.mjs systemia/research/first-contact/fixtures/known-target-synthetic-session.json
```

The supplied fixture contains five **invented observations** of an invented stationary target at ENU (50, 300, 25) meters. The operator evidence flags are intentionally set to true *to exercise software gates*, not to certify any field observation. A successful run must say `NUMERIC_GATE_MET_REQUIRES_INDEPENDENT_FIELD_VERIFICATION`, not `FIELD_VERIFIED`. Error is mathematically near zero because synthetic bearings were generated from the same invented exact coordinates, **not because a camera performed accurately**.

The source file's `inputSha256` documents the exact bytes used for this computational run. It is not a signature of recording provenance. For a field record, use a separate provenance ledger and original calibration evidence.

## Operator JSON contract

- `schema`: `evercraft.first-contact.calibration-session-input.v1`.
- `sessionId`: concise non-identifying identifier.
- `groundTruthMeters`: independently surveyed `{x,y,z}` ENU location.
- `samples`: 3–500 time-ordered `{first,second}` pairs using `observation-sync.mjs` bearing fields; each sample time must be strictly newer than the previous one.
- `evidence`: the five synchronization/position/target truth attestations plus `knownTargetIndependentlySurveyed` and `acceptanceThresholdsDeclaredBeforeCapture`; these are **self-reported**, not independently verified.
- `quality`: `maxRayMissMeters`, `minParallaxDegrees`.
- `acceptance`: `maxP95PositionErrorMeters`, `maxRejectedFraction`, `minAcceptedSamples`.

The tool refuses missing/invalid thresholds, missing ground-truth attestations, repeated timestamps, non-simultaneous camera observations and geometrically inconsistent rays. Even if numerical acceptance passes, the result remains unverified until an independent field record validates physical measurements.

## Remaining scientific gaps

- No independently authenticated or surveyed physical camera dataset has been supplied.
- Bearing-error covariance, shared clock/camera bias, lens distortion, refraction and uncertain ground-truth survey remain unmodeled. A small observed P95 error on biased or correlated readings is not a calibrated confidence interval.
- The current test file demonstrates **software rejection behavior**, not statistical coverage. Field sample count and acceptance thresholds must be justified before use.
- No triangulation result establishes novel propulsion, extraterrestrial origin, object size, or intent.
- No live Systemia agent dispatch, private camera integration, hardware work or public product release is authorized by this plan.

**Decision gate:** deliver one independently surveyed, non-sensitive known-target dataset and its source/calibration provenance, run the offline evaluation, then have a separate reviewer compare the output with independent ground truth. Record a success/failure with actual sample counts and errors, not a promotional claim.
