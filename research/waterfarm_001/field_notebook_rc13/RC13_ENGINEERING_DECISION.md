# RC13 decision | Make measurement practical before hardware

**Commit subject:** field notebook with optional cumulative pump energy logging and a one-click RC12-compatible audit path. Local testing only; no new customer, site partner, physical trial or deployed product.

## The problem this removes

RC12 accepted a preassembled CSV, making a farmer responsible for spreadsheet setup before a 14-day trial. RC13 lets one person record a cumulative totalizer every day and automatically builds that CSV. This is not a new water-production discovery: it reduces friction in gathering evidence for a future licensed measurement study.

## What is implemented

1. One HTML file with inline first-party JavaScript/CSS, offline connection policy, mobile layout.
2. One-meter journal locked to a consistent ID and unit; strict consecutive dates, negative/reset/rollover checks, no phantom readings, optional energy and unknown-state semantics.
3. Device-local draft storage with explicit notice that browser local storage is not encrypted, reliable cross-device or guaranteed on a downloaded iOS HTML file. Manual CSV and JSON backup/export and hashed backup integrity check.
4. Automatic 14-day withdrawal-baseline calculation after 15 consecutive readings using corrected RC12 screening arithmetic. No self-reported value is authenticated; all outputs labeled `OPERATOR_SUPPLIED_UNVERIFIED`.
5. Frontend prevents meter IDs containing formula punctuation or obvious synthetic tokens from entering CSV exports. No network, advertisement telemetry, external dependencies or hardware commands.

## Verified tests

- Node 46/46 tests passed: 24 inherited RC12 core checks plus 22 new journal/safety/round-trip tests.
- Headless system Chromium, mobile 390px and desktop 1365px: entered 15 test readings, generated source CSV, audit JSON and notebook JSON, verified 1,750 L total, rejected corrupted backup without replacing valid study, zero external requests, zero JavaScript errors, no horizontal overflow.
- Browser QA used HTML injection because `file://` / localhost browsing is blocked by this test runtime. **True iPhone Safari behavior and localStorage persistence after browser restart remain unverified.**
- All inputs in tests are synthetic fixtures, not actual farm observations or calibrated meters.

## Next validation gate

Independent code review, actual iPhone Safari test, consenting operator 15-day measurement trial and engineering review of meter calibration, purpose, unit, source topology and privacy. No payment product launch, scientific publishing, field deployment, external outreach or sensor installation should be implied.

**Weather research:** 2022/2023 full daily station source gap is unresolved here. 2024 NCEI Yakima station values remain available from RC05, while the 2025 missing date retains HOLD. No new multiyear design claim is supported by RC13.

**Film:** the owner's rejected abstract Aqua visual is not a finished camera footage film. No actual commercial camera footage has been acquired in this release.
