# Evercraft Spatial Perception V0

**Status:** experimental source prototype and synthetic proof, not deployed or validated on real cameras.

## What is implemented

- Deterministic, bounded sum-of-absolute-differences block matching of **already synchronized and rectified grayscale stereo camera images**.
- Pinhole stereo depth estimate in meters from user-calibrated focal length in pixels and physical camera separation.
- Texture and match-uniqueness rejection. Unknown depth remains unknown when matching fails.
- External detector boxes can be fused with estimated depth; there is **no built-in YOLO model** or object classification.
- Three explicitly provisional outputs: non-colliding, camera-relative Worlds entities; ForensiScope timeline evidence requiring review; EverMaps unlocated records with no coordinates or severity.

## Run

    node --test tests/spatial-perception.test.mjs

Visual demo: public/worlds/perception-lab/index.html. Synthetic sample runs in the browser; uploaded pairs never leave the browser.

## Contracts and limitations

Source module: public/worlds/spatial-perception.mjs.

1. Synchronized stereo calibration and rectification are **required**. A single ordinary dashcam image cannot provide metric stereo depth.
2. Matching is block SAD without subpixel refinement, left-right consistency, full occlusion handling, or uncertainty calibration. Expect errors on low-texture/repeated patterns and real roads.
3. To obtain actual detections, use a separately identified, authorized local detector and provide its boxes with model provenance. This module does not manufacture labels.
4. No cross-frame tracking, camera ego-motion, geographic registration, road geometry estimation, persistent world mesh reconstruction, or source-media digest creation is implemented.
5. World projections intentionally have no collider and are marked nonauthoritative; never automatically persist them into World Engine.
6. Mapping produces no geographic pin until separate survey-grade registration; **condition and urgency are independent**, and bad reports do not automatically imply emergency status.
7. ForensiScope outputs are reviewable estimates only, not forensic proof. Retain separate chain-of-custody and human measurement checks.
8. Never use this code for autonomous vehicle control, collision warning, emergency dispatch, or safety-critical decisions.

## Next admission gates

Run two independently calibrated real stereo cameras and validate against known measured distances, integrate rights-aware on-device detector, add frame tracking/camera pose and quality reports, then adapt to Systemia admission, Saban reviewers, and owned runtime. No outside inference provider or hosted dependencies are introduced.
