# Evercraft Aqua RC06 engineering research

- `seasonal_screen.py` — strict, transparent seasonal demand / roof collection / storage loss / first flush model.
- `fixture_2024_observations.py` — numeric 2024 NOAA observation-value reconstruction for local calculation parity, **NOT original raw NOAA source**. Source attributes are normalized. Original NOAA API CSV remains in RC05 GitHub research branch.
- `test_seasonal_screen.py` — 14 regression tests for prior 2024 result, mass conservation, missing values and scenario integrity.
- `rc06_scenario_results.json` — deterministic model matrix and provenance label.
- `RC06_ENGINEERING_DECISION.md` — research outcomes, limits, economic stress and pilot requirements.
- `rc04_suite.log`, `rc05_suite.log`, `rc06_suite.log` — local QA receipts, separate test modules.
- `seasonal_evidence_2024.png` — editable-code-generated evidence visualization. Not the live-action film or a photo of Aqua equipment.

Output classifications: OBSERVED = published NOAA station PRCP for 2024; modeled capture/demand/delivery are hypothetical, and CANNOT be represented as measured real site production. All outputs are READ-ONLY.
