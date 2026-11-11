# FIRST-CONTACT-001 | Field evidence byte-chain and pre-registration protocol

**2026-11-09 · Operating procedure, not a report of acquired field data**

## Purpose

FIRST-CONTACT already has a synthetic two-view solver, accuracy evaluator and camera-layout planner. The new \`field-evidence-audit.mjs\` / \`field-evidence-cli.mjs\` adds a crucial **offline traceability control**: prove that the files **currently in a private local research folder** have the same bytes as the operator supplied in a source manifest, and that the numerical evaluation input names the same target/geometry/error thresholds as a declared preregistration plan.

The auditor does **not** independently prove that footage is real, the operator honestly pre-registered anything, the calibration rig was surveyed, or another person reviewed the evidence. **Both hashes and their matching expected values can be fabricated together.** Its strongest successful label is \`BYTE_CHAIN_MATCHED_REQUIRES_INDEPENDENT_PROOF\`.

## Required private folder layout

Keep real footage and private surveys **off public GitHub**. Work inside a local owner-controlled encrypted or access-restricted folder. Example (names are illustrative, not files furnished by this repository):

\`\`\`text
private-calibration-001/
  preregister.json
  camera-a-native.mp4
  camera-b-native.mp4
  camera-a-calibration.json
  camera-b-calibration.json
  observer-survey.json
  clock-sync-evidence.json
  calibration-input.json
  manifest.json
\`\`\`

The audit requires **seven roles** and one pre-registration plan:

| Manifest role | Local evidence |
|---|---|
| \`camera_a_native\` | Native recording or raw sensor capture for camera A |
| \`camera_b_native\` | Native recording or raw sensor capture for camera B |
| \`camera_a_calibration\` | Optical and pointing calibration record for A |
| \`camera_b_calibration\` | Optical and pointing calibration record for B |
| \`observer_survey\` | Independent target and observer positions with uncertainty |
| \`clock_sync_evidence\` | Hardware/clock synchronization tests and provenance |
| \`calibration_input\` | Exact JSON input consumed by \`known-target-cli.mjs\` |

The evidence auditor accepts only regular non-symlink files inside the selected folder and reads source files **incrementally in 1 MiB chunks**, up to **4 GiB per file**, without loading an entire native video into memory. It refuses unsafe relative paths, empty sources and files changed while being read. Larger originals need an approved separate streaming-file validator; **do not trim recordings solely to fit the cap and then label the result original footage**. A matching digest still cannot establish that the camera file is genuine.

## Pre-registration before capture

\`preregister.json\` uses schema \`evercraft.first-contact.field-preregistration.v1\`. It must declare:
- \`sessionId\`, identical to the later evaluation session ID;
- \`groundTruthMeters\` in an explicitly specified local ENU coordinate reference;
- \`quality\`: \`maxRayMissMeters\` and \`minParallaxDegrees\`;
- \`acceptance\`: \`maxP95PositionErrorMeters\`, \`maxRejectedFraction\`, \`minAcceptedSamples\`.

The auditor byte-hashes this plan and compares its exact JSON \`quality\`, \`acceptance\` and \`groundTruthMeters\` values to those in the later \`calibration_input\`. The operator must separately retain evidence that the plan existed **before** capture, such as a trusted timestamped archival record or verified source-control commit. A JSON string containing an alleged early date is **not enough**. Neither the audit nor a hash makes an untrusted timestamp trustworthy.

## Example private manifest shape

The following illustrates structure; the SHA values are **placeholders**, not real evidence. Each value should be the actual lowercase \`sha256:<64 lowercase hex characters>\` of the **exact** on-disk file bytes, created locally after the files exist.

\`\`\`json
{
  "schema": "evercraft.first-contact.field-evidence-manifest.v1",
  "sessionId": "CALIBRATION-001",
  "preregistration": {
    "file": "preregister.json",
    "sha256": "sha256:PUT_ACTUAL_64_LOWERCASE_HEX_CHARACTERS_HERE"
  },
  "sources": [
    {"role": "camera_a_native", "file": "camera-a-native.mp4", "sha256": "sha256:PUT_ACTUAL_64_LOWERCASE_HEX_CHARACTERS_HERE"},
    {"role": "camera_b_native", "file": "camera-b-native.mp4", "sha256": "sha256:PUT_ACTUAL_64_LOWERCASE_HEX_CHARACTERS_HERE"},
    {"role": "camera_a_calibration", "file": "camera-a-calibration.json", "sha256": "sha256:PUT_ACTUAL_64_LOWERCASE_HEX_CHARACTERS_HERE"},
    {"role": "camera_b_calibration", "file": "camera-b-calibration.json", "sha256": "sha256:PUT_ACTUAL_64_LOWERCASE_HEX_CHARACTERS_HERE"},
    {"role": "observer_survey", "file": "observer-survey.json", "sha256": "sha256:PUT_ACTUAL_64_LOWERCASE_HEX_CHARACTERS_HERE"},
    {"role": "clock_sync_evidence", "file": "clock-sync-evidence.json", "sha256": "sha256:PUT_ACTUAL_64_LOWERCASE_HEX_CHARACTERS_HERE"},
    {"role": "calibration_input", "file": "calibration-input.json", "sha256": "sha256:PUT_ACTUAL_64_LOWERCASE_HEX_CHARACTERS_HERE"}
  ]
}
\`\`\`

For local SHA calculation on Linux/Chromebook: \`sha256sum preregister.json\` (the CLI expects prefix \`sha256:\` in the manifest). Keep hashes alongside each role and immutable source copies. On Windows, PowerShell's \`Get-FileHash -Algorithm SHA256\` reports the value; lowercase it and add the prefix.

Then run from a checkout of \`research/first-contact-uap-001\`:

\`\`\`sh
node systemia/research/first-contact/field-evidence-cli.mjs /absolute/path/to/private-calibration-001/manifest.json
node systemia/research/first-contact/known-target-cli.mjs /absolute/path/to/private-calibration-001/calibration-input.json
\`\`\`

The first command produces a machine-readable receipt with \`allHashesMatch\`, \`preregistrationFieldsMatch\`, and per-source match statuses. It returns exit **0** for a complete byte-chain match, exit **3** for a held/mismatched chain, exit **2** for invalid input. It does not send any data to GitHub or elsewhere.

The second command assesses self-reported geometry and emits a separate numeric measurement receipt. Even two local \`0\` exit codes do not establish that a real calibration took place.

## Independent field validation: the missing scientific gate

Before any actual physical-accuracy assertion, a reviewer who did not generate the dataset needs to inspect:
1. independent survey and uncertainty, not just the JSON values;
2. original records and independent clock timing calibration;
3. source-device and recording authenticity, with chain-of-custody and rights;
4. pre-capture proof of accepted thresholds;
5. correspondence of raw frames to calculated bearings and sample associations;
6. actual measured errors, rejected observations and comparison against predeclared gates.

A source hash establishes **byte identity relative to another digest**. It does not provide source authentication, acquisition timing, independent provenance, scientific uncertainty, real-time monitoring, or evidence of extraordinary origin. There is no live Systemia mission dispatch, agent-run receipt or real field-data validation within this repository procedure.
