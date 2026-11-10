# Flight Sentinel v0.5 | Research-only reference layer

**Status: offline synthetic simulation.** No flight controls, aircraft telemetry, controller handoff, aviation certification, or tested physical sensor exists in this project. **Never connect this code to an aircraft, UAV, actuator, radio, flight bus or an autopilot.**

This directory now contains **reviewable v0.5 code** (not just a project charter), built on the v0.4 toy planar simulator in `../v0_4`:

- `robust_guard.py`: hypothetical third reference check; bounded environmental perturbation reachability; symbolic latched interlock; an offline fallback state machine
- `campaign_v05.py`: exact same 20 constructed cases evaluated with v0.4 and v0.5, using the prior independent toy-world truth oracle
- `test_v05.py`: 19 focused GitHub reference tests with deliberate counterexamples
- `../../..//.github/workflows/flight-sentinel-v05.yml`: read-only CI, if permitted by repository settings

Run from this directory:

```bash
python3 -m unittest -q test_v05
python3 campaign_v05.py
```

## Reproducible synthetic comparison

| Outcome | v0.4 | v0.5 |
|---|---:|---:|
| TP: hazards rejected | 4 | 7 |
| TN: safe proposals allowed | 6 | 3 |
| FP: safe proposals rejected | 5 | 8 |
| FN: hazards permitted | 5 | 2 |

**These 20 cases are intentionally chosen; no production hazard detection rate can be inferred.** Reduced misses come at the cost of more false alarms. The remaining 2 misses are coherent spoofing of all three synthetic sources and wind beyond the declared bound. A supplied `provenance_label` is just a Python string and **is not actual authentication or independent provenance**. The fallback state machine returns labels only; it does not stabilize or control a vehicle.

The separately packaged local v0.5 lab kit runs **105 tests** and includes its offline graphical report. This GitHub reference subset contains **19 v0.5 tests** plus prior v0.3/v0.4 references, not the complete legacy suite. Do not attribute local results to CI until workflow completion is confirmed.

## Next gate

Independent research review of source provenance/common-mode faults, human factors/false alert costs, appropriate state-estimation uncertainty, and fallback feasibility; then a named offline flight-dynamics simulator and a requirements-to-evidence traceability matrix. Systemia is authorized for offline research orchestration only, never an aircraft control loop.
