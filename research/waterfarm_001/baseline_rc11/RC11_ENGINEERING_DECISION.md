# Evercraft Aqua RC11 | Audit traceability and field-pilot evidence gate

**Status:** Research-stage RC11; no field trial conducted, actual operator/customer data received, new water saved, independent calibration authentication, public commercial release, live-action film, permit, or partner agreement. Research branch changes remain draft/unmerged.

## Engineering findings and repair

**RC10 defect found:** A user could view a valid local baseline, select a file that was oversized or had an unsupported extension, and still see the prior report because the input rejection path only changed the status line. This could associate stale data with a newly selected file. **RC11 clears all prior data, hides the report, clears its hash, and disables audit download immediately upon *every* new file selection**, including invalid files, while the new file is being read and if reading fails. A monotonic generation token prevents out-of-order asynchronous file reads from reintroducing a stale result. Changing the review checkbox re-screens the current content.

**Integrity receipts:** RC10's browser report was not cryptographically bound to the exact uploaded CSV (the earlier Python audit had a source SHA-256). RC11 computes an independent, offline, UTF-8 SHA-256 of the input text and includes it in the local audit JSON as `source_integrity_sha256`. No network or third-party hashing library. Test vectors include empty, ASCII, UTF-8 water symbols, long multi-block data and full synthetic meter data. Browser result matches Python `hashlib.sha256` for the exact CSV. Important: a source hash **does not authenticate** the CSV's origin, operator, consent, site layout, instrument calibration or measurements.

**Field preflight gate:** Added `pilot/pilot_gate.py` to bind one private CSV to a separately supplied pilot manifest. Requires a pseudonymous site alias, a declared strictly **passive** study purpose, documentary consent receipt and unexpired consent assertion, exact meter CSV hash/date range, referenced water-boundary diagram/review receipt, matching inlet/irrigation meter IDs and calibration document receipts (with validity through the observation period), and pump meter calibration reference. It then reruns the RC10 Python meter audit. Output exposes metadata and evidence conditions only, not daily meter values. **Completing it only means documents are present and mutually consistent; no claim of authentic permission, verified calibration, identified leak, water saved or authorized equipment work.**

## Actual QA performed

- **38/38** local Node tests (RC10 prior 30 + 8 added SHA / provenance checks); local Node environment, not GitHub Actions.
- **19/19** existing Python field-meter regression tests pass in RC11 source copy.
- **16/16** new Python field-pilot document precheck unit tests pass.
- **2/2** headless Chromium scenario passes, desktop 1365px and mobile 390px, including synthetic demo, SHA integrity parity with Python, valid TEST-ONLY operator-flag input, invalid extension clearing the previous report and disabling download, synthetic reupload HOLD, no JavaScript errors, no outbound requests and no horizontal overflow. **Native iPhone Safari has not been tested.**
- All examples in QA tests are manufactured fixtures, **NOT** real operator data or signed records.

## Source, safety and user privacy

- Local single-file HTML report includes individual daily measurements. Keep private source reports on the operator-controlled device; never upload real private site telemetry, calibration files, maps or signatures into this public research repository.
- The app contains no upload endpoint or telemetry, does not fetch remote data and does not control water or energy equipment. Network activity observed during browser tests was zero.
- `pilot/PILOT_MANIFEST_TEMPLATE.json` ships with missing/false credentials and is deliberately **NOT preflight-ready**. A valid signed consent is not produced by checking a Boolean or supplying a hash.
- NOAA 2024 official API precipitation is archived in RC05. The 2025 May 22 precipitation record remains missing. The currently isolated runtime could not retrieve the original multi-year official NOAA station download; **do not claim a three-year observed storage result**. This RC11 is a meter/data evidence improvement, not a new field yield measurement.

## Decision / next milestone

1. Private operator recruitment and consent **only after founder approves external outreach**. A small passive baseline can use existing 14+ daily source/irrigation meters and whole-system pump kWh if properly scoped.
2. Obtain actual dated meter, calibration, irrigation boundary, operator consent and energy records in a protected location; validate with RC11 before independent licensed engineering/agronomic review. No unmetered/unknown water can be automatically classified as a leak.
3. Source-verify successive NOAA GHCN official station files on approved connected Evercraft worker and compare with site rain; use strict HOLD for gap/QC issues.
4. Only after verified site evidence compare lowest-cost conservation (measurement, scheduling, conventional repairs) with engineered reuse. A hardware pilot, crop-contact water and regulatory permits require separate approvals.
5. The live-action Aqua film continues to require actual original/licensed camera footage; none was obtained or released in RC11. No AI/CGI substitute.

**Scientific verdict:** RC11 improves evidence traceability and preflight controls; no verified farm water savings, crop response, payback, installation, actual pilot or commercial product readiness.