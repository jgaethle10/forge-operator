# FIRST-CONTACT-001 | Two-view reconstruction operator runbook

**Status:** offline research tool / bounded synthetic proof, not a certified sensor instrument.

## What the tool does

The `two-view-cli.mjs` command accepts a small JSON packet containing two bearing observations and the operator's calibration/synchronization assertions. It uses `observation-sync.mjs` to gate the input and `triangulation.mjs` to compute a mathematical 3D ray-intersection candidate in local East-North-Up coordinates. It writes a JSON receipt to stdout including a SHA-256 hash of the exact input bytes.

No network requests, recording uploads, agent dispatch, persistent filesystem changes or hardware actions are performed by the CLI.

### Try both reproducible controls

From a branch checkout:

```sh
node --test systemia/research/first-contact/*.test.mjs
node systemia/research/first-contact/two-view-cli.mjs systemia/research/first-contact/fixtures/synthetic-synchronized.json
node systemia/research/first-contact/two-view-cli.mjs systemia/research/first-contact/fixtures/synthetic-desynchronized.json
```

The synchronized **synthetic** fixture contains an invented stationary 3D target at East=50 m, North=300 m, Up=25 m. It should yield `CANDIDATE_REQUIRES_INDEPENDENT_REVIEW`, **not** a verified physical observation. The desynchronized fixture shifts the second timestamp by 10 ms; the command should refuse to compute a target and exit with status `3`. Input/schema errors exit with status `2`, accepted candidate evaluations with `0`.

The example's `evidence` values are deliberate synthetic positive assertions to test the program. They are **not** field calibration certificates.

## Required input contract

`schema` must be `evercraft.first-contact.two-view-input.v1`. Supply `caseId`, `first`, `second`, `evidence`, and `quality`:

- `first` / `second`: unique `sensorId`, integer `captureEpochMilliseconds` from genuinely synchronized calibrated clocks, surveyed `observerMeters` in the **same local ENU reference frame**, `azimuthDegrees` clockwise from North, and `elevationDegrees` above the horizon. A camera-image pixel coordinate is **not** an azimuth without calibrated optical/extrinsic transformation.
- `evidence`: all five operator-asserted booleans `calibratedPointing`, `surveyedObserverPositions`, `synchronizedClocks`, `independentSensorIdentities`, and `samePhysicalTarget` must be affirmative. The software **does not independently prove** those statements.
- `quality`: numeric `maxRayMissMeters` and `minParallaxDegrees` (strictly between 0 and 90). Do not tune tolerances post hoc to manufacture agreement.
- Strict simultaneous capture policy: exact equality of calibrated capture timestamps is required because target velocity is *unknown*. Even matching timestamps cannot prove clocks synchronized. A positive time difference is a **HOLD**, not a motion estimate. Future asynchronously timed tracking requires a separately validated motion model and uncertainty budget.

## Interpretation and limitations

Two rays that mathematically approach each other within a user-provided residual threshold **do not establish object identity or origin**. Close-proximity triangulation error may be highly sensitive to angular error, particularly for distant targets with a short baseline. The geometric midpoint does not include covariance or independent source-identity authentication. Operator attestations may be false, incomplete or mistaken. Preserve full original records, timestamps, surveying and calibration provenance, chain of custody, independent source associations and uncertainty before any scientific conclusion.

Do not send sensitive or restricted imagery to the branch, paste private telemetry into GitHub issues, or disclose protected locations. Authorized records should be processed locally with controlled retention.

**Next required experiment:** collect genuinely synchronized, non-sensitive observations of a *known, stationary calibration target* using two independently surveyed cameras; pre-register the angular/range uncertainty threshold, then compare recovered position against independent ground truth. A verified engineering calibration target is the next milestone, not an asserted extraterrestrial craft.

## Output claims

- `HOLD`: cannot produce a geometrical candidate, with explicit reason.
- `CANDIDATE_REQUIRES_INDEPENDENT_REVIEW`: supplied geometry and assertions passed the script's controls. It **does not** mean a physical target, anomalous speed, alien origin or usable technology has been verified.
- `inputSha256`: authenticates the bytes seen by the script, *not* who created them, when the source observation occurred, or whether their factual contents are true.

**Release gate:** run dedicated `FIRST-CONTACT research verification` GitHub Action, independent scientific review, documented calibration and safety approval before any public claim. No agent execution is implied by this repository.
