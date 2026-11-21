# HIST-TECH-001 | Physical Evidence Intake, Stage 5

**Status: design and software-validation only. There are NO Evercraft physical wireless-power measurements in this research branch.** No hardware purchase, laboratory authorization, Saban/Systemia worker run, field equipment activation, or external performance claim is implied.

## What changes in Stage 5
The branch now includes `evidence-package.mjs`, which verifies the **file bytes** supporting a session labeled `measured` match SHA-256 values in a self-declared manifest and checks that each trial has its own identifiable file. It is deliberately not called "measurement verification": anyone could create or fabricate a file and the matching digest.

The intake rejects:
- Synthetic sessions masquerading as measured sessions
- Missing, duplicated, or unbound trial raw-file references
- Files that have changed since the submitted hash, path traversal, symlinked paths and files above 5 MiB
- Missing separate DC input/output instrument descriptions, serial numbers, calibration-record references and valid-through timestamps
- Missing safety-approval metadata or a purported approval timestamp after the claimed acquisition
- Claimed measurements that fail the existing DC input/output numerical and negative-control requirements

It returns `publicationAllowed: false`, `scientificClaimAuthorized: false`, `externalMeasurementAuthentication: false` and `instrumentCalibrationIndependentlyVerified: false` **even when all local checks pass**. That is intentional.

## Evidence package format (documentation-only skeleton)

A physical collection session, if separately authorized, would be stored **outside this repository** in a scoped local evidence directory. No customer or private data is required for the research. Each `session.trials[].rawMeasurementRef` must equal the corresponding `manifest.rawFiles[].relativePath`.

Illustrative manifest shape (**placeholders, do not submit as measurements**):

```json
{
  "schema": "evercraft.historical-tech.evidence-manifest.v1",
  "sessionId": "<recorded-session-id>",
  "dataKind": "measured",
  "capturedAt": "<UTC-timestamp-of-capture>",
  "safetyApproval": {
    "approver": "<actual-authorized-reviewer>",
    "recordRef": "<durable-original-review-evidence>",
    "approvedAt": "<UTC-timestamp-before-capture>"
  },
  "instruments": [
    {
      "role": "dc_input",
      "manufacturer": "<manufacturer>",
      "model": "<model>",
      "serial": "<serial>",
      "calibrationRecordRef": "<original-calibration-document>",
      "calibrationValidUntil": "<UTC-valid-through-date>"
    },
    {
      "role": "dc_loaded_output",
      "manufacturer": "<manufacturer>",
      "model": "<model>",
      "serial": "<serial>",
      "calibrationRecordRef": "<original-calibration-document>",
      "calibrationValidUntil": "<UTC-valid-through-date>"
    }
  ],
  "rawFiles": [
    {
      "trialId": "<same-trial-id-as-session>",
      "relativePath": "<relative-path-beneath-evidence-root>",
      "sha256": "<actual-lowercase-64-character-sha256>"
    }
  ]
}
```

A string in any `recordRef` field **does not** prove that the document exists or that the person named signed it. Hash matching does not validate instrument origin, the meaning of the CSV content, trustworthiness of a clock, correctness of claimed calibration, or any scientific conclusion. Those require independent records and review.

## Why uncertainty numbers alone are not enough
The existing evaluator accepts per-trial *absolute-watt bounds* and uses them only as conservative numerical brackets. Such bounds are not statistical confidence intervals or a NIST/GUM-style uncertainty analysis. Before any real scientific reporting, the metrology reviewer needs to identify and justify:
1. Type A uncertainty from repeated observations; sample size, spread, independence and any drifts.
2. Type B contributions including calibration, meter resolution, range, environmental effects, waveform behavior, timing mismatch, and unmeasured auxiliary power.
3. Correlation/covariance between measurement components (shared reference supplies or meters cannot simply be assumed independent).
4. A combined standard uncertainty `u_c` with appropriate propagation or an established equivalent, and the coverage factor `k` if reporting expanded uncertainty `U`.
5. Actual power measurement method. DC V×I is only valid for truly steady DC; for transients or AC/RF, capture adequately synchronized voltage and current waveforms or calibrated true-power integration. Product-of-averages can hide covariance and create phantom efficiency.

Authoritative references: NIST Technical Note 1297, [combined standard uncertainty](https://www.nist.gov/pml/nist-technical-note-1297/nist-tn-1297-5-combined-standard-uncertainty), [reporting requirements](https://www.nist.gov/pml/nist-technical-note-1297/nist-tn-1297-7-reporting-uncertainty), and [measurement-method effects](https://www.nist.gov/pml/nist-technical-note-1297/nist-tn-1297-appendix-d4-measurand-defined-measurement-method).

## Required decisions BEFORE any energized trial
- [ ] A qualified independent physics/electrical metrology reviewer agrees the apparatus, operating limits and uncertainty approach are suitable.
- [ ] An actual certified off-the-shelf low-voltage DC-powered learning module is selected, with full specifications, isolation and thermal limits.
- [ ] Instrument models, calibration status and valid measurement ranges are reviewed against the proposed test.
- [ ] A written and independently acknowledged risk assessment names stopping conditions and describes safe handling.
- [ ] A full energy-source inventory is documented, including adapters, auxiliary batteries, any control electronics and stored energy.
- [ ] Owner approval to purchase/use equipment, and a separately authenticated Systemia execution admission if autonomous action is desired.

## Required steps AFTER any authorized trial
1. Preserve complete, original, timestamped and instrument-attributed readings. Record snapshots, geometry, controls, uncertainty estimates and environmental/thermal notes.
2. Produce each raw file's SHA-256 digest and bind it to an exact trial ID. Preserve originals unedited.
3. Run the standalone evidence checker *only inside an appropriate approved intake workflow* and preserve its report alongside the manifest. The function has no deployment, file upload, device-control or publishing behavior.
4. Get independent review of actual raw data, calibration documents, process logs and source completeness. Correct or reject anomalies rather than inventing hidden physics.
5. Publish only after independent scientific and communications review; distinguish simulation, data integrity, physical measurement, and reproducibility.

## Design boundary
The source branch and green GitHub CI **prove software behavior under software tests**, not that anything was measured, verified, signed, operated safely or independently reviewed. That boundary must remain explicit in Evercraft Journal and customer communications.
