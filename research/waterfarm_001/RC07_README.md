# Evercraft Aqua RC07 | Carryover water systems science

**State: standard-library research simulation, not a deployed/proven farm or commercial video.**

## Contents
- `carryover_model.py` | tested storage carryover through complete QC'd observed years, plus clearly labeled synthetic repeated-year stress test
- `test_carryover_model.py` | 20 local regression tests
- `RC07_scenario_results.json` | synthetic repeat-year outputs from reconstructed NOAA 2024 wet-day values and trace markers
- `RC07_ENGINEERING_DECISION.md` | findings, economics, source provenance, constraints, pilot priority
- `RC07_FIELD_MEASUREMENT_CONTRACT.md` | proposed field observation contract, no physical authorization
- `rc0*_regression.txt` | rerun receipts of prior suites and RC07
- `SCENARIO_SHA256.json` | source hashes/manifest of packaged RC07 files
- `seasonal_screen.py`, `fixture_2024_observations.py`, `noaa_api_screen.py` | copies of earlier modules to support a standalone test environment

## Run
`python -m unittest -q test_carryover_model.py`

Model replay is NOT a historical multiyear forecast and uses no observed 2025 climate. Do not cite the test fixture as the original NOAA CSV. Actual attributed source CSV is already archived under `noaa/data_rc05` in the connected repository. Do not present modeled delivery as measured avoided freshwater withdrawals.

Research PR: https://github.com/jgaethle10/forge-operator/pull/1605