# G1.1 | Calorimetry and passive energy evidence

**State: experimental software only.** No thermal equipment has been installed and no verified measurement dataset has been collected. This document is intentionally public-safe. Private site identifiers, meter logs, photos, floor plans, personal data, API keys, and credentials must not be committed to GitHub.

## What this version adds

`measurement-intake.mjs` processes a *user-supplied, local JSON file* representing contiguous UTC hourly observations. It does **not** poll existing Evercraft nodes, modify their workloads, control cooling, communicate with Systemia, operate pumps, or use any hardware interfaces.

It estimates hourly heat transfer from a fluid loop by:

`Q_thermal_kWh = flow_kg_per_second × fluid_specific_heat_kJ_per_kg_C × (hot_inlet_C - hot_outlet_C) × 1 hour`

For the exactly one-hour rows in this schema, the numerical result has units kWh. The supplied flow is **mass flow**, not volume flow, and specific heat must correspond to the actual fluid and temperature. These hourly-average inputs are an approximation; calibrated integrating heat meters are preferable for real measurements and transient behavior.

**Limits:** This is a desk-screen for a simple single-source direct-exchange loop without stored thermal energy, phase changes, or heat-pump temperature lift. It conservatively requires the hot-side outlet to exceed the sink's required temperature by the specified approach difference. A high apparent heat recovery rate (more than 105% of wall IT electricity plus 0.01 kWh) triggers a review gate and receives no useful heat credit. This is a screening heuristic, **not** a physical guarantee: real systems with time-varying stored heat or outside energy inputs need a different energy-balance model.

## Offline dry run

From repository root:

```bash
node --test systemia/research/thermal-intelligence/model.test.mjs systemia/research/thermal-intelligence/hourly-screen.test.mjs systemia/research/thermal-intelligence/measurement-intake.test.mjs
node systemia/research/thermal-intelligence/run-measurements.mjs systemia/research/thermal-intelligence/sample-synthetic-measurements.json
```

The committed sample deliberately contains four synthetic hours: one potentially useful hour, one with no heat demand, one with an inadequate temperature, and one that violates the simple energy-balance threshold. The expected result is **DATA_REVIEW_REQUIRED**, not a green success. The sample does not simulate actual Evercraft devices or validate physical hardware.

## Required fields

Batch-level:

- `dataStatus`: `synthetic` or `user_supplied_unverified`; no automatic verified tier.
- `instrumentEvidence`: `wallMeter`, `flowMeter`, `hotInletSensor`, and `hotOutletSensor`; each is `documented_unverified` or `unknown`. Even documents supplied by the user require external technical review.
- `approachDeltaC`, `capexUSD`, `projectLifeYears`, and `annualOpexUSD`.

Hourly values:

- `timestamp` in exact UTC whole-hour format, ordered contiguously without missing time.
- `wallElectricKWh`: full computing system meter reading during the hour, **not** reported CPU or GPU TDP.
- `flowKgPerSecond`, `fluidCpKJPerKgC`, `hotInletC`, `hotOutletC`: supplied calorimetry inputs for one consistent heat-transfer boundary. No volumetric-flow conversions unless density has been independently determined.
- `sinkRequiredC`, `heatDemandKWhThermal`: sink compatibility and **coincident** demand.
- `comparatorCOP`, `electricityUSDPerKWh`, `incrementalComputeFraction`, `auxElectricKWh`, `incrementalRevenueUSD`, `claimedCoolingOffsetUSD`: counterfactual and incremental economics. Claimable compute revenues and cooling credits remain unverified user inputs unless corroborated separately.

## Quality gates

1. Reject bad units, missing fields, false `verified` labels, bad timestamps, gaps, duplicates, negative values, and impossible COP.
2. Flag reversed thermal direction and reject useful heat credit.
3. Flag suspicious heat recovery exceeding the energy-balance threshold. Preserve the raw computed thermal value but grant no useful heat credit.
4. Reject useful heat credit when the hot-loop outlet is too cool for the sink. Cap useful heat by demand **within that same hour**.
5. Mark unknown meter calibration for human review. **Calibration metadata alone never certifies a measurement.**
6. Keep `independentlyVerified=false` and `fieldDeploymentApproved=false` under all possible inputs.
7. Require a qualified engineer and calibrated sensors before moving to isolated non-potable physical experiments. No domestic water heater or plumbing modification.

## Next actual-world requirement

Before labeling anything `MEASURED`, obtain consent and an independently documented metering protocol from the owner of a real existing compute node. Collect at-wall electrical input and independent heat-loop measurements, then record a calibrated full-period baseline (heating and non-heating hours). Use secure local storage with permissions and evidence receipts; do not upload site raw data to this public repository.

**No new compute workload or energy spending is authorized by this research packet.**
