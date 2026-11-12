# HIST-TECH-001 | Stage 7: First-trial Data Handoff

**Status:** Software rehearsal and acquisition protocol, NOT a physical demonstration, product launch, approved purchase, or an independently reviewed measurement. The only existing sample values in source control are synthetic. This procedure requires separate apparatus and safety approval.

## The one remaining software seam
Stages 5 and 6 previously had **different schemas**: a raw-byte integrity check for steady DC trials, and a separate synchronized DC time-series analyzer. Stage 7 adds a **read-only adapter** that binds one explicitly declared CSV file per DC channel to its SHA-256 in a manifest, then passes that same file's samples to the time-series analyzer.

Files:
- [time-series-bundle.mjs](time-series-bundle.mjs): exact-header CSV intake, per-channel SHA-256 check, explicit scoped paths and the energy-ledger handoff
- [time-series-bundle.test.mjs](time-series-bundle.test.mjs): synthetic CSV-to-report, missing/duplicate sources, tamper, path, synchronization, and publication-denial regression checks
- [time-series-energy.mjs](time-series-energy.mjs): existing synchronized DC V×I integration
- [EVIDENCE_INTAKE.md](EVIDENCE_INTAKE.md): earlier *steady-state* trial evidence rules; **not** interchangeable with this separate time-series manifest

## Step 1: Approved apparatus and acquisition plan (not yet obtained)
An independent qualified reviewer must approve the real hardware, insulation, low-voltage current limits, thermal/foreign-object precautions, test-point selection, timing method, calibrated instruments, uncertainty budget, and whether sample frequency is adequate. No high-voltage Tesla coils, mains probes, nonisolated circuits, RF amplifiers, hazardous experiments or trials on people. No purchase or physical test has been authorized by this PR.

**Important:** This software requires **unidirectional, slowly varying DC** and truly synchronized samples. The transmitter itself can contain fast switching/RF circuitry, but only its *appropriately measured total DC power input* and *loaded DC receiver output* are eligible for this accounting. If the DC boundaries contain significant ripple/transients, waveform-aware metrology is needed instead. Any auxiliary battery, adapter or logic supply must be included separately or in a true total source measurement. Measure start/end stored energy when applicable.

## Step 2: Preserve originals in a local evidence directory
The operator would collect raw files **outside the public repository**. Each input source receives a distinct CSV and the loaded receiver receives one CSV. Use exact header:

```csv
tSeconds,voltageVolts,currentAmps,absolutePowerBoundWatts
```

Each row has four finite numeric fields. Begin at time zero; take **at least three samples** per channel, at exactly the same timestamps, without exceeding the selected maximum sampling gap. Input voltage/current must be nonnegative, output must be under an appropriate load, and the final column is a **justified absolute bound for watt error per sample**, not a confidence interval or a substitute for calibrated uncertainty analysis. Capture original files and setup/provenance separately. Do not edit raw data to make it match.

## Step 3: Write a time-series manifest
Example shape below uses labels and placeholders only. It is **not** an observed experiment and must not be submitted unchanged:

```json
{
  "schema": "evercraft.historical-tech.time-series-bundle.v1",
  "sessionId": "ACTUAL-SESSION-ID-HERE",
  "dataKind": "measured",
  "capturedAt": "2026-11-09T22:00:00Z",
  "operator": "ACTUAL-OPERATOR",
  "rawSourceReference": "DURABLE-ACQUISITION-RECORD-REF",
  "sourceInventoryNote": "List and explain every DC input supply, including any external/auxiliary power",
  "allInputsDeclared": true,
  "synchronizationConfirmed": true,
  "maxGapSeconds": 0.01,
  "safetyApproval": {
    "approver": "AUTHORIZED-REVIEWER",
    "recordRef": "ACTUAL-SIGNED-APPROVAL-RECORD",
    "approvedAt": "2026-11-09T21:00:00Z"
  },
  "channels": [
    {
      "id": "primary_dc_input",
      "role": "input",
      "relativePath": "input.csv",
      "sha256": "ACTUAL-LOWERCASE-64-CHARACTER-SHA256",
      "instrumentManufacturer": "MANUFACTURER",
      "instrumentModel": "MODEL",
      "instrumentSerial": "SERIAL",
      "calibrationRecordRef": "ORIGINAL-CALIBRATION-RECORD",
      "calibrationValidUntil": "2027-11-09T00:00:00Z"
    },
    {
      "id": "receiver_dc_load",
      "role": "loaded_output",
      "relativePath": "output.csv",
      "sha256": "ACTUAL-LOWERCASE-64-CHARACTER-SHA256",
      "instrumentManufacturer": "MANUFACTURER",
      "instrumentModel": "MODEL",
      "instrumentSerial": "SERIAL",
      "calibrationRecordRef": "ORIGINAL-CALIBRATION-RECORD",
      "calibrationValidUntil": "2027-11-09T00:00:00Z"
    }
  ]
}
```

Dates and instrument fields above are **format examples**, not approvals or certificates. All real entries must come from independently retained evidence.

## Step 4: Check the files without changing them
From a trusted repo checkout after verifying branch/ref:

```bash
node systemia/research/historical-tech/time-series-bundle.mjs /ABSOLUTE/PATH/TO/EVIDENCE /ABSOLUTE/PATH/TO/EVIDENCE/manifest.json
```

The program prints a JSON report to stdout. It never uploads, publishes, places orders or controls hardware. Its output includes byte checks, relative energy ratio, mathematical limitations, and explicit `scientificClaimAuthorized: false` and `publicationAllowed: false` fields.

The manifest's raw files are capped at **2 MiB per channel**; source count is 1–32 DC inputs plus one DC loaded output. Nested paths may be used but symlinks and path traversal are refused. This is a best-effort defensive file parser, not a secure multi-tenant upload service or a defense against a locally hostile process modifying files during reads.

## Step 5: Independent review
A green parser result means only that its **self-declared** hashes match bytes and its testable numerical/metadata rules passed. It does not prove:
- Instrument acquisition or authentic calibrated readings
- Synchronization beyond what was self-declared
- Complete energy-source inventory or stored energy accounting
- Sufficient sampling bandwidth, accurate timebase, independent safety approval or statistically defensible uncertainty
- Any novel physical effect, real-world electrical efficiency, or a safe/reproducible experiment

Require a second reviewer to inspect actual hardware documentation, calibration, raw data, measurements, method, source and load boundaries, uncertainties and repeatability. A result above 100% apparent transfer ratio is a **measurement anomaly** to investigate, not free energy.

## Current release gate
The stage-7 software may merge only after code and technical review. A physical demonstration, scientific claims, Systemia execution, external messaging, and payment/commercial use remain **separate approvals** and are not triggered here. GitHub CI receipts are software test evidence only.
