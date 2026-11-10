# G1.3 | Node002 / NextGen: safe field-readiness checklist

**State (2026-11-09):** Research software and one-shot passive OS-context probe prepared; **no permissioned physical meter data imported**, no verified Systemia dispatch, no delivered heat measurement. A public GitHub Action runs against GitHub's hosted runner, not against the field owner's computer.

## Goal

Find out whether an approved Evercraft Windows/WSL2 computing node is suitable for a future passive electricity baseline. Keep exact device make, identifiers and location in private records only. Do not run a heater experiment. The goal today is a **safe readiness classification**, not demonstration of recovered heat.

## The one-shot authorized step, if the owner chooses to run it locally

From the checked-out `research/thermal-intelligence-001` branch of `forge-operator`, run:

```bash
node systemia/research/thermal-intelligence/run-node-readiness.mjs
```

The script reads only high-level operating-system context, Linux `/proc/version`, and optional sysfs thermal zones. It reports no hostnames, serial numbers, IP addresses, usernames, MAC addresses, file contents, process names, browser history or credentials. It does **not** install anything, require sudo, run a workload, poll repeatedly, modify fans, turn on a pump, connect to an API, send data to Systemia, or access the host power meter.

A typical WSL2 result is `environment:"WSL_HOST_VIRTUALIZED"`, `evidenceClass:"LOCAL_SOFTWARE_CONTEXT_ONLY"`, `atWallElectricKWh:null`, and `usefulRecoveredHeatKWh:null`. The absence of exposed thermal sensors is expected and not a hardware failure. The output is **unverified self-reported local context**, not an instrument receipt or a thermal energy experiment.

## Decision gates

1. **G1A software only, possible now:** run the read-only probe once on an approved node. Record local result in a privately controlled evidence store (do not publish raw node telemetry).
2. **G1B meter boundary, pending equipment/qualified inspection:** choose a properly rated, approved, externally installed whole-system energy meter. Obtain site/equipment permission and any needed electrician support. No bare wiring, PSU modification or unsafe inline current probe. A computer's CPU TDP, battery percentage or `/sys` temperature does not replace an at-wall watt-hour measurement.
3. **G1C passive baseline, pending actual meter:** export cumulative Wh boundaries at consecutive UTC whole hours. Example interface: `node systemia/research/thermal-intelligence/run-wall-meter.mjs path/to/private-cumulative-wh.json`. The path points to a local, permission-controlled file. Classifier refuses to report independent verification.
4. **G1D heat destination, pending separate metering:** document a real, coincident building/process heat demand and appropriate usable temperature. No plumbing work or closed-loop thermal modifications are covered by this authorization.
5. **G1E calorimetry, future qualified bench only:** independently instrument thermal loop temperatures/mass flow, record power and heat at the same boundaries, calibrate sensors, secure electrical/pressure/leak controls and independent fallback cooling. Requires separate qualified approval.

## Evidence ledger

| Evidence | Today | What clears it |
|---|---|---|
| Research calculations and fail-closed tests | Complete in draft branch; CI receipt to confirm on latest commit | Explicit successful offline dedicated workflow |
| Node002 passive software inventory | **Not collected from Node002** | Locally executed, time-stamped, consented probe receipt |
| Node002 at-wall input energy | **Not measured** | Calibrated, safely installed whole-system meter and logged data |
| Useful recovered heat | **Not measured** | Independent instrumented heat transfer, demand and temperature review |
| Actual dollar savings | **Unknown** | Full measured baseline, real tariff/parts, seasonal demand, competent review |
| Systemia production execution | **Not verified** | Authorized mission/agent dispatch and execution receipt |

## Data boundary and rationale

**Do not commit** personal meter readings, precise location, identifying device metadata or private Plasma Hearth content to the public branch. The software only validates information supplied via a local JSON file and never contacts Node002 over the network.

An external meter or a professionally evaluated local utility record is the missing dependency. **No additional compute runtime is required to discover whether a CPU produces heat.** No new electricity spending, purchases, customer contact or field installation is authorized by this document.

## Next owner action

Systemia mission-owner candidate: thermal-energy research lead. Next factual checkpoint: a documented `G1A` local readiness receipt **or** explicit `BLOCKED_EXTERNAL_METER` state, never a fictitious result. Do not silently mark complete because a CI job passed. If the owner cannot provide a safe meter, research can continue via simulations without claiming measured thermal value.
