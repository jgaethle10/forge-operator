# Evercraft Spatial Perception V3 | owned offline stereo footage importer

**Scope:** An opt-in, offline local Python runner connects separately supplied, locally licensed YOLOv8 ONNX weights to an already calibrated, synchronized, rectified left-right stereo video. It makes frame observations in the *exact JSON schema* used by Spatial Perception V2's browser timeline.

**Status:** Prototype implementation and contract tests. No model weights, camera calibration or authorized footage were provided with this change. No real-camera accuracy, detection quality, public deployment, temporal identity, or safety certification has been demonstrated.

## Files

- `systemia/spatial-perception/offline_stereo.py`: video frame sampling, local model validation, ONNX CPU inference, class-specific NMS, OpenCV stereo SGBM, per-box median disparity, private JSON writing
- `systemia/spatial-perception/test_offline_stereo.py`: dependency-free contract and failure tests
- `public/worlds/spatial-temporal.mjs`: existing bounded image association engine, unchanged
- `public/worlds/perception-lab/index.html`: V2 local JSON timeline and review-packet export

## Safety prerequisites

This tool **requires two actual camera views**, left followed by right, packed side-by-side in one video frame. Both views **must already be synchronized and rectified**, with physically measured baseline and calibrated focal length for the original half-frame size. It is not a single-camera metric depth hack. No rectification or calibration is performed inside this utility.

The user must explicitly confirm `--authorized-source` and `--rectified-stereo`. Do not run on unauthorized recordings, subjects requiring consent that has not been obtained, or critical vehicle-control systems. The run does not read webcams or transmit video.

The ONNX file must exist locally. No model is downloaded, no hosted inference is invoked, and no pretrained weights are bundled. The explicitly supplied, reviewed manifest declares local-use rights, model SHA-256, labels, input size, and **exact** output contract. This early version supports only standard *unfused YOLOv8 detect* logits arranged as `[1,4+C,N]` or `[1,N,4+C]`, where the first four values per candidate are `cx,cy,w,h` and the remaining `C` are class scores in `[0,1]`. Fused YOLO/NMS variants or unsupported exports fail closed.

## Local dependencies

Python 3.10+, NumPy, OpenCV (`opencv-python-headless`), and ONNX Runtime. Install them on the **user-owned workstation** in an isolated environment from approved distributions before running. No local model installation, network connection or permissioned model file is created by this repository. Contract unit tests use only Python standard library.

## Model manifest example

Supply a local JSON manifest alongside your licensed model:

```json
{
  "format": "yolov8_onnx_no_nms",
  "inputSize": 640,
  "labels": ["car", "bus", "truck"],
  "sha256": "REPLACE_WITH_THE_ACTUAL_LOWERCASE_SHA256_OF_YOUR_ONNX_MODEL",
  "rights": "authorized_local_use"
}
```

The labels must be the exact class order exported by **your** model, not an example subset substituted for a model with more classes. This example cannot run until the checksum and matching full label list are supplied. Obtain checksum locally with `sha256sum /path/to/model.onnx`.

## Example invocation

```bash
python3 systemia/spatial-perception/offline_stereo.py \
  --video /path/to/authorized-rectified-stereo.mp4 \
  --model /path/to/approved-detector.onnx \
  --manifest /path/to/model-manifest.json \
  --fx-px 720 --baseline-m 0.12 \
  --frame-step 5 --max-frames 60 \
  --authorized-source --rectified-stereo \
  --output /path/to/private/spatial-observations.json
```

**All example calibration values are placeholders; do not use as real measurements.** An input video with 1280-pixel width would represent a left 640px and right 640px view. Before running, verify stereo order and actual intrinsics, distortion correction and timestamps.

Load output JSON on the **observation JSON** control in the Spatial Perception Lab. Its V2 bounded tracker then performs conservative image associations; the output is not an authoritative or persistent Worlds scene.

## Provenance and uncertainty

- The runner hashes the full local source video and supplied model with SHA-256; each observation carries the video digest. That is source byte provenance, not custody verification or proof of acquisition time. Both files are hashed again after processing; changes during processing fail closed. Export is capped at 9.5 MB to fit the browser's 10 MB local import limit.
- Frame times are inferred from decoded frame index and the video-reported FPS. Variable-frame-rate clips, dropped or duplicated frames may make these timestamps inaccurate. The source UTC clock is never inferred.
- Depth is `Z = fx * baseline / disparity`, where disparity comes from SGBM between the two original rectified half frames. Median disparity inside the detection's central box is a crude provisional estimate and can mix object with background.
- Unknown disparity produces `null` depth and `null` camera position, never zero or a fabricated range.
- No geolocation, metric object velocity, optical flow, calibrated depth uncertainty, person identification, visual SLAM, or physical-world 3D mesh is generated.
- This is not autonomous driving assistance, an emergency response detector, verified surveillance intelligence, or forensic certification.

## Admission gates before actual operational use

1. User-supplied authorized stereo footage, calibration files and a licensed local ONNX detector whose digest and output are validated against known detections.
2. Ground-truth distance measurements across near/mid/far objects, occlusion/low-texture stress cases, plus left-right consistency and confidence evaluation.
3. Native on-device video FPS, memory, thermal and model-runtime profiling with explicit receipt.
4. Check video hashing and per-frame timestamps against source originals; record source custody separately.
5. Only then submit through Systemia reviewer/admission workflow for further controlled integration with Worlds, ForensiScope and EverMaps. No automatic production writes are authorized.

To run dependency-free contract tests: `python3 -m unittest discover -s systemia/spatial-perception -p 'test_*.py'`.
