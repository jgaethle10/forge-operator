# Evercraft Aqua | RC09: first local-only Water Intelligence prototype
**Date:** 2026-10-30  |  **Evidence grade:** repeatably tested software prototype, not a pilot, proven water savings, or deployed web service.

## Decision
Build a minimally usable **Aqua Baseline** customer-facing audit first, using existing instruments before selling collection or greenhouse condensate hardware. Do not imply any field water savings, proven leaks, agronomic optimization, compliance, certified water quality, rate-of-return, or commercial readiness.

## This release
- One-file offline HTML product, **Evercraft_Aqua_Baseline_RC09.html**, designed for phone-width and desktop screens. Only local browser JavaScript. No CDN, API, cookies, storage, trackers, uploading, or outgoing network requests.
- Exact 12-column recorded water-meter CSV contract aligned with the previous RC08 Python baseline. Minimum 14 consecutive full days, distinct inlet and irrigation meters, continuous totalizers, explicit units liters and daily whole-system pump kWh.
- Shows source-meter throughput (not exact withdrawals without topology), irrigation-meter throughput, energy, date coverage, and an informative daily comparison chart. JSON audit export available. Checksums not included in user-facing JS export, unlike the Python RC08 report; operator must preserve an authentic original separately.
- Any unknown or malformed input, gaps, out-of-order days, meter changes/resets, negative/nonfinite readings, non-CSV input and fewer than 14 days gives **HOLD**. `ACTUAL_RECORDED_METER` is treated only as operator-provided claim, **not a verified record**.
- The local data sample is unambiguously synthetic, including meter IDs and disclaimer. The synthetic demo does **not** validate real instruments.
- An optional checkbox lets the operator *attest* they've reviewed a boundary diagram. It does not independently verify topology or classify a meter discrepancy as leakage. No confirmed saving or leak output under any condition.
- The app runs without a server. The source ZIP contains separate HTML template, audit core, deterministic builder and tests.

## Verification completed locally
- **18/18 Node.js unit tests** for CSV parsing, totalizer continuity, date gaps, invalid values, 14-day gate, metrics, quote handling, uncertainty and no savings claims.
- **30/30 RC08 Python tests** rerun against unchanged prior research code.
- **Independent Python↔Node numerical parity** on one clearly labeled synthetic 14-day fixture, including flow totals, energy intensity, and uncertainty. This is a calculation check, not validation against actual agriculture sensors.
- **Chromium headless UI smoke tests** in 1365 px desktop and 390 px phone-width viewports: original file content loaded in a sandboxed page, synthetic demo displayed, audit JSON + CSV-template downloads activated, zero JavaScript page errors, zero external network requests, no phone-width horizontal overflow. **Real iPhone Safari and user phone file-open behavior have not been verified**.
- Artifacts were generated in an isolated working container; neither actual farm data nor a production deployment was accessed.

## Important scientific bounds
1. A positive inlet–irrigation difference can represent known side uses, storage changes, return flows, timing, metering geometry, error, or leaks. It is not physically attributable without an independently verified boundary and equipment review.
2. Summing each day's stated absolute meter error yields a *user-supplied worst-case envelope*, not a statistically calibrated independent uncertainty estimate. In reality meter bias across days may be correlated. Report cautiously.
3. At least 14 days is an intake *minimum*, not an adequate full growing-season experiment. An annual or crop-season baseline and counterfactual are needed for savings claims.
4. Rain-collection design is a separate question. The previous RC05 official Yakima 2024 daily station dataset is real and complete; 2025 missing May 22 remains HOLD; no verified consecutive multi-year tank sizing result is claimed.
5. Crop irrigation, potable/nonpotable reuse, water rights and pump changes remain outside software authority. Qualified technical and regulatory review needed before any field installation.

## First legitimate user test
1. Find a consenting grower/operator with existing source/irrigation meters and pump energy logs; no connection or contract claimed.
2. Accept 14+ days of meter readings **privately**, confirm units/calibration and physical boundary map, and avoid uploading the data into public GitHub.
3. Compare RC08 Python and RC09 browser outputs, then have the user inspect possible boundary limitations and transcription errors.
4. Design an independently reviewed longer experiment only if the measured baseline shows a reason to investigate. Compare scheduling, maintenance and inexpensive fixes first.
5. Keep WSU/SYCD outreach Gmail drafts unsent until the owner approves a properly scoped request.

## Film integration
Continue separate real-camera footage sourcing, license verification and narrative edit. The RC09 software interface is a **real functional product prototype**, so its screen may be filmed later with a synthetic demo visibly labeled. Do not portray stock farm video as an Evercraft trial. No new final live-action film was produced in this engineering release.