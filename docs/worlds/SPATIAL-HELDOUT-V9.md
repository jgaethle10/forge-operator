# Evercraft Spatial Perception V9 | Independent stereo alignment proof

**Status: provisional held-out checkerboard engineering gate. Not a physical-rig field-accuracy result.**

V8 solves stereo intrinsics, relative pose, rectification maps and hashes. V9 measures a specific missing property on **separate, rights-cleared checkerboard pairs that were not used in the calibration fit**: after applying the calibrated rectification matrices to detected corners, do corresponding left/right corners share approximately the same image row?

This is a **vertical epipolar residual** test in pixels, not independent camera-axis distance accuracy, identity verification, hardware timestamp proof, camera baseline measurement or a safety certificate.

## Before you test

Use at least 10 simultaneous stereo board pairs for the V8 calibration. Keep the camera lenses, zoom, focus, mounting, orientation and image dimensions fixed. Separately capture at least **3 independent hold-out stereo checkerboard pairs** at changed poses. These must **not** be among the calibration input images. The V9 tool compares byte hashes of all hold-out images against every image recorded in the V8 calibration receipt and refuses duplicates.

Capturing left and right independently without hardware or otherwise validated synchronization is **not proof of simultaneous exposure**, even if the left/right images show a still checkerboard. Physical checkerboard size, camera rig identification, provenance and real source rights must be validated outside software.

## Hold-out manifest format

Save JSON next to the separate image pairs:

```json
{
  "schema": "evercraft.spatial-perception.heldout-checkerboards.v1",
  "sourceRights": "authorized_local_use",
  "rigId": "same-rig-id-as-V8",
  "checkerboard": {
    "columns": 9,
    "rows": 6,
    "squareSizeM": 0.025
  },
  "pairs": [
    { "left": "heldout-01-left.png", "right": "heldout-01-right.png" },
    { "left": "heldout-02-left.png", "right": "heldout-02-right.png" },
    { "left": "heldout-03-left.png", "right": "heldout-03-right.png" }
  ]
}
```

All names and measurements above are examples, **not claims of actual existing files, a real calibration or checked rights**. Use 3–40 unique pairs, the exact checkerboard dimensions and square size used to calibrate V8, and the same rig ID. Each local image must be within its manifest directory, decodable, non-symlinked and match the calibration resolution.

## Run the independent check

```sh
python3 systemia/spatial-perception/stereo_heldout.py \
  --calibration /private/rig/calibration-v8.json \
  --heldout /private/rig/heldout-input.json \
  --output /private/rig/heldout-quality-v9.json \
  --max-p95-px 1.5 \
  --authorized-source --independent-holdout-attested
```

V9 uses OpenCV to find corresponding original chessboard corners on each separately held-out stereo pair, then `cv2.undistortPoints` with the V8 camera intrinsics, distortion, left/right rectification matrices and projective camera matrices. It calculates absolute left/right **vertical** row disagreement for each corner, plus mean, median, interpolated p95 and maximum over all corners and per pair.

A **provisional** engineering pass needs **all** held-out boards detected, *no training-byte reuse*, matching rig/board/dimensions, and measured p95 vertical residual no more than the operator's threshold. Default **1.5 pixels**. A smaller number is a stricter diagnostic, not a standard of certified camera accuracy. The output JSON is owner-only and includes source hashes. If the measured gate fails, the tool **writes a failure report** to preserve diagnostic evidence and exits with **status 3**. Invalid input, rights failure or checksum/reuse failure exits with **status 2**, without a successful receipt.

## Rectify in explicit field mode

V9 also adds an optional `--heldout-report` receipt binding and `--field-mode` to the V8 `rectify` CLI. When `--field-mode` is provided, the V9 receipt **must exist** and must declare a provisional pass matching the exact V8 calibration SHA-256, same rig and image dimensions. Its threshold, p95 and disallowing-authority fields must be internally consistent.

```sh
python3 systemia/spatial-perception/stereo_fieldkit.py rectify \
  --calibration /private/rig/calibration-v8.json \
  --video /private/rig/authorized-side-by-side.avi \
  --output-video /private/rig/rectified-stereo.avi \
  --receipt /private/rig/rectified-stereo-receipt.json \
  --max-frames 120 \
  --authorized-source --reviewed-calibration \
  --field-mode --heldout-report /private/rig/heldout-quality-v9.json
```

If the receipt is missing, failed, stale (different calibration SHA) or carries unsupported claims of field certification/safety/Worlds persistence, the command **refuses before processing video**, without a rectified output or receipt. The rectification receipt states whether the held-out gate was bound and records the V9 report's SHA-256 and p95 vertical residual. **Without** field mode and without a held-out report, the older V8 command remains compatible, but it explicitly marks the held-out check **unverified**.

Note: V9 compares hashes and internally checks the receipt, but JSON can be tampered with and unsigned claims are not cryptographically authenticated. A reviewer must confirm the held-out report was genuinely produced by the V9 code, retain the original images, and independently validate rights and camera capture provenance.

## Limits and subsequent gates

- **No verified physical-rig results.** Automated tests use rendered checkerboard images and an artificial stereo rig.
- Good row alignment does **not** measure actual camera synchronization, focal/baseline truth, or distance accuracy.
- Two static cameras can appear aligned yet make depth unreliable if rig geometry, timestamps, moving objects or photometric quality are poor.
- A deliberately shifted held-out image is included as a negative test. It must **fail**, not be silently omitted or scored as an accurate image.
- Do not treat this stage as evidence of legally sound source custody, georegistered geometry, object identity, a collision-safe scene, or field-certified results.
- The next real gate is physically measured camera-axis distance targets (V5), independent checkerboard validation across diverse poses, actual detector accuracy assessment, camera synchronization checks and human review.

## Tests

```sh
python3 -m unittest discover -s systemia/spatial-perception -p 'test_*.py' -v
python3 -m unittest discover -s systemia/spatial-perception -p 'e2e_stereo_fieldkit.py' -v
```

The second suite exercises actual OpenCV stereo calibration, independent held-out pairs, a vertical-shift negative control, SHA-256 nonreuse, field-mode rectification refusal, then real V3 local ONNX/JSON import from a synthetic stereo video. All inference and processing is local to the test. No pretrained model weights, external video upload, Base44 or third-party runtime.
