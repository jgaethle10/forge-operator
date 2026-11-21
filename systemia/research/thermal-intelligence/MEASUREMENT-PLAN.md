# G1 | Passive measurement and validation plan

**Status:** proposed protocol, not a request to collect or transmit anyone's telemetry. No installation, workload increases or changes to cooling controls.

## Purpose

Quantify **coincident and thermally usable** heat from *existing* computing loads. Do not confuse an electricity meter reading with recoverable heat delivered to a sink. The hourly profile screen is a pre-feasibility **screen**, not a safety controller or proof of revenue.

## Required data and boundaries

1. **Compute input power:** independently metered energy at wall for each same one-hour interval, with instrument model, calibration/date, circuit boundary, timezone and missing-data flags. Do not replace whole-system wall power with CPU TDP or utilization percentages. Account for rack fans and power supply losses.
2. **Heat destination:** independently characterized load in **thermal kWh each hour**, destination temperature requirement, and whether it can actually accept the heat then. Record occupancy, storage/discharge constraints and seasonal variability. No annual-demand ÷ 8760 shortcut.
3. **Thermal delivery:** measured fluid/air inlet and outlet temperatures, flow, and relevant specific heat / density or a calibrated heat meter. Record heat exchanger losses and temperature pinch. For direct heat exchange only, screen credits heat where outlet temperature exceeds sink temperature plus the defined approach difference.
4. **Auxiliary electricity:** metered power from circulation pumps, controls and additional cooling. Maintain independent fallback cooling. Record leak/condensate hazards and noise.
5. **Financial baseline:** actual applicable utility energy charge and demand charges where relevant, counterfactual heater COP at operating conditions, hourly compute revenue **only if new and contract-verifiable**, expenses, installed project cost and service lifetime.
6. **Provenance:** separate synthetic inputs from user-supplied readings and independently verified measurements. Include raw meter logs, sampling intervals, custody/permission, instrument uncertainty and reviewer signoff in a private system. No personal device identifiers, credentials or private site data in this public repo.

## Running the profile

\`node systemia/research/thermal-intelligence/run-profile.mjs systemia/research/thermal-intelligence/sample-synthetic-profile.json\`

\`node --test systemia/research/thermal-intelligence/*.test.mjs\`

The JSON file is an intentionally fictional 24-hour site. Example data can be used to regression test formulas; **do not annualize its one-day result** or call it a real savings estimate.

## Go/no-go

- **Reject / reconsider:** no compatible heat sink, temperatures cannot be matched, real measured demand is too low, utility costs exceed avoided heat value, or cooling reliability is reduced.
- **Continue research:** quality-checked logs covering relevant heating and non-heating periods, positive conservative marginal economics and a licensed safety review. No capital commitment without actual vendor quotes and scope.
- **Field deployment remains prohibited** by this documentation alone. Qualified engineering, electrical safety, domestic water/public health requirements and relevant local approvals are separate mandatory gates.

## Test coverage

- Hourly timestamps must be contiguous UTC (no silently filled gaps).
- Low-temperature heat does **not** receive direct exchange credit.
- Heat demand caps useful heat; excess is treated as unusable.
- Added computer electricity is never disguised as free.
- Costs, heat-pump alternatives and positive-but-unverified results are all explicitly distinguished.
