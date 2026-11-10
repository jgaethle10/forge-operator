# Evercraft Spatial Perception QA V1 | stereo lab

Status: **source implementation and synthetic checks only**. Not a field-calibrated depth system, deploy receipt, public-route receipt, driving assist, geographic survey, or forensic-grade measurement.

## What changed from V0
- The V0 stereo matcher runs as before. The V1 audit cross-checks sampled disparities against **right-to-left** matching.
- A photometric match-quality threshold additionally rejects reverse patches with poor pixel agreement. A corrupted right image should fail closed even if a low-information reverse search happens to find a nominal disparity.
- The interactive browser lab presents source images, filtered depth samples, the percentage retained after left/right checks, a generated-sample accuracy comparison, and a rotatable point-cloud preview.
- The point-cloud grid is a **camera-local reference plane**, not an inferred physical ground surface, street, terrain mesh, or GPS map.
- A standalone API compares detected camera-axis **Z depth**, measured in meters, to independently provided reference **camera-axis Z depth**. Slant range is NOT the same measurement.

## Code paths
- Stereo estimator and product adapters: `public/worlds/spatial-perception.mjs`
- V1 correspondence and reference comparison: `public/worlds/spatial-audit.mjs`
- Camera-relative preview: `public/worlds/perception-lab/scene-viewport.mjs`
- Browser lab: `public/worlds/perception-lab/index.html`
- Tests: `tests/spatial-perception.test.mjs`, `tests/spatial-audit.test.mjs`, `tests/spatial-viewport.test.mjs`

Run: `node --test tests/spatial-perception.test.mjs tests/spatial-audit.test.mjs tests/spatial-viewport.test.mjs`

## Field-test procedure (not completed)

1. Obtain **two synchronized stereo cameras** with fixed measured baseline and documented intrinsic parameters at the original image resolution. Capture authorized test footage, not public road surveillance.
2. Correct lens distortion and rectify both images using the same calibrated rig. The current module expects rectified grayscale pixel arrays and does **not** rectify frames itself.
3. Establish at least five independent measured **camera-axis Z** targets spanning near/mid/far regions, including a weak-texture negative-control scene. Record physical target alignment, measurement uncertainty, focal length, baseline, timestamp, frame sizes, and a SHA-256 digest of each original source.
4. Run stereo estimation and reverse audit; record raw count, retained count, photometric rejections, bad-match rejections, depth coverage, and memory/runtime behavior.
5. For each measured object box, call `compareRangingTargets` with a unique ID, `cameraAxisDepthM`, image box, and reference method. Report MAE and RMSE only for targets that had enough valid samples. If none qualify, all errors remain **null**, not zero.
6. Preserve original images, camera calibration, test notes, and source hash separately from the derived visualization. An independently reviewed field receipt must gate any production claim.
7. Repeat on native Safari and Chrome mobile hardware. Record performance, battery consumption, and browser failures without equating browser rendering with inference accuracy.

## Explicit authority and privacy boundaries
- A high left/right consistency percentage is NOT proof of accurate scale, lack of optical calibration error, or reliable occlusion handling.
- Objects can be represented in temporary Worlds previews, but are noncolliding and nonauthoritative. No live world persistence is automatically granted.
- ForensiScope events remain review-required. No automatic chain-of-custody assertion or legal conclusion.
- EverMaps records remain unlocated, with `severity:null` and `urgency:'not_assessed'`. Condition, danger, and urgency require separately supported evidence.
- No YOLO weights, object tracking, movement-speed estimator, camera ego-motion reconstruction, SLAM, or geographic registration have been added. Those are separate engineering milestones.
- Uploaded browser images remain local. No backend camera intake, off-device upload, or exterior paid hosting is introduced.
