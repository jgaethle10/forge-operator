# Evercraft Spatial Perception V7 | Evidence-directed retest planning

**Status:** locally reviewable field-test triage, not a field capture, safety assessment, incident response, calibrated proof or operational deployment.

V6's field-review dashboard ingests a locally generated V5 evaluator report and recomputes its depth metrics. V7 closes the next operator gap: **which measurements should be investigated next, and what evidence should be preserved?** It proposes a bounded, explainable retest list from already-reviewed V6 report data.

## How it works

The V7 review page `public/worlds/perception-lab/field-review.html` now includes a **Next field-capture tasks** section. It takes the result of the existing `inspectFieldReport` validation. Operators may enter a nonnegative absolute-error review threshold in meters (default: 0.5 m), then rebuild or export the proposed task list to local JSON.

For each supplied independent reference target, `field-retest.mjs`:
- Flags **no corresponding detection** with label, exposure, object boundary, occlusion and detector checks
- Flags **ambiguous detections** for cautious class/box review and alternative captures
- Flags **no depth estimate** for stereo synchronization, rectification, lighting, texture, occlusion and camera-axis Z remeasurements
- Flags **duplicate detection match** for reference segmentation and distinct target annotation checks
- Flags **evaluated absolute depth error above the operator threshold** for independent Z remeasurement, calibration review and repeat distance captures
- Leaves other evaluated targets out of the *flagged* queue, but does not certify or approve them

All unresolved targets stay in source evaluation coverage. Tasks are deterministically ordered by engineering-review category, then discrepancy and frame. A hard 500-target bound protects local use. The interface renders the first 12 proposed tasks and exports the complete bounded list as JSON.

This output is a *recommendation to an operator*, not a scheduled task. It does not grant Systemia unattended execution, capture permissions, GPS position, privacy clearance, or authorization to persist a World Engine entity.

## Correct interpretation

- **Review threshold is not acceptance tolerance.** It is an operator-controlled way to prioritize measurements, with no automatic pass/fail, compliance, commercial readiness or safety certification.
- **Synthetic remains synthetic.** Artificial test fixtures are clearly labeled and cannot count as a real field capture.
- **Source hashes are only prefixes in the proposed task export.** V5's original full hashes and local evidence remain the authoritative source bytes to review separately.
- **No off-device export occurs automatically.** The operator explicitly downloads a local proposed-task JSON. The browser transmits neither report nor source images.
- Missing depth must remain `null`. No estimated physical velocity, geolocation, object identity, real-world scene reconstruction or change in incident severity is computed.

## Source and tests

- `public/worlds/perception-lab/field-retest.mjs`: pure bounded retest-plan generator
- `public/worlds/perception-lab/field-review.html`: private UX, editable threshold, task list and downloadable JSON
- `tests/spatial-field-retest.test.mjs`: deterministic prioritization, gaps, threshold, synthetic labels, rejection of forged flags and missing estimates
- `tests/spatial-field-review-browser.test.mjs`: local-only UI wiring and no network transmission
- `systemia/spatial-perception/e2e_synthetic_stereo.py`: synthetic stereo video -> ONNX -> depth -> V5 report -> V6 review -> V7 retest-plan smoke test
- `.github/workflows/spatial-perception-v0.yml`: scoped V7 Node tests, Python contract tests, synthetic integration test

## Next measured field gate

1. Collect authorized, synchronized, **physically calibrated** stereo footage with known camera intrinsics, rectification receipts, measured baseline and original frame-time evidence.
2. Prepare independently measured **camera-axis Z** references across near/mid/far distances, including hard negatives, glare and low texture, and retain every missed target.
3. Run V3 importer and V5 field evaluator on an owned workstation; inspect the report in V6, generate V7 retest tasks, and repeat disputed measurements.
4. Have a human reviewer confirm raw source hashes, physical calibration, reference independence, detector accuracy and limitations before discussing any real-world performance.
5. Only after verifiable results, consider controlled admission into Systemia and audited product integration.

This source release does not claim real hardware was tested, and a GitHub merge is not a verified public deployment. No Base44 runtime, third-party inference, source upload or external workflow executor is used by this subsystem.
