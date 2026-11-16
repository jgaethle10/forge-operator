# FIRST-CONTACT-001 | Pixel Desk: first local image-to-geometry workflow

**2026-11-15. Research branch only. Offline manual annotation, not independently validated physical evidence.**

## What you can do now

Open a minimal browser tool, choose **two previously lens-rectified PNG camera frames** of a *permitted, non-sensitive stationary reference target*, click the same marker in each frame, paste/import each camera's real calibrated intrinsics and surveyed camera-to-ENU pose, enter the independently established capture timestamps, and export a JSON packet accepted by the existing `pixel-two-view-cli.mjs`. The tool hashes the exact PNG bytes locally using the browser's SHA-256 implementation.

The annotator does **not** recognize objects automatically, rectify lenses, inspect original native camera files, measure camera position, or certify that the capture clocks and targets agree. The self-attestation flags are **false by default**. An unchecked flag will cause the downstream geometric admission gate to HOLD.

You can repeat this for at least three distinct image pairs to run the existing known-target error analysis with a second local command, without hand-editing the multi-frame JSON.

## Run on your own computer

From your local checkout of `research/first-contact-uap-001`:

```sh
cd systemia/research/first-contact
python3 -m http.server 8760 --bind 127.0.0.1
```

On the same computer, open:

`http://127.0.0.1:8760/field-annotation.html`

For Windows with Python's launcher, use `py -m http.server 8760 --bind 127.0.0.1`. Open the URL in the local browser. Binding to `127.0.0.1` prevents this local web server from listening on your LAN. Do **not** put private imagery or secrets inside this public GitHub research checkout; the selected image data are read through browser file inputs and are not sent to the local server by the Pixel Desk. Stop the server when finished.

Use a local HTTP server because browsers may block JavaScript module imports when opening an HTML file directly with `file://`. The HTML and JavaScript are self-contained in this repository; there are no external dependencies, hosted scripts or upload endpoints. The browser's local WebCrypto implementation must be available.

## Required inputs before a meaningful real session

- **Original recordings:** retain both native camera original files in a separate private evidence folder. The Pixel Desk uses transformed rectified PNG derivatives, **not originals**. Preserve the exact transformation and associated source frame references.
- **Camera calibration:** for each PNG use JSON containing `sensorId`, `imageWidthPixels`, `imageHeightPixels`, `fxPixels`, `fyPixels`, `cxPixels`, `cyPixels`, optional `skewPixels`, `rectifiedImage:true`, surveyed `observerMeters:{x,y,z}`, and a correct 3×3 right-handed `rotationCameraToEnu` matrix. These values must actually be measured; example matrices from synthetic fixtures are **not calibration**.
- **PNG dimensions and pixel convention:** the selected file's decoded size must equal the camera JSON size. Canvas annotations are zero-based pixel-center coordinates; Shift + arrow key nudges a selected marker by 0.1 pixel, ordinary arrow keys by 1 pixel. PNGs are limited to **32 MiB**, **8192 pixels per side** and **30 megapixels**, with a checked PNG signature/dimensions before decoding.
- **Capture times:** the Unix millisecond timestamps must come from verified capture synchronization, not browser file modification times. The existing two-view geometry refuses unequal timestamps.
- **Acceptance settings:** supply the actual predeclared maximum allowed 3D ray mismatch in meters and minimum parallax angle. The Pixel Desk does not prove that any threshold was set before capture.
- **Five evidence flags:** remain unchecked unless separately supported by documented optical calibration, surveyed positions, synchronized capture, independent camera identities and same-target identification. The checkboxes only record an operator claim, not an independent certificate.

Click the target in both images. Use **Export local two-view JSON packet**. The JSON includes manually selected pixel coordinates, operator-supplied camera metadata, image source filenames, SHA-256 file hashes and explicit unverified provenance labels. **No PNG or native image bytes are included in the exported packet.** Treat names and surveyed positions in the JSON as potentially sensitive and share only with permission.

Run this from the repository root for each exported packet:

```sh
node systemia/research/first-contact/pixel-two-view-cli.mjs /path/to/PAIR-001.rectified-pixels.json
```

A candidate result means only that the **declared geometry and flags** passed the software gate. HOLD means the evidence or geometry was insufficient. Neither result proves source authenticity or extraterrestrial origin.

## Assemble three or more distinct pairs for known-target calibration

Put the downloaded `*.rectified-pixels.json` packets into one **private local folder** with a batch plan `field-plan.json`. Example structure below is **illustrative synthetic numbers only**; replace all coordinates and thresholds with separately surveyed, justified and preregistered values before field use.

```json
{
  "schema": "evercraft.first-contact.annotation-batch-plan.v1",
  "sessionId": "REPLACE_WITH_REAL_SESSION_ID",
  "groundTruthMeters": {"x":0,"y":10,"z":1},
  "quality": {"maxRayMissMeters":0.05,"minParallaxDegrees":1},
  "acceptance": {
    "maxP95PositionErrorMeters":0.1,
    "maxRejectedFraction":0,
    "minAcceptedSamples":3
  },
  "evidence": {
    "calibratedPointing":false,
    "surveyedObserverPositions":false,
    "synchronizedClocks":false,
    "independentSensorIdentities":false,
    "samePhysicalTarget":false,
    "knownTargetIndependentlySurveyed":false,
    "acceptanceThresholdsDeclaredBeforeCapture":false
  },
  "pairFiles": [
    "PAIR-001.rectified-pixels.json",
    "PAIR-002.rectified-pixels.json",
    "PAIR-003.rectified-pixels.json"
  ]
}
```

The conservative `false` defaults intentionally yield a hold until independently supported claims are made. The operator must not simply mark them true to get a pass.

In a shell in the repository root, run:

```sh
node systemia/research/first-contact/field-annotation-batch-cli.mjs /private/field-plan.json > /private/calibration-input.json
node systemia/research/first-contact/pixel-calibration-cli.mjs /private/calibration-input.json
```

The assembler **fails closed** on duplicate frame SHA-256 values, duplicate case IDs, unordered/repeated timestamps, mismatched camera metadata, differing ray-quality thresholds, impossible pixel geometry, unsupported annotation source, or fewer than three image pairs. It stores SHA-256 of each exact annotation JSON and each rectified PNG file as reported in the annotation packet. These hashes establish only internal byte linkage, not independent authenticity or source capture time.

The known-target CLI checks errors against the operator-supplied surveyed reference point and computes a numeric acceptance result, never a physical field-validation certificate. The `field-evidence-cli.mjs` remains the separate tool for checking a private manifest of original camera files, optical calibrations, survey, clock evidence, the preregistration plan, and the finalized calibration input. The manifest must use source files genuinely held locally, **not this research repository**.

## What still requires real-world work

The research branch contains **no actual calibrated photo recordings**, source device identifiers, independently surveyed target positions, verified clock timing, recorded calibration session, external pre-capture timestamp, or independent scientific review. The Pixel Desk is a manual prototype with automated Node.js core, exported-input and JavaScript syntax tests, not a fully end-to-end tested production browser or optical-camera product.

Systemia execution remains `NOT_DISPATCHED`; no agent is represented as running and no extraordinary or extraterrestrial technology has been verified.

**Decision gate:** carry out an authorized stationary-marker calibration with genuinely measured optical geometry, preserve native sources, prove numerical thresholds were frozen before capture, then have a separate reviewer independently audit measured 3D errors and source provenance before publication.
