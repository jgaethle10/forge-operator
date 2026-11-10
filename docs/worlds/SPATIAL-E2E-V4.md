# Evercraft Spatial Perception V4 | Full synthetic offline processing proof

**Status:** Source/CI test milestone. This is **not** field validation, a real object detector, a real-camera depth accuracy receipt, a live service, or an authoritative reconstruction.

## What V4 actually proves

V3 had component tests and a Python-to-JavaScript schema bridge using constructed observations. V4 introduces a separate full-pipeline smoke test, `systemia/spatial-perception/e2e_synthetic_stereo.py`, which:

1. Builds an **original, artificial** 4-frame stereo AVI from deterministic pixel arrays with a known 8-pixel left/right offset.
2. Builds a tiny **constant-output** ONNX graph shaped like one unfused YOLOv8 detection proposal. This graph is not a trained detector, and the artificial proposal does **not** establish object recognition performance.
3. Locally hashes model and source bytes, checks the rights manifest, executes actual ONNX Runtime CPU inference, runs OpenCV SGBM stereo matching, maps the proposal to the left frame, and writes 0600-permission observation JSON.
4. Loads that actual JSON through the **existing** JavaScript temporal association engine and checks that the Worlds, ForensiScope and EverMaps adapters retain their review/authority restrictions.
5. Verifies that tampering with the ONNX checksum and omitting source authorization both fail without output.
6. Exercises a textureless negative-control video and requires **unknown depth and no 3D camera point**, not a fabricated object distance.

The V4 camera depth gate rejects central regions with insufficient texture, insufficient valid disparity support or large disparity dispersion. This is a conservative *quality heuristic*, not calibrated uncertainty or stereo correspondence proof.

## CI and environment

The existing `.github/workflows/spatial-perception-v0.yml` now includes `synthetic-end-to-end`. On ephemeral GitHub CI with Python 3.11 and Node 22 it installs pinned NumPy, OpenCV-headless, ONNX and ONNX Runtime, executes the synthetic test, and does not fetch or ship pretrained weights or footage.

To reproduce on an owned machine after installing those libraries in a local isolated environment:

```sh
python3 -m unittest discover -s systemia/spatial-perception -p 'e2e_synthetic_stereo.py' -v
```

The older dependency-free contracts remain:

```sh
python3 -m unittest discover -s systemia/spatial-perception -p 'test_*.py' -v
node --test tests/spatial-offline-bridge.test.mjs tests/spatial-temporal.test.mjs
```

## Still NOT proven

- Real YOLO detection accuracy, false positives or changes in lighting, object identity or tracked real traffic.
- Lens distortion, calibration, rectification validity, timestamp precision or real depth-vs-independent-range accuracy.
- True metric motion under camera movement, scene mesh reconstruction or latitude/longitude.
- Actual phone Safari/Chrome video performance, a public deployed URL or production customer use.
- Legal/forensic chain of custody, safety-critical suitability, or unrestricted Systemia autonomy.

## Practical next field gate

Acquire an authorized **stereo** rig/capture with calibration and independent measured targets, a locally licensed unfused YOLOv8 ONNX model, and locally confirmed video rights. Then use the V3 CLI as documented in `SPATIAL-OFFLINE-STEREO-V3.md`. Record calibration, camera pair source hashes, depth coverage, confidence distributions, MAE/RMSE against known camera-axis Z references, object-detection metrics and visual failure cases. Human review precedes any promotion into authoritative storage.

No Base44 runtime, remote inference provider, model download or external video upload is added by V4.
