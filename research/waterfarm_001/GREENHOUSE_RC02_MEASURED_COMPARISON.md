# GREENHOUSE RC02 | Differential water and energy verification | 2026-10-25

## Narrow engineering thesis
Build measured agriculture water intelligence first. A greenhouse condenser is valuable only if paired testing demonstrates a safe, permitted reduction in *external freshwater withdrawals*, acceptable crop humidity/health and a credible economic advantage over the cheapest compliant humidity-management alternative. Avoid rebranding existing condensate technology as invented physics.

## Local implementation completed
`science/greenhouse_trial.py` evaluates baseline vs experiment using:
- Paired daily measured external water demand in both arms.
- Measured captured vs independently authorized and actually returned condensate.
- Whole-system baseline vs experimental electrical kWh.
- Independently reviewed matched agronomic conditions, sensor QA and water-use authorization.
- Marginal avoidable water cost, power cost, daily consumables, annual service and up-front capital.

The software **fail closes** on unmatched conditions, invalid/NaN data, return flow exceeding condensate volume, or attempted water reuse without authorization. If reuse is not approved, captured condensate is credited as **zero** external-water displacement. It separately records negative or positive change in power, then computes a clearly labeled annualized economics scenario (not a quoted ROI or seasonal forecast). Seven science and five film-intake tests passed locally.

## Physics/economics stress scenario (NOT field data)
A device captures 50 L/day but only displaces 10 L/day outside water and adds 5 kWh/day. At illustrative 300 days/year, $3/m³ avoidable water value and $0.12/kWh, water saves $9/year while incremental electricity costs $180/year **before servicing, filters and equipment**. Condensate recovery and avoided demand are different metrics.

## External scientific/regulatory references
- Huang et al. (2026), Applied Thermal Engineering DOI https://doi.org/10.1016/j.applthermaleng.2026.130486 ; greenhouse experimental recovered 9.55 kg/360 h and reported SEC 1.44 kWh/kg under trial conditions, not our results.
- Raza et al. (2026) DOI https://doi.org/10.1016/j.icheatmasstransfer.2025.110321 ; competing dehumidification/energy configurations.
- WA Department of Health ONWS https://doh.wa.gov/node/59875 ; legal and quality approval are mandatory questions, condensate inclusion as a source is not automatic authorisation to use on crops.
- WA Ecology https://ecology.wa.gov/water-shorelines/water-supply/water-recovery-solutions/rainwater-collection ; roof runoff collection subject to same-site/existing-purpose and separate plumbing/quality requirements.

## Next QA
1. Get dated official NOAA station data; never convert missing observations to 0.
2. Select a real greenhouse/site demand case, eligible end use and minimum-value comparator.
3. Professional engineer and agronomy review of paired test and electrical/water safety before hardware or trials.
4. Trace sensors and sample lab data, pre-register uncertainty and stop conditions.
5. Pilot only after permits/authorizations, insurance and data/IP agreements.

**No claimed field water savings, prototype deployment, research partner, financing or permit.** Keep WSU/SYCD Gmail introductions as owner-review drafts; not sent.
