# G1.2 | Whole-system electrical evidence, not heat proof

**Status:** Offline validation and proposed passive data contract. No field readings received, no Node001/Node002 control, no production changes, and no authorization to install equipment.

## Measurement boundary and why it matters

- **Accepted evidence for electricity consumed:** Cumulative **Wh** measurements from an appropriately rated, calibrated, externally installed whole-system meter for the computing equipment and the full electricity boundary stated in the protocol. Safety-certified equipment and competent installation are mandatory.
- **Insufficient on its own:** CPU package power, GPU TDP, software-estimated workload energy, operating-system battery discharge, ambient temperature or fan RPM. These may provide contextual telemetry, but **must not be silently promoted to at-wall kilowatt-hours**.
- **Different measurement entirely:** Recovered thermal energy, measured by a calibrated heat-transfer loop with mass flow, fluid heat capacity, temperatures, time alignment and coincident sink demand. A wall-power meter can never establish this.

## Read-only workflow

1. Site owner approves a passive survey without new compute workloads or HVAC changes.
2. Appropriate electrical professional selects metering that measures the **whole computing electrical boundary**. Record exact energy-meter model, ratings, location in the circuit, calibration/uncertainty and whether storage/battery/UPS paths affect the boundary.
3. Export cumulative Wh at consecutive UTC whole-hour boundaries to an **on-site local JSON file** with the schema demonstrated in `sample-synthetic-wall-meter.json`. Keep device IDs, site addresses, personal information and raw logs in permission-controlled private storage.
4. Run `node systemia/research/thermal-intelligence/run-wall-meter.mjs <local-meter.json>`. The script reads a local file; it never polls meters.
5. Any meter reset, duplicate hour, DST-offset timestamp, missing interval or unexpected energy counter decrease **stops processing** until source data are reconciled. Extreme instantaneous power relative to the declared envelope is flagged.
6. The result is a series of `wallElectricKWh` intervals plus quality flags and `thermalRecoveryVerified:false`. Do not join to heat-demand or thermal data until interval alignment, meter custody, sensor calibration and source boundaries receive independent review.
7. Only once a separate safe and authorized heat loop exists can the team compare delivered thermal kWh against these electrical kWh. The heat-loop and the electrical metering must be independently calibrated and reviewed.

## Execute deterministic sample

```bash
node --test systemia/research/thermal-intelligence/*.test.mjs
node systemia/research/thermal-intelligence/run-wall-meter.mjs systemia/research/thermal-intelligence/sample-synthetic-wall-meter.json
```

The fictional meter reading series is 120000, 120470, 121020, 121700 cumulative Wh at the start of four contiguous one-hour boundaries. It creates three computed hourly intervals of 0.47, 0.55 and 0.68 kWh, total 1.70 kWh. Its `instrumentEvidence` is **unknown**; it must be labeled **quality review required** even though the math is valid. This is **not** an Evercraft node measurement.

## Gate decision

**Pass only the intake implementation gate:** validate format, units, chronology and counter consistency, run offline CI and preserve provenance.

**Do not pass the physical measurement gate** until site consent, appropriate metering, credible calibration, a complete bounded electrical measurement baseline and safety signoff exist. Even a high-quality electrical baseline cannot prove captured heat, customer savings, or a commercial installation.

**No auto-dispatch:** Systemia may plan the work but may not start compute workloads for heat, switch cooling fans, install equipment, enter customers' infrastructure, alter water heaters, touch a utility circuit or claim profits based on these files.
