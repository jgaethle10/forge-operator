# Evercraft Aqua RC05

Observable climate data, auditable source-and-quality distinctions, repeatable hypothetical water-storage comparisons. Not an authorized field installation, water quality system, production service or causal proof.

Run:
```
python -m unittest -v test_noaa_api_screen.py
python reproduce_2024_scenario.py
```

`noaa_api_screen.py`: strict CSV parser supporting NOAA Daily Summaries with PRCP attributes, trace events, missing records and QC flags; annual tank comparison only if all dates are acceptable. Example CLI:
```
python noaa_api_screen.py --input path/to/official_api_2024.csv --year 2024 --out analysis.json
```

Official year source files are published in the unmerged research branch under `research/waterfarm_001/noaa/data_rc05/`. This ZIP includes source/test/normalized-values reproduction code and report, not NOAA's entire API-supplied source CSV. The recorded 2024 scenario independently reproduces the audit results in the unmerged GitHub research branch. The 2025 complete-year case is on HOLD due to May 22 missing PRCP.

The 2024 source is public NOAA station precipitation, not any customer's roof yield or patented Evercraft field device output. All outcomes need independent hardware, crop, quality, legal, and safety review before commercial claims.
