# Evercraft Aqua | RC07 carryover / long-horizon readiness
**Date:** 2026-10-27 | **Mode:** research simulation only | **No deployment, approved water use, verified savings or proven economics**

## What changed and why
A calendar-year roof-harvesting analysis that starts with an empty tank underestimates potential *future* summer use from water stored the preceding winter. It can also make arbitrary tank size recommendations if end-of-year storage is mistaken for unused annual value.

RC07 adds `seasonal/carryover_model.py`: a per-day conservation ledger with **initial, delivered, spilled, lost, and ending water**, explicit source-hash/status/record completeness checks, a consecutive fully audited observed-year simulator, and a controlled **identical-weather-year replay**. Any bad year holds the entire observed multi-year run; the May 22, 2025 missing daily PRCP observation is never interpolated or silently zeroed.

## Provenance and truth boundary
Actual NOAA/NCEI Yakima Airport daily PRCP for **2024** is archived in GitHub under `research/waterfarm_001/noaa/data_rc05/2024_yakima_prcp_ncei_attributed.csv`. Its RC05 audit confirmed 366 days, 213.1 mm measurable precipitation, 31 trace days, no absent or flagged observations. A fresh readback on Oct 27 confirmed the archived source: 87 measurable wet days and 31 traces. The local RC07 test fixture **reconstructs** its wet-day amounts and trace dates but normalizes some original source metadata, so it is NOT the original source file, an independent NOAA retrieval, a raw GHCN fixed-width archive, or any farm-site reading. A source-hash field is only a reproducibility reference; the simulation does NOT cryptographically authenticate the original NOAA host. Original NCEI records should be crosschecked before design use.

What follows is **not observed year 2**. The model replays the EXACT SAME 2024 station weather a second time as a *hypothetical weather stress test*. 2025 is known **incomplete** (2025-05-22 missing PRCP), and real 2023/2022 daily sources have not been screened with the RC07 importer in this run. A cyclic fixed point is a mathematical sensitivity result, not a long-run climate estimate.

## RC07 modeled results
Assumptions shared throughout: 100 m² legally eligible roof (**eligibility not established**), 80% collection factor, first flush = 0, initial 0 L Jan 1, daily demand 1,000 L **May–September only** (153,000 L/year), reported rain available before same-day demand, 0 modeled loss, all snow potentially available as liquid on reported day, zero equipment/energy/treatment constraints. Every assumption is hypothetical except the 2024 station observations.

| Tank L | First modeled 2024 L delivered | Second synthetic 2024 replay L delivered | First-year ending L | Cyclic repeat output L/year |
| ---: | ---: | ---: | ---: | ---: |
| 250 | 1,574 | 1,574 | 250 | 1,574 |
| 1,000 | 2,456 | 2,456 | 1,000 | 2,456 |
| 5,000 | 6,456 | 6,456 | 5,000 | 6,456 |
| 10,000 | 7,888 | 11,456 | 9,160 | 11,456 |
| 20,000 | 7,888 | **17,048** | 9,160 | **17,048** |

These are *deliveries to the model's synthetic daily demand*, not measured reductions in withdrawals. The 20,000 L case shows how a larger tank may carry unconsumed winter water into the next season and make first-year measurements unrepresentative. It does not mean more capacity is economical, needed, permitted, or safe from freeze/contamination.

### Storage sensitivity at 20,000 L (same repeated weather)
| Additional scenario assumption | First modeled year L delivered | Second synthetic repeat L delivered |
| --- | ---: | ---: |
| None, idealized baseline | 7,888 | 17,048 |
| All Nov–Feb precipitation entirely uncollectable (severe what-if) | 2,944 | 3,504 |
| Subtract 1 mm per wet day for first flush (not storm/event-accurate) | 4,680 | 11,536 |
| Tank loses 0.2% of stock daily (not measured) | 6,887 | 13,583 |

The capacity result is sensitive to winter collectability, first-flush and losses. A bigger tank is not automatically the best investment. At 17.048 m³/year and **illustrative** $3/m³ avoidable marginal water cost, gross water value is just ~$51/year before tank construction, monitoring, cleaning, treatment, electricity, land and financing. No water tariff or customer bill has been verified, so this is not ROI.

## New quality guards tested
- Any missing, duplicate, shuffled, invalid or out-of-year observation fails.
- A source with a bad status, bad station code or malformed SHA field fails; source SHA alone is not proof of origin.
- Missing observed years cannot be silently replaced by a simulated replay; replay outputs explicitly say `SYNTHETIC_REPLAY_OF_ONE_STATION_YEAR`.
- Initial volume must fit a tank; cross-year tank mass is conserved; losses, overflow, use and carryover cannot invent water.
- Repeated-year fixed point must converge under a configured tolerance; if it does not, HOLD.
- Exact RC06 empty-start totals revalidated for capacities 250/1,000/5,000/20,000 L.

## Proposed initial physical test (not approved or scheduled)
First sell/test **water-intelligence instrumentation and measurement**, not a purported new supply: a licensed/authorized farm/greenhouse operator can make a simple, no-cross-connection baseline available under consent. Gather flow meter readings at freshwater inlet and irrigation return, crop type and crop ET, usable root-zone water, soil moisture, water pressure, timestamped total pump/electrical kWh, human-operated schedule, evap/condensation if enclosed, and actual *marginal* price and end-use requirements. Build an audited withdrawal vs use vs loss ledger, compare cheapest accepted measures (schedule, leak repair, nozzle uniformity) before evaluating collection hardware. The initial baseline can be nonintrusive. Do not purchase or install plumbing or collect confidential operator data without approval and appropriate safety/data agreements.

Do NOT route experimental condensate into crops without end-use-specific quality tests and approvals. Licensed physical designers and independent experiment reviewers needed before any trials. No claim of potable output, agricultural yield, novel physics, carbon/water saving or operational partnership.

## Immediate next steps (gated)
1. Validate 2022–2025 authentic NOAA daily station extracts and source attributes as a consecutive set, **HOLD on incomplete May 2025** until a valid corroborated observation exists; do not manufacture missing data.
2. Obtain actual representative demand and field-scale precipitation, plant/soil and pump logs under operator permission; compute metering uncertainty.
3. Run multi-year mass balance with real years and conservative freeze/snow/first-flush/energy assumptions. If not available, report `UNKNOWN`, not a numerically confident design.
4. Cost a low-intrusion instrumentation pilot with actual supplier quotes, scientist/engineer check, risk and data access rules.
5. Film work is separately gated: only documented real-camera footage from cleared sources; RC02 film master still NOT complete.
6. WSU Prosser/SYCD outreach Gmail drafts remain UNSENT. No purchases, production merge, deployment or public publishing.

## Source and verification
- NOAA NCEI Access Data Service documentation: https://www.ncei.noaa.gov/support/access-data-service-api-user-documentation
- 2024 data archival location: `research/waterfarm_001/noaa/data_rc05/2024_yakima_prcp_ncei_attributed.csv`
- 2025 missing-data audit: `research/waterfarm_001/noaa/data_rc05/2025_audit.json`
- This code uses Python 3.13 standard library and `seasonal_screen.Configuration` and `noaa_api_screen.parse_csv` from RC06/RC05. New RC07 cases run locally and in a repository-layout mirror. All prior RC04/RC05/RC06 tests also re-run, **100 local tests total** (58 + 8 + 14 + 20). GitHub Actions CI is unverified, and no external scientific review has occurred.