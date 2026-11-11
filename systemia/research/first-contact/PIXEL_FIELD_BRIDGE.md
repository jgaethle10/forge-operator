# FIRST-CONTACT-001 | Rectified camera pixel-to-ENU field bridge

**November 10, 2026. Status: synthetic software, not independently measured or authenticated camera data.**

## What the new software does

Previously the two-camera solver required ENU azimuth and elevation values. The new `pixel-bearing.mjs` converts an operator-supplied *rectified image pixel detection* through a known camera intrinsic matrix and a camera-to-ENU rotation into those bearing angles. This permits the existing independently quality-gated triangulation and known-target calibration calculations to consume **pixels rather than fabricated hand-entered angles**.

- `pixel-two-view-cli.mjs` reads two pixel detections with corresponding operator-supplied camera models, returns a mathematically compatible ray-intersection candidate or HOLD.
- `pixel-calibration-cli.mjs` reads 3–500 pixel-pair samples for a known stationary reference target and evaluates 3D positional error using the existing known-target acceptance model.
- `field-evidence-audit.mjs` accepts the new rectified-pixel calibration-session schema in the pre-registration byte-hash comparison, while remaining strictly unable to verify physical source authenticity or the chronology of registration.

Every CLI runs **offline, without accessing original media or contacting cameras, agents, or services**. The code performs no lens correction, target detection, intrinsics estimation, surveyed pose determination, clock calibration or real recording authentication.

## Camera coordinate contract

Camera coordinates are right-handed: +x right, +y down, +z forward. World coordinates are local East-North-Up: x East, y North, z Up, in meters.

`rotationCameraToEnu` is a 3×3 right-handed orthonormal rotation with rows in world East/North/Up and columns in camera right/down/forward. It is validated mathematically, but no physical mounting or survey is independently validated.

`imageWidthPixels`, `imageHeightPixels`, `fxPixels`, `fyPixels`, `cxPixels`, `cyPixels`, and optional `skewPixels` must be calibrated for the **same rectified image dimensions and camera optical configuration** as the supplied `uPixels` and `vPixels`. A digital zoom, refocus, cropping, software resizing or lens distortion can invalidate previously measured intrinsics. The `rectifiedImage: true` flag is an **operator assertion**, not automatic lens correction or proof of calibration. The timestamp is an operator-reported capture timestamp, not necessarily a verified synchronized clock.

An example camera-to-ENU rotation for an optical axis aimed north and no roll is `[[1,0,0],[0,0,1],[0,-1,0]]`. This is *not* the measured pose of an iPhone, Chromebook, HP camera or any other real device.

## Reproducible synthetic commands

```sh
node --test systemia/research/first-contact/*.test.mjs
node systemia/research/first-contact/pixel-two-view-cli.mjs systemia/research/first-contact/fixtures/pixel-pair-synthetic-valid.json
node systemia/research/first-contact/pixel-two-view-cli.mjs systemia/research/first-contact/fixtures/pixel-pair-synthetic-unsynced.json
node systemia/research/first-contact/pixel-calibration-cli.mjs systemia/research/first-contact/fixtures/pixel-known-target-synthetic-session.json
```

The invented fixtures place camera A at ENU (0,0,0), camera B at (3,0,0), and a stationary target at (0,10,1) meters. The invented 1280×720 cameras have 800-pixel focal lengths, so the target projects to (640,280) in A and (400,280) in B. **These are mathematical invented pixels, not measurements from a physical image**.

The single-pair CLI yields a review-required candidate if supplied geometry is compatible; it returns HOLD / exit 3 for mismatched timestamps. Invalid optics or unrectified images cause input error / exit 2. The multi-frame calibration CLI yields `NUMERIC_GATE_MET_REQUIRES_INDEPENDENT_FIELD_VERIFICATION` only when the supplied numerical data satisfy declared thresholds; no physical validation follows from that status.

## What a real field run must establish independently

1. Two permitted camera recordings of the **same ordinary stationary marker** with rights to keep the original media, free of private bystander imagery.
2. Camera optical calibration and rectification, using a real calibration target and recorded uncertainty for the lens, zoom, focus and image resolution.
3. Both surveyed camera optical centers and marker position in one reproducible ENU reference frame, with actual surveying uncertainty.
4. Camera-to-ENU rotation including roll/pitch/yaw, with known north reference; not an unverified compass direction.
5. Independently checked capture-clock synchronization. Equal numbers in JSON are not proof.
6. Measured target pixel centers with uncertainty, with transformations from originals to rectified images recorded and traceable.
7. Frozen numerical acceptance thresholds **before** capture and proof of independent timestamping, not merely an operator-edited file.
8. An independent reviewer who checks source originals, target correspondence, real survey and calibration against the final measured error.

The evidence-chain auditor requires locally stored camera, calibration, clock and survey sources; do not upload them into a public GitHub issue. Its SHA-256 receipts prove only relative byte equality to operator-supplied hashes, not authenticity.

**Scientific boundary:** This bridge does not establish real target identity, anomalous speed, new propulsion or extraterrestrial origin. The earliest physical milestone is accurate position reconstruction of a **known** stationary target. Systemia execution remains NOT_DISPATCHED until properly authorized runtime receipts exist.
