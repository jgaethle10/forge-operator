# Evercraft Aqua | RC10 evidence integrity and first pilot readiness

**Status:** Research prototype. Offline HTML and Python meter-baseline validators. Not deployed, not a calibrated instrument, not certified engineering, not a field experiment, not evidence of water savings. 2026-11-04.

## Reason for this release

The RC09 synthetic demonstration generator used `observation_kind=ACTUAL_RECORDED_METER` even though fictional meter IDs and calibration references remained. When a demonstration CSV was reused as normal input, the validator accepted it as operator-supplied data. That is an evidence-classification defect, even though the UI marked the original demo and all real input as unverified.

## RC10 corrections

1. **Explicit synthetic source type:** built-in demo rows now say `SYNTHETIC_DEMONSTRATION`. The computation requires a dedicated `syntheticDemo:true` option and byte-exact equivalence to the built-in sample. Arbitrary uploaded CSV, even a copy of that same sample, is rejected in the ordinary real-observation intake path. Every downloaded demo audit is permanently labeled `SYNTHETIC_DEMONSTRATION` both in `source_kind` and `evidence_state`, with savings/leak claims false.
2. **Marker defense-in-depth:** ordinary uploaded readings containing `SYNTHETIC_`, `FICTIONAL_` or `DEMO_` in meter/calibration references are held, even when someone changes the observation-kind column to `ACTUAL_RECORDED_METER`. This is NOT authenticity detection: someone could forge realistic-looking identifiers. Any accepted CSV remains `OPERATOR_SUPPLIED_UNVERIFIED`.
3. **Strict CSV parsing:** proper quoted commas and doubled quotes work; malformed/trailing junk quoting, unclosed quotes, invalid numeric fields, nonconsecutive dates and discontinuous meter totals are blocked. Leading Excel UTF-8 BOM and CRLF are accepted.
4. **Numerical safety:** browser and Python validators reject extreme values above JavaScript's safe-integer boundary to avoid silent loss of meaningful totalizer precision. Conservative and site-agnostic; not a calibration certificate.
5. **Long-range chart clarity:** visual bars show the last 60 days when more readings are supplied, with explicit on-screen notice. The audit and totals still incorporate all accepted data. No misleading plot clipping without disclosure.
6. **Python consistency:** existing `field/field_audit.py` receives the same known-synthetic ID and large-reading failsafe, with two new tests. Existing stricter scope-of-water, independent calibration and topology constraints remain.

## Test verification in the local runtime

- Node v22 JavaScript unit suite: 30/30 PASS (18 prior + 12 added).
- Python 3.13 RC08 suite after correction: 32/32 PASS (30 prior + 2 added).
- Synthetic Python-JS numeric parity: PASS. It tests arithmetic only, not sensor provenance.
- Headless Chromium desktop 1365px and phone-width 390px: synthetic click succeeds, synthetic export metadata persists, demo CSV re-upload HOLD, manually relabeled demo HOLD, no page errors/network requests, and no horizontal overflow.
- SHA256 digest recorded in SHA256_MANIFEST.txt. Chromium mobile emulation is **not native iPhone Safari QA**; standalone HTML might be blocked in Files.app preview.

## Next science and pilot gates

- **Private site intake only with operator consent:** 14 consecutive dated source-water + irrigation-water totalizer readings, matching pump energy, meter model/calibration and uncertainty, topological boundary drawing and end-use constraints. Do not upload any customer/site data to public GitHub or to demo/support channels without a data agreement.
- Independent on-site professional judgment for meter installation topology, hidden outlets, crop ET, water rights, hazardous electrical/irrigation equipment, and applicable Washington rules.
- Prioritize a **measurement report**, not leak detection or verified savings. To claim avoided withdrawals, a scientifically comparable and adequately reviewed before/after or paired/control study is necessary.
- 2022/2023 actual Yakima Airport NOAA daily observations and independent native archive comparison remain incomplete *in this current branch*. Existing 2024 is observational station rainfall only. 2025 has missing May 22 PRCP. No invented year replacement or hardware sizing claims.
- Final live-action Aqua film still lacks cleared actual camera-footage sources. The prior generated motion preview is not the desired release master. No invented pilot footage or AI-generated stills used.

**No partner outreach was sent, no real operator data was processed, no field measurements were acquired, no equipment purchased, and no production deployment executed by this release.**