# EVERCRAFT AQUA | RC03 scientific decision, 2026-10-25

**Evidence level:** code + synthetic tests; no observed water recovery, crop experiment, field deployments, grant, paid order, or approved reused water.

## Finding 1: the legacy model could overclaim
The pre-RC03 `greenhouse_trial.evaluate` treated a difference in baseline/treatment freshwater use as verified avoided withdrawals whenever a Boolean reuse flag was true. It could report credit even when recovered condensate was *never reused*, no statistical uncertainty was established, and no causality review was performed. That is inappropriate for a customer or academic claim. RC03 fail-closes the legacy path: savings=0, annual credited reductions=0, and status HOLD_LEGACY_REQUIRES_PREREGISTERED_CAUSAL_REVIEW. Raw paired difference survives only as descriptive explanation, with no commercial payback.

## Finding 2: physical condensate ≠ attributable freshwater savings
The new `science/evidence_gate.py` gates any *candidate signal* behind consecutive paired dates, calibrated meter error assumptions, comparable crop conditions, sensor QA, explicit source-to-end-use authorization, preregistration and independent review. It bounds the signal by the *actual volume returned*, a Student-t sampling lower bound, and a conservative maximum meter-error bound. This still does NOT prove causal effectiveness, because repeated days can be autocorrelated, subtle crop changes can cause differences, and the review fields are supplied by the researcher, not verified by code. We do not assert that a 14-day run proves annual savings.

A deliberately synthetic example with 14 matching days, 100 L/day outside demand control, 90 L/day treatment, 12 L/day recovered, 10 L/day applied and ±0.5 L reading uncertainty gives a candidate lower screen of **126 L** at most (meter error: 140 − 14 = 126; physical returned: 140). No field readings have been gathered, and the synthetic screen is not a scientific result. With ±1 L per reading, the candidate drops to 112 L. Case results are conditional on unrealistic independent daily paired differences.

## Finding 3: the likely earliest useful product is water intelligence
WSU Irrigation in the Pacific Northwest estimates crop water consumption using ETc = Kc × ETr, with crop coefficient and reference evapotranspiration input sourced and season-adjusted. The RC03 crop screen implements this arithmetic (not field calibration), with measured/assumed effective precipitation and irrigation application efficiency, separated from outside withdrawal measurements. WSU warns crop coefficients vary with growth stage and its historical ETr estimates have variability; do not use a generic Kc as a guaranteed recommendation. Source: https://irrigation.wsu.edu/Content/ET_IWR_For_WA.php .

Our commercial hypothesis is a paid, transparent water-use feasibility and measurement service if a grower values it, not a claim of a new water-generating process. Baseline flows, usable crop demand, energy, and verified treatment pathways come before new machines.

## Finding 4: energy economics can kill the project
If recovery displaces only 10 L/day and adds 5 kWh/day, then over *hypothetical* 300 operating days, savings are 3 m³/year. At a deliberately illustrative water value of $3/m³, that's $9/yr, versus $180/yr of extra electricity at $0.12/kWh, before filters, maintenance and capital. The **minimum avoidable water price** to offset electricity alone in that hypothetical is $60/m³. These are sensitivity assumptions, not actual Yakima water tariffs or quoted device performance.

## Weather evidence still held
NOAA's YAKIMA AIRPORT station `GHCND:USW00024243` is official and has historical daily observations. We verified station identity and NCEI data availability pages, but the runtime cannot download the 2025 daily CSV from the official NCEI API due to network restrictions. No actual daily precipitation data have been validated here. Do not substitute monthly normals as observed daily rain or silently fill gaps. Sources: https://www.ncdc.noaa.gov/cdo-web/datasets/GHCND/stations/GHCND%3AUSW00024243/detail and https://www.ncei.noaa.gov/access/search/data-search/daily-summaries/ . The existing strict observation importer remains an admissibility gate.

## Regulatory boundary
Rainwater collection in WA is subject to same-property and existing-purpose-roof policy; usable water is not automatically drinking water. EPA advises fit-for-purpose treatment and ongoing monitoring for onsite reuse. Collected greenhouse condensate is held in isolated vessels until a qualified researcher/engineer and responsible regulator confirms appropriate testing, design and permitted end use. Sources: https://ecology.wa.gov/water-shorelines/water-supply/water-recovery-solutions/rainwater-collection and https://www.epa.gov/water-research/onsite-non-potable-water-reuse-research .

## Pre-pilot design specification
1. Identify a consenting operator with one measurable nonpotable water-use pain point, rather than a generalized 'make water' claim.
2. Preserve private customer and crop data outside the public repository, with collection authority and deletion/retention policy.
3. Calibrate and document **two independent** freshwater input meters (controls and treatment), whole-system kWh readings, recovered and returned condensate weights, RH/temperature, irrigation regime, production and quality, UTC date and raw meter export; plus uncertainty/model provenance.
4. Pre-register crop area, crop stage, minimum comparison windows, crossovers or randomized assignments, matching conditions, primary endpoint (outside source withdrawals) and secondary endpoints (energy, crop health, water quality).
5. Document a cheapest legal alternative (monitoring and schedule changes, leak repair, conventional greenhouse humidity management), and compare full life-cycle costs. Account for contamination and water-right constraints.
6. Run a **simulation and bench measurement dry-run** with isolated water before requesting any crop-contact reuse, plant, installation or commercial exposure. Qualified personnel design electrical and water safety.
7. Publish all negative findings and trial limitations, not merely the best-case recovery rate. External publication requires owner signoff.

### Operational checklist
- [x] Legacy false-positive savings pathway blocked in local source.
- [x] Fresh paired-data gate and physical/measurement/statistical bounds implemented.
- [x] WSU-based crop water arithmetic screen implemented.
- [x] Synthetic regression suite tested locally.
- [ ] Independent reviewer, calibrated physical meter, real site, crop measurements, local water tariff and energy quote.
- [ ] Official 2025 NOAA station PRCP daily file ingest, source and QC checked.
- [ ] Research ethics, quality and water permits for candidate site.
- [ ] Physical recovered water and measured avoided freshwater externally verified.

**Status:** research next gate = real observation acquisition + registered study design. Partner outreach remains **UNSENT** and hardware work remains **HOLD**.
