# Evercraft Spatial Perception V2 | Temporal Review Lab

**Status:** source-level experiment, deterministic synthetic fixture, and browser timeline. No actual video tracking model, public deployment verification, calibrated real-camera performance, or certified measurement is claimed.

## Scope

The existing Spatial Perception V0 stereo estimator and V1 QA are unchanged. V2 connects **already supplied per-frame detection/depth observations** across timestamps into reviewable, provisional track IDs using bounding-box overlap, normalized image-center proximity, conservative size and depth gates, and an explicit ambiguity test.

- The module **does not infer object boxes from images**. For real footage, a separate verified on-device detector is required.
- Association is **image-relative only** and vulnerable to camera motion, similar-looking objects, occlusions and missed detections. A track ID is not proof that two detections are the same physical object.
- **Physical speeds, world displacement, real-world distances traveled, geolocation, camera ego-pose, and object identities are never derived** by V2.
- Large timestamp gaps trigger a new track rather than extending a false identity. Ambiguous matches start a provisional new track.
- All media and JSON import processing in the browser stay local. Import is capped at 600 KB. Core association work is capped by frame, object and comparison budgets.
- The browser timeline displays two moving, artificial bounding-box sequences, a frame slider, track trails, and a JSON review-packet export. It is not real video reconstruction.

## Source

- `public/worlds/spatial-temporal.mjs`: pure bounded association engine and product projections
- `public/worlds/perception-lab/index.html`: interactive local temporal demonstration and review export
- `tests/spatial-temporal.test.mjs`: association, ambiguity, occlusion, invalid evidence and consumer authority tests
- `tests/spatial-temporal-browser.test.mjs`: browser source and dependency wiring checks

Run tests:

```sh
node --test tests/spatial-temporal.test.mjs tests/spatial-temporal-browser.test.mjs
```

## Input contract

`associateSpatialFrames(frames)` accepts a chronologically increasing array:

```json
[
  {
    "frameId": "example-frame-000",
    "timestampMs": 0,
    "width": 160,
    "height": 100,
    "observations": [
      {
        "schema": "evercraft.spatial-perception.observation.v0",
        "id": "example-frame-000:0",
        "frameId": "example-frame-000",
        "timestampMs": 0,
        "label": "car",
        "detectorConfidence": 0.9,
        "box": {"x": 30, "y": 20, "width": 28, "height": 16},
        "depthEstimateM": null,
        "sourceSha256": null,
        "cameraPositionM": null,
        "coordinateFrame": "camera_relative",
        "georegistered": false,
        "safetyCriticalApproved": false
      }
    ]
  }
]
```

Provenance hash fields are unverified input claims until checked separately against original source. No encoded image bytes are required or exported.

## Consumers and authority

- `temporalReviewPacket`: structured **unreviewed** events without original frames, speed, GPS, or verified custody.
- `forensiScopeTemporalEvents`: provisional timestamped observations, review required.
- `everMapsTemporalDrafts`: **unlocated** points, severity null, urgency not assessed.
- `worldsTemporalPreview`: one frame at a time in its own camera-relative space, **noncolliding and nonauthoritative**; no persistent merged 3D scene or world mesh.

Production Systemia writes, Saban admission, multi-camera ego-motion registration, trained object detector, media evidence custody and persistence remain separate future gates. Source-only implementation is not a shipped endpoint.

## Next milestones

1. Attach a rights-aware and reproducible *local* detector to calibrated stereo footage. Include source-media digest, model digest, timestamps, camera-intrinsics and explicit asset rights.
2. Benchmark track continuity, identity switches, lost tracks, memory/runtime, and camera-motion failure cases on annotated sequences.
3. Integrate camera pose/SLAM and multi-view geometry only after independent metric calibration, then produce a reviewable actual scene graph.
4. Use Systemia admission and approved persistence, not direct uncontrolled writes to Worlds, ForensiScope or Mapping.
5. Verify deployment and actual mobile Chrome/Safari workflows before advertising the browser lab as live.
