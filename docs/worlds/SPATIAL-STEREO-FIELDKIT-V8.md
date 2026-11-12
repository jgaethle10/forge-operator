# Evercraft Spatial Perception V8 | Local stereo capture and calibration field kit

**Status:** Experimental owned-camera engineering kit. No physical rig, real checkerboard capture, independent survey, live customer footage, source custody certification, real camera synchronization proof, or real-world distance-accuracy claim has yet been established.

## Why V8 exists

V3–V7 process **pre-rectified** left/right stereo media through an offline detector, conservative disparity, provisional tracking, reference-error evaluation, a private field-review studio and a bounded retest planner. Those stages were integrated with a synthetic test video and constant-output synthetic ONNX proposal. The missing prerequisite was a repeatable route from **actual stereo camera images** to a **measured camera calibration and rectified derivative**.

V8 adds `systemia/spatial-perception/stereo_fieldkit.py`, which runs on an Evercraft-owned workstation and never starts a webcam, downloads pretrained weights, transmits frames, or publishes results.

## Required camera equipment and preparation

1. Two **fixed** cameras recording the same instant, left and right, with stable focus, resolution and mounting, and physical camera baseline measured independently. Two independently started ordinary videos are **not automatically synchronized**. Their recording times must be aligned separately before using this kit.
2. One *physical* flat 10×7 square checkerboard (9×6 inner corners), or a different board size declared in the manifest. Measure the real printed square side in **meters**. A rendered checkerboard displayed on a screen is not adequate as a physical baseline reference without independent checks.
3. At least **10** authorized **simultaneous** left/right checkerboard image pairs, preferably 15–25 from different orientations and positions. Do not shift, zoom, refocus or remount the cameras between calibration and field video.
4. A side-by-side video ordered **left | right**, each half having exactly the same original camera resolution as the board images. Resolution, lens and image orientation must remain identical. This prototype uses a common container frame clock; it does **not** estimate or validate hardware synchronization.
5. Ground-truth physical camera-axis Z reference targets and the V5 field evaluation procedure. Camera calibration RMS is **not** independent depth validation.

## Manifest

Create a JSON file next to your authorized checkerboard images. The paths are relative to that file and cannot escape its directory:

```json
{
  "schema": "evercraft.spatial-perception.stereo-calibration-input.v1",
  "sourceRights": "authorized_local_use",
  "rigId": "your-physical-rig-identifier",
  "checkerboard": {
    "columns": 9,
    "rows": 6,
    "squareSizeM": 0.025
  },
  "pairs": [
    {"left": "board-01-left.png", "right": "board-01-right.png"},
    {"left": "board-02-left.png", "right": "board-02-right.png"}
  ]
}
```

This is an **illustration**. The actual file must list **10–80 distinct pairs**, with rights-cleared, non-symlinked images all at the same resolution. Dimensions and square size must reflect the user's real rig. `squareSizeM: 0.025` is not a measurement of any user's board.

## Operate offline

Install Python 3.11, `numpy`, `opencv-python-headless`, and the V3 ONNX runtime packages on an **owned workstation** in a local environment. Keep input files and results in a private directory.

First compute the *provisional* calibration (find checkerboard corners, calibrate both camera intrinsics, estimate relative pose, compute rectification matrices):

```sh
python3 systemia/spatial-perception/stereo_fieldkit.py calibrate \
  --manifest /private/rig/calibration-input.json \
  --authorized-source \
  --output /private/rig/calibration-v8.json
```

This rejects fewer than 10 recognized matched chessboard pairs, mismatched resolutions, implausible rig translation/order, and reprojection RMS above the prototype 1.5-pixel gate. **An RMS below 1.5 pixels is not an accuracy certificate.** The output records full input-image hashes, the matrix solution, calibrated baseline, rectified focal length and principal point, plus all unverified-status flags.

After reviewing the capture, original images, rig geometry and calibration output, rectify an authorized side-by-side video into a new private MJPEG AVI derivative:

```sh
python3 systemia/spatial-perception/stereo_fieldkit.py rectify \
  --calibration /private/rig/calibration-v8.json \
  --video /private/rig/original-side-by-side.avi \
  --output-video /private/rig/rectified-side-by-side.avi \
  --receipt /private/rig/rectified-receipt.json \
  --max-frames 120 \
  --authorized-source --reviewed-calibration
```

This preserves the source file and emits SHA-256 hashes of original video, calibration JSON and rectified derivative. The receipt contains `fxPx`, `baselineM`, `cxPx`, `cyPx`. The derivative is **MJPEG re-encoded** and frame times are based on source-container FPS; it is not bit-identical to original evidence, nor does it prove synchronized capture or field depth.

Use these **four actual receipt values**, not invented defaults, when running the existing V3 importer:

```sh
python3 systemia/spatial-perception/offline_stereo.py \
  --video /private/rig/rectified-side-by-side.avi \
  --model /private/licensed-detector.onnx \
  --manifest /private/model-manifest.json \
  --fx-px RECEIPT_FX --baseline-m RECEIPT_BASELINE \
  --cx-px RECEIPT_CX --cy-px RECEIPT_CY \
  --authorized-source --rectified-stereo \
  --output /private/rig/observations.json
```

V8 adds optional `--cx-px` and `--cy-px` to the V3 importer. These are the *rectified left image's actual principal-point coordinates*, improving camera-relative X/Y estimates over the prior image-center approximation. They must be supplied together and within the original half-frame. If omitted, legacy importer behavior remains **approximate**. The CLI does not yet automatically bind the receipt; the operator must verify that `observations.sourceSha256` equals `receipt.rectifiedVideoSha256` and that calibration values match.

From there, use the V5 field evaluator, V6 private Field Review Studio, and V7 retest planner. No automatic production admission follows.

## Quality and privacy gates

- **Rights and ownership:** explicit `--authorized-source` is required for both commands. Calibration images are locally hashed; symlinks, path escapes, reused images, changed dimensions and excessive image sizes are rejected.
- **No silent overwrite:** outputs must be new files, are written with owner-only permissions, and the rectification video/receipt are created as separate artifacts. No cloud upload or camera capture starts.
- **No false certification:** all calibration and rectification records declare physical baseline, frame synchronization, real-camera accuracy, geolocation, forensic status, and safety suitability as unverified or false.
- **Honest limitations:** checkerboard reprojection RMS only describes fit on chosen input poses. This prototype does not solve unknown stereo capture-time offsets, lens focus drift, rolling shutter, damaged rigs, dynamic camera movement, changing resolution, source custody or true 3D object geometry.
- **Release gates:** validate with a physical rig, an independently measured baseline, held-out board images at varied distances and angles, per-frame vertical epipolar residuals, actual target reference ranges and supervised failure cases. Document bad as well as good captures.

## Automated verification

```sh
python3 -m unittest discover -s systemia/spatial-perception -p 'test_*.py' -v
python3 -m unittest discover -s systemia/spatial-perception -p 'e2e_stereo_fieldkit.py' -v
```

The V8 CI fixture generates **artificial chessboard images** in two mathematically simulated cameras, estimates a provisional calibration using real OpenCV APIs, rectifies generated AVI frames, and sends the derivative through a *constant-output* ONNX detector. Successful CI proves software integration, **not physical-world accuracy**.

No Base44 runtime, third-party computer host, webcam streaming or remote model inference is added.
