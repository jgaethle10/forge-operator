# Evercraft Spatial Perception V5 | Field Evaluation Evidence Gate

**Status: field-trial measuring tool, not a completed field trial.** V5 can compare observations with separately collected camera-axis measurements. No real footage, independent measured distances, physical calibration verification, real model accuracy, or regulatory certification have been established by the synthetic CI fixture.

V4 demonstrated a working **synthetic** stereo video -> local ONNX -> OpenCV depth -> provisional observations -> Worlds/ForensiScope/EverMaps review pipeline. V5 closes the next gap: a repeatable, privacy-preserving way to compute **measured coverage and depth errors** for a future *authorized* real-camera test. It never upgrades a source or measurement into certified fact.

## Field evidence package required

Keep all of the following on an Evercraft-owned machine. Source and weight bytes are only read locally.

1. **Original authorized source video**, already synchronized and rectified as a side-by-side left/right stereo pair, with rights and capture consent checked separately.
2. **Local exact ONNX detector model**, with its rights manifest. Use the V3 importer to create a derived observation JSON, retaining original files.
3. **Calibration evidence file**, such as a rig-intrinsics JSON or signed calibration notes, showing physical baseline, left focal length, distortion/rectification and correct frame dimensions. Its hash is checked, but validity/authenticity is NOT automatically established.
4. **Independent reference targets JSON** below, authored from physical camera-axis Z measurements not calculated from the system's predicted depth. Photograph or otherwise document the target positions and uncertainty. Include *all planned targets*, even those the detector misses.
5. **Output report**, written locally and atomically with owner-only filesystem permissions. Never treat it as legally verified chain of custody.

### Example target manifest

The fields below are **illustrative placeholders**, not real rig, SHA-256, or distance measurements. Replace them with actual values and independently supported data before running.

```json
{
  "schema": "evercraft.spatial-perception.field-targets.v1",
  "sourceSha256": "REPLACE_WITH_ORIGINAL_VIDEO_SHA256",
  "modelSha256": "REPLACE_WITH_ONNX_MODEL_SHA256",
  "calibrationEvidenceSha256": "REPLACE_WITH_CALIBRATION_FILE_SHA256",
  "rigId": "your-calibrated-stereo-rig",
  "claimedCalibration": { "fxPx": 720, "baselineM": 0.12 },
  "targets": [
    {
      "id": "target-one",
      "frameId": "stereo-00000000",
      "label": "car",
      "box": { "x": 100, "y": 80, "width": 90, "height": 55 },
      "referenceCameraAxisDepthM": 5.0,
      "referenceUncertaintyM": 0.05,
      "measurementMethod": "laser_camera_axis"
    }
  ]
}
```

The sample target is **not** a recommended live measurement. Camera-axis Z measures the optical-axis component, not a slanted laser range to an off-axis object. Reference boxes must be independently labeled in the **left** camera at the same frame and time, not copied from predicted boxes. Allowed physical methods: `laser_camera_axis`, `tape_camera_axis`, `surveyed_camera_axis`. A separate `synthetic_known_disparity` classification exists only to keep CI evidence clearly identified as artificial.

### Run locally

First generate the original observation JSON using `systemia/spatial-perception/offline_stereo.py` with the authorized inputs and calibration measurements. Then run:

```sh
python3 systemia/spatial-perception/field_evaluation.py \
  --observations /private/derived-observations.json \
  --targets /private/independent-targets.json \
  --source-video /private/authorized-stereo-video.avi \
  --model /private/licensed-detector.onnx \
  --calibration-evidence /private/actual-calibration.json \
  --authorized-source --independent-references-attested \
  --output /private/unreviewed-field-report.json
```

No network access, external inference, frame uploads, public camera feed, or Base44 service is required by this evaluator. It is a Python standard-library tool, reusing the V3 local SHA and atomic-output helpers.

## Report contract and safeguards

- Verifies local video/model/calibration file SHA-256 values and matches them against both the derived import and independent targets manifest. Rejects missing files, changed digests, inconsistent calibration values, duplicate references/frames/detections, nonfinite measurements, impossible image boxes and forbidden authority flags.
- Matches target boxes to supplied detector boxes using label equality and 2D intersection-over-union, default minimum 0.5. **Ambiguous** matched boxes, missed detections, duplicate reuse and valid detections with **unknown depth** are reported separately, never silently deleted.
- Computes number of reference targets, number evaluated, coverage percentage, mean absolute error (MAE), root mean square error (RMSE), median/max absolute error and per-target absolute/relative depth errors. When **zero targets** can be evaluated, accuracy metrics are **null**, not zero.
- This is **not an end-to-end object-detection accuracy benchmark**. The reference list might not label every object in every frame; unmatched detections cannot automatically be called false positives.
- Even when the SHA-256 values match, **the truth of source acquisition time, physical calibration, reference independence and measurement uncertainty remains unverified**. The report's `fieldAccuracyCertified`, `safetyCriticalApproved`, `georegistered` and `worldPersistenceAuthorized` remain `false`.
- Evidence is locally private. A reviewer must separately check consent, capture history, rectification accuracy, safety and source rights before Systemia admission or product claims.

## Existing owned product boundaries

Worlds can display noncolliding, camera-local previews; ForensiScope gets unreviewed provenance-linked frame observations; EverMaps gets unlocated condition drafts. Neither a small MAE on a selected fixture nor any automated CI result authorizes pin locations, motion speed, incident severity, real-world 3D geometry or customer-facing accuracy claims.

## Tests

```sh
python3 -m unittest discover -s systemia/spatial-perception -p 'test_*.py' -v
python3 -m unittest discover -s systemia/spatial-perception -p 'e2e_synthetic_stereo.py' -v
```

The end-to-end test generates original artificial stereo frames and a constant-output ONNX proposal, then uses **predefined** synthetic target boxes and the known disparity to compare the actual V4 output. This validates plumbing only. It is **not** field evidence.

## Explicit next field gates

Capture authorized camera footage with externally verified calibration and physical measurement targets across a range of distances, including night, low texture, glare, occlusion and negative controls. Preserve all misses in the measured reference list. Have an independent reviewer examine the V5 report and raw evidence, benchmark real model classifications, and record human approval and deployment evidence before any operational promotion.
