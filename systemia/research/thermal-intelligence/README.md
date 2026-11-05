# THERMAL-INTELLIGENCE-001 | Evercraft heat recovery R&D

**Stage:** Desk-only research packet and reproducible synthetic energy/economics model (2026-11-04). **Route:** Systemia-first, pending private admission/dispatch. **Owner:** Evercraft LLC. **No hardware build or production changes authorized.**

## Mission

Identify where heat from **already useful computing** can economically replace purchased building/process heat, while honoring temperature, timing, reliability, safety, and heat-pump comparison constraints. This is not a Bitcoin-mining endorsement or a claim that heat is free. This publicly shareable packet contains no private Plasma Hearth evidence or design IP. Future cross-program integration requires an approved private Systemia handoff.

### Three distinct scenarios, never conflated

1. **Existing workload, adding heat recovery:** IT electricity is already in the baseline. Evaluate *additional* pump/piping/thermal recovery cost against actual avoided heat/cooling energy and capital expense. Never count existing compute revenue again.
2. **New workload deliberately run for heat + compute:** Include the full incremental IT electricity and only the incremental, contract-backed compute earnings. Do not infer crypto profitability from marketing material.
3. **Dedicated electric heating alternative:** Compare with resistance heating (COP roughly 1) **and** heat-pump heating (illustrative COP 3, subject to site-specific performance). High-efficiency heat pumps usually produce more heat per input kWh and may dominate.

## Model and reproducibility

`node systemia/research/thermal-intelligence/model.mjs`

`node --test systemia/research/thermal-intelligence/model.test.mjs`

Inputs are explicit hypotheses, not sensor data. `powerWatts * hoursPerDay * utilization / 1000` gives IT energy in kWh/day. Heat captured is IT energy times capture fraction; delivered heat applies a second delivery fraction; **useful** heat is capped by measured heat demand. Avoided electricity for a comparator heater is useful heat / comparator COP. Value is this offset times electricity tariff. Incremental compute electricity is only counted in proportion to workload actually added by the project, plus parasitics. Revenue, avoided cooling cost, capex, and recurring costs are separate and default to zero. The model is steady-state; it does not resolve fluid temperature, heat exchanger performance, legionella risk, controls, standby losses, seasonal profiles, power factor or real heat-pump COP.

### Example: 600 W, 12 h/day (fictional, not site estimate)

Assume 75% heat capture, 80% thermal delivery, >=4.32 kWh/day usable heat demand, electricity at $0.12/kWh, 0.18 kWh/day parasitics, no incremental compute revenue, and no equipment expenses (thus **optimistic**):

| Case | Useful heat | Avoided heating electricity | Net/day before capital/O&M |
|---|---:|---:|---:|
| New compute vs electric resistance heater | 4.32 kWh | 4.32 kWh | -$0.3672 |
| Already-running compute, resistance heater | 4.32 kWh | 4.32 kWh | +$0.4968 |
| New compute vs heat pump, assumed COP=3 | 4.32 kWh | 1.44 kWh | -$0.7128 |

Neither positive marginal example constitutes a business case without measurement, winter/summer demand, reliable compute value, equipment pricing, electrical safety review and installation feasibility.

## Stage gates

- **G0 / design control:** Identify candidate heat sink, owner/permission, heating comparator, HVAC loop boundaries, site tariff, space constraints, and objective. Record assumptions and independent red-team review.
- **G1 / passive measurement:** Measure existing compute input energy, utilization, thermals and safe available heat, plus coincident heat demand and temperature. Do not modify cooling controls. Ensure consent, security and metering calibration.
- **G2 / isolated bench:** Only after qualified electrical/mechanical safety review, assess commercial low-voltage water-cooling/heat-exchanger components using an isolated non-potable loop with appropriate containment, protective controls, leak response, and fail-safe independent cooling. No household plumbing, no pressure vessel modifications, no public water system connections.
- **G3 / validated benefit:** Pre-register baseline and report paired before/after measurements: computing throughput, total electric input, auxiliary pumping, thermal inlet/outlet temperatures, flow, ambient and demand, usable heat, cooling reliability, uncertainty, and total installed costs. Report winter and summer separately. No synthetic data passed off as observed.
- **G4 / financial gate:** Conservative scenarios using an actual electric rate, real site heat sink, reliability costs, measured COP, capex and potential heat-use outages. Seek positive NPV over a justified asset life, not marketing payback.
- **G5 / commercial gate:** Independent relevant licensed engineering, codes/standards, equipment approval, customer terms, warranty and insurance review. No product claim or field deployment without it.

**Always-on rule:** Systemia cannot allocate more compute solely for heat until the thermal, electrical and primary-device constraints are met. Never disable throttling or crash a user's compute to maximize heat.

## Proposed specialist roles (not dispatched)

- Thermal engineer: temperature grade, exchangers, flow and redundant cooling.
- Energy economist: incremental baseline and competing heat pump economics.
- Compute operator: bounded useful workload, energy/throughput measurement, safe thermal limits.
- Independent reviewer: falsifiable benefits, installation risk, cost uncertainty.

## Source ledger (external guidance, not project measurement)

- US DOE, *Best Practices Guide for Energy-Efficient Data Center Design* (2024), section 7 heat reuse: https://www.energy.gov/sites/default/files/2024-07/best-practice-guide-data-center-design.pdf
- ASHRAE, *AI Data Center Energy Performance Framework: Energy and Thermal Efficiency*: https://www.ashrae.org/technical-resources/topics-and-initiatives/ai-data-center/energy-and-thermal-efficiency
- US DOE, *Water Heaters Heat Pumps*: https://bsesc.energy.gov/energy-basics/water-heaters-heat-pumps

## Operational evidence boundary

A GitHub branch, issue or successful unit test is **not** Systemia mission admission, live agent dispatch, installed equipment, collected thermal telemetry, measured profitability or purchased compute service. Public Evercraft Fabric discovery is read-only and its current health may be unavailable; reconcile with private Systemia before asserting any execution. Keep private Plasma Hearth records in their existing protected boundary.
