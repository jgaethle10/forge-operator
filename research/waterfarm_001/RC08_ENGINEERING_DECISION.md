# EVERCRAFT AQUA | RC08 Engineering Decision
**Date:** 2026-10-28  |  **Branch:** research/evercraft-aqua-waterfarm-001  |  **Evidence:** software prototype and quality gates, no experimental water savings

## Decision
The next defensible product is **Aqua Baseline**, a read-only intake and audit of an existing irrigation system's measured withdrawals, metered output, energy and uncertainty. This is **not yet a field-proven product, irrigation advice, leak detector or licensed engineering design**. Controlled-environment condensate recovery remains a separately gated research lane.

### New engineering code
- `noaa/multi_year_gate.py`: official NOAA NCEI station-specific Daily Summaries URL builder, opt-in TLS retrieval with bounded response and rejected redirects, raw source content receipts, exact-year PRCP + attribute quality assessment, and all-years-or-nothing observed series eligibility. Missing, trace and bad-quality days remain distinguished; trace treated as **zero collectable lower bound**, never categorized as a dry day. All requested annual reports must pass before observed multiyear simulation is allowed. An offline CSV is explicitly marked as origin-unverified.
- `noaa/multi_year_gate.observed_scenario`: integrates with the existing RC07 cross-year carryover model to simulate consecutively audited observed station years. The code rejects 2024+2025 if a 2025 daily missing record is present. Test-only sources are deliberately **synthetic**, and their results are never promoted as observed historical weather. **The 2022–2023 actual daily station sources have NOT been successfully downloaded into this execution environment. No real 2022–24 carryover result is claimed.**
- `field/field_audit.py`: strict daily meter-totalizer CSV intake. Checks at least 14 consecutive days, independent source + irrigation meter IDs, calibration reference presence, meter arithmetic/continuity, explicitly recorded (not modeled) readings and whole-system pump electricity. Calculates source water, irrigation-meter throughput, and energy per m³. Requires independently reviewable boundary attestations before displaying *apparent unexplained flow*. Even a positive imbalance is **not a proven leak or verified savings**. Unclear topology returns `NOT_EVALUATED_BOUNDARY_UNVERIFIED`, not zero loss.
- `tests/`: 30 locally passing tests including missing weather, 2025 May 22 HOLD, source hash integrity receipt, water meter rollovers, gaps, unknown vs zero, sensor calibration field missing, negative physical imbalance, serial carryover from test-only 2022–2024 dates.

## Grounding in established practice
NRCS **Washington** irrigation water management practice 449 requires planning irrigation timing and rate using crop ET, soil moisture and/or computerized scheduling; measuring flow and recording irrigation events and device calibration is core to adequate irrigation management. This research **does not certify NRCS 449** or replace a locally qualified planner. WSU similarly emphasizes soil moisture checks and crop-specific irrigation scheduling. See:
- https://efotg.sc.egov.usda.gov/api/CPSFile/28783/449_WA_CPS_Irrigation_Water_Management_2021
- https://www.nrcs.usda.gov/resources/guides-and-instructions/irrigation-water-management-ac-449-conservation-practice-standard
- https://irrigation.wsu.edu/Content/Fact-Sheets/pnw288.pdf
- https://rex.libraries.wsu.edu/esploro/outputs/report/Practical-use-of-soil-moisture-sensors/99900501891201842
- NOAA API https://www.ncei.noaa.gov/support/access-data-service-api-user-documentation

## Starting measurement pilot (NO contact or deployment committed)
**Goal:** 14+ day passive instrument audit of a **voluntarily participating operator's** existing water and power measurements. The first engagement does not install flow-control equipment, move/reattach irrigation lines, divert water, actuate pumps or test unapproved reuse.

| Item | Must have before credible interpretation |
|---|---|
| Water boundary | Site-approved diagram showing main source meter, irrigation meter, any other water use/storage/returns, pump and full physical water routes |
| Meters | Model/serial identity, units, calibration date/certificate and uncertainty limits, time sync and read frequency |
| Water demand | Existing irrigation logs, event date/time/duration, crop/soil stage, root-zone soil moisture or documented uncertainty |
| Energy | Whole-system pump/equipment energy kWh, not nameplate motor kW estimates |
| Weather | Onsite rainfall/ET observations, station comparisons and gaps; NOAA station weather is not field rain |
| Economics | Actual avoidable volumetric water cost, electricity bill/tariff, equipment costs and real alternative scenario |
| Permissions | Operator approval, data minimization/retention terms, licensed review where necessary, no contact with food/crops from experimental condensate |

### Release / stop conditions
- Input unknown, unreadable, nonconsecutive, uncalibrated, duplicate or out-of-bounds -> HOLD, do not infer zero.
- Flow imbalance without reviewed topology -> UNKNOWN, not leakage.
- Change in withdrawals without comparable baseline/control -> candidate signal only, not attributable water savings.
- Any experimental condensate reuse, potable/food contact, pumps/valves, surface diversion or field installation -> separate professional, quality, and regulatory authorization before work.
- No customer payment claim, outreach sent, pilot signed, water-saving performance or field equipment deployed as of this review.

## Concrete next gates
1. Execute `python noaa/multi_year_gate.py --fetch --dir ./noaa_sources --years 2022 2023 2024 --output qc_2022_24.json` **on an authorized Evercraft-owned online worker**. The currently isolated local runtime cannot reach the NOAA API. If any day is incomplete/QC-rejected, report HOLD, do not improvise data. Do not send confidential data to public GitHub.
2. Obtain operator-consented real existing meter readings and plant/soil/energy logs. Do not ask for phone calls: short asynchronous written site intake is sufficient for initial screening.
3. Run `python field/field_audit.py --csv private_site_readings.csv --out private_baseline.json` in a **private**, access-controlled environment, not the public repository. Physical site review is separate.
4. Qualified science/engineering review of errors, chronology, repeatability, crop agronomy and NRCS 449 local practice version; compare scheduling, repairs, metering and safe reuse alternatives.
5. Keep real-camera Aqua film on a separately tracked footage-license and editing path. No AI/CGl fake field footage. No claim of a finished live-action film.

**Truth status:** RC08 is a research tool and protocol, not new physical freshwater supply. Data quality checks are necessary but not sufficient evidence of agricultural performance.