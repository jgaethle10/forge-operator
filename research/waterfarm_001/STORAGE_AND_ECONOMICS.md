# WATERFARM-001: water timing, storage and unit-economics screen (v0.3)

**Status: local simulation + tests only.** No field measurements, real daily Yakima rain data, customer meter data, roof permission, certified water reuse, deployed facility, contractor or committed partner.

## What the new model tests
`daily_storage.py` uses validated consecutive `date / precipitation_mm / nonpotable_demand_l` entries. It conserves modeled tank mass each day, allows configurable tank capacity, efficiency, first flush per wet day, gives external makeup and overflow, counts full-supply days and tracks missing/duplicated dates as hard HOLD. Both source and delivery approval flags default to DENY.

Current examples use monthly Yakima Airport precipitation normals reproduced by a secondary NOAA-normal publication (1991–2020, station USW00024243, annual total ~8.01 inches), allocated **synthetically** either (a) equally to every day of each month or (b) solely to the final day of each month. Neither allocation describes actual regional storms, event timing, snowmelt or real daily precipitation.

Station dataset: https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals ; secondary publication: https://historicalclimate.com/stations/yakima-air-terminal-wa-us-usw00024243 . **Direct official station CSV retrieval/verification still pending.**

## Hypothetical case: 100 m² existing-purpose roof, 80% effective rain collection, zero first flush, 2025 non-leap calendar, continuous 1,000 L/day demand

| Assumed tank | Equal rain every day of each month | All monthly rain on final day |
| --- | ---: | ---: |
| 250 L | 16,276 L delivered/year | 3,000 L delivered/year |
| 1,000 L | 16,276 L | 10,300 L |
| 5,000 L | 16,276 L | 14,350 L |
| 20,000 L | 16,276 L | 14,350 L |

Full potential catch is ~16,276 L, or 4.46% of this *hypothetical* annual 365,000 L demand. In the one-storm-per-month scenario, 1,000 L storage overflows ~5,976 L and supplies ~10,300 L. At 5,000 L storage the residual volume not supplied by year-end remains in the tank. **These are sensitivity extremes, not a calibrated lower or upper confidence interval.** Practical weather, first flush, inaccessible roofs, winter snow, collector losses, equipment and water quality can reduce returns substantially; actual operating timing may differ in either direction.

## Economics reality check (intentionally optimistic ceilings)
Under **16,276 L/yr gross MAX**, if water's *avoidable marginal value* were a **hypothetical** $2/m³, then perfect collection/delivery could displace only $32.55/year. A five-year simple-payback capex ceiling **before any OPEX** would be $162.76. At $10/m³ value, five years yields $813.80 ceiling before capex maintenance/financing costs. A real agricultural water supplier's marginal costs and water rights must be measured, not guessed. Collection does not imply equivalent conserved basin-level water, and marginal savings are often far less than posted fees.

This means a small roof and tank alone are unlikely to be the first scalable agricultural hardware product at these assumptions. **Go/no-go: meter + verify demand, baseline management and energy, and identify a controlled-environment use case where humidity management is a co-benefit.**

## New decisions
- P0: build a **water intelligence baseline** (noninvasive observation and crop water budget) before proposing engineered water collection.
- P1: derive rain-event frequency, summer demand/temperature and actual tank sizing from official daily observations; do not design from monthly normals alone.
- P1: measure condensate and humidity-control electricity in a safe bench system with water isolated, no use in irrigation until authorized.
- P2: productize multi-source water recovery only after successful operator trial, qualified permitting, documented user demand, and fair economic comparison with cheapest compliant options.

## Engineering corrections/limitations
- A wet day is not a rainfall event; single first-flush-per-wet-day is a convenience approximation. Real design requires event detection and verified runoff.
- Rain is assumed available to the tank before same-day use. In reality diurnal timing matters.
- No evaporation/leaks, water chemistry, plumbing pressure, power, capex or maintenance yet modeled. Avoid promising finance-grade economics.
- To use input from NOAA observations, require dated, complete, QC'd records; missing precipitation must be treated as UNKNOWN, not zero.
- Separate `potential_roof_l` (physics) from `admitted_roof_l` (permission) and `delivered_l` (customer value). Neither internal reuse nor tank carry-over creates fresh water.
- Keep all research IP / site-sensitive measurements out of the public repository absent approved information-sharing terms.

## Reproduce
From `research/waterfarm_001`, run `python -m unittest discover -p 'test_*.py' -v` (20 local test cases, 10 old + 10 new); import `monthly_normal_synthetic` and `simulate` in `daily_storage.py` to generate case tables. No random sampling. Tests run locally before this proposed commit; remote CI remains unverified.

**Outreach remains HOLD:** WSU and SYCD Gmail drafts not sent, no contractor engagements. The model's purpose is to reject weak technical hypotheses early, not to make unearned commercial claims.
