# Evercraft Spatial Perception V6 | Private Field Review Studio

**Status:** Experimental local web review interface, not a completed real-camera trial, certified evidence suite, or public deployment receipt.

## What this adds

The V5 evaluator already produces a local report of camera-axis depth errors with independent, user-attested target measurements. V6 makes that information legible in a responsive, privacy-first blue-and-white interface:

- `public/worlds/perception-lab/field-review.html` shows source class (synthetic vs operator-attested), camera rig declaration, file-digest prefix, reference coverage, MAE, RMSE and unresolved targets.
- The interactive scatter plot compares reference camera-axis Z against estimated camera-axis Z for evaluable targets. The outcome chart includes missing detections, ambiguous matches, no-depth cases and duplicate matches.
- A complete searchable, sortable target table shows original reference measurements, supplied uncertainty, estimated depth, absolute error and measurement method. Nothing missing is assigned zero error.
- `field-review.mjs` validates the V5 schema and recomputes errors, coverage, summary metrics and missing categories from every target. It rejects contradictory totals, forged certainty flags, nonfinite values, unsafe fields and synthetic measurements mislabeled as real-world.
- The viewer accepts a local V5 report JSON file up to 10 MB and never transmits its contents. All dynamic source labels and reference IDs use safe text-node rendering, not HTML interpolation.
- The embedded `Explore synthetic fixture` control displays artificial examples and is labeled **SYNTHETIC**, never field data.
- The original Spatial Perception Lab links to the review studio from `public/worlds/perception-lab/index.html`.

## Running and using

On the owner-controlled Evercraft runtime, serve the `public` directory from a local static HTTP server supporting JavaScript modules. Open `/worlds/perception-lab/field-review.html`. The source page may appear in a static public code host as a demo, but presence of source code does **not** establish a live deployed URL. Report files are read in the browser; they are not uploaded.

1. Complete the **V3** offline stereo video importer with actual rights-cleared synchronized, calibrated stereo footage and a locally authorized ONNX detector. Preserve the original video, model and calibration files.
2. Complete the **V5** `field_evaluation.py` with independently measured camera-axis Z targets. It checks hashes and generates an **unreviewed** report JSON.
3. Open the V6 review studio locally, select the V5 report, inspect every unresolved target and error plot. Review the original evidence separately; loading a report does not verify source or measurements.
4. Share only human-reviewed summaries whose provenance, scope, uncertainty, and limitations have been confirmed. Never allow unreviewed observations to create authoritative world objects, geographic pins, velocity estimates, or safety-critical flags.

A `synthetic_fixture` report is always artificial regardless of small errors. An `operator_attested_measurements_unverified` report is not authenticated merely because its hashes match.

## Security and integrity boundaries

- The viewer never asks for camera permission, accesses user location, or connects to remote inference/hosting services. No network API handles report contents.
- It accepts only the V5 report schema, bounded to 500 target rows. Recomputed summaries use a small rounding tolerance matching the V5 producer.
- The user’s original source video, full model and calibration material remain outside the browser. The report only provides hash fields and per-target measurements.
- This frontend is *not* a cryptographic verifier of the original video/model/calibration bytes. It cannot confirm real calibration, reference independence, source custody, privacy/consent, human identity, real-world geometry or legal admissibility.
- Human review and Systemia admission remain distinct. The viewer never writes to Worlds, ForensiScope, EverMaps or any production database.

## Verification

```sh
node --test tests/spatial-field-review.test.mjs tests/spatial-field-review-browser.test.mjs
python3 -m unittest discover -s systemia/spatial-perception -p 'e2e_synthetic_stereo.py' -v
```

The second test builds an original synthetic stereo video and tiny constant-output ONNX model, runs the real offline importer, creates a V5 report from fixed synthetic target geometry, then feeds that report into the V6 JavaScript validator. This tests *engineering interoperability only*, not field accuracy.

## Unfinished work

- Actual calibrated physical stereo capture with independent camera-axis distance benchmarks.
- Real detector confidence/precision/recall and false-positive evaluation.
- Native Safari and Chrome mobile validation of the actual interface.
- Verified public HTTPS route/deployment receipt, if an external demo is authorized.
- Reviewable camera pose, georegistration and persistent 3D scene graph gated by evidence.

No Base44 runtime, outside hosted inference, camera streaming, or automatic evidence upload is introduced by V6.
