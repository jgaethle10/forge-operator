# Evercraft Aqua | RC08 field baseline and official NOAA multi-year gate

Local research utilities. Python 3.10+ standard library only. No installations, actuators or internal cloud credentials.

## Test now
```
python -m unittest discover -s tests -p 'test_*.py' -v
```

## Weather: strict real-data path
By default the weather audit reads externally supplied NOAA NCEI Daily Summaries CSV in metric PRCP with `includeAttributes=true` from `noaa_sources/Yakima_YYYY_attributed_PRCP.csv`. The connected runtime did **not** retrieve complete 2022–2023 NOAA files. Do not pretend the test-generated records are historical data.

Run locally on an approved online Evercraft-owned worker after review:
```
python noaa/multi_year_gate.py --fetch --dir ./noaa_sources --years 2022 2023 2024 --output qc_2022_24.json
```
The HTTPS fetch is read-only to official NOAA. Missing observations produce a HOLD report; source quality and legal catchment remain independently gated. `observed_scenario(...)` can connect the screened audit sequence to RC07 existing `simulate_observed_years` and `Configuration`. No additional multi-year real yield data exists yet.

## Field intelligence: privately supplied meter records
Use the exact header in `field/field_audit.py` or the included `synthetic_EXAMPLE_DO_NOT_SUBMIT.csv` as a formatting reference. The synthetic example intentionally FAILS the data authenticity gate.

Run with true, consented private records:
```
python field/field_audit.py --csv /private/site_meter_data.csv --out /private/baseline_review.json
```
The report describes **water meter flow and kWh per intake volume only**. A residual is NOT a leak, and a pre-post change is NOT verified water savings. Never place privately supplied farm/customer data in this public research repository.

The existing Aqua RC04–RC07 modules are not replaced or altered by this package. New code is research-only and should be reviewed before merge.