# Evercraft Flight Sentinel | Infrastructure Guardian v0.1

**RESEARCH ONLY. NO FAA, ATC, airport, aircraft, autonomous flight, network or production I/O.** This is a separate research track from the aircraft-control Flight Sentinel guardian. The code proposes symbolic decisions and manipulates only fictional Python dictionaries; it must never be connected to operational infrastructure.

## Mission

Investigate cascading communications failures, shared infrastructure dependencies, traffic anomalies, maintenance-related faults, misleading telemetry and conservative degraded modes. These problems are relevant independent of whether a particular fault is accidental or malicious.

**November 13 FAA ground stop:** According to the FAA on November 15, telecommunications instability affected 17 of 22 centers amid excessive traffic (~1,000 connection attempts every 4–5 seconds). The sites in El Dorado, Arkansas and Amarillo, Texas were identified as potential sources; root cause was still under investigation. The agency reported no indication of a cyberattack. **This simulator does not model the FAA network or claim AI involvement.**

Primary record: https://www.faa.gov/newsroom/nationwide-ground-stop-questions-and-answers

## Files and execution

- `model.py`: validation, persistence checks, dual-observer comparison, backup-dependency precaution, symbolic containment proposal, isolated what-if evaluator.
- `scenarios.py`: 10 fictional fault fixtures (including known misses).
- `test_infrastructure.py`: 21 regression tests.
- `run_campaign.py`: creates local `campaign-results.json`; no network interaction.

Run from this directory:

```bash
python3 -m unittest -v test_infrastructure
python3 run_campaign.py
```

The model uses 3 imaginary traffic sources, an invented common-path capacity and an assumed independent backup. An intervention occurs **only inside the hypothetical evaluator** and only when its explicit test Boolean is true. No real isolation command or real operator authorization is implemented.

### Illustrative comparison

On one purposely constructed flood trace, the naive baseline experiences **5 primary-overload samples**. An authorized hypothetical isolation that begins on the next sample reduces this to **2**. With no authorization it remains **5**. There are also scenarios where the guardian cannot isolate: distributed overload with no dominant source, false telemetry that is consistent across all synthetic observers, source disagreement, or a shared backup fault. **These are hand-made examples, not performance or availability estimates.**

## Critical stop-ship restrictions

- No actual traffic measurement, verified source authentication, cryptographic integrity, physically independent backups, timing guarantees, human factors, secure approval or critical-network control.
- A single bit saying backup is independent is **not proof of independence**.
- Maintenance anomalies are routed to manual review; a maintenance flag is not evidence of benign behavior.
- No evidence of actual FAA root cause, attribution, protected aviation operations or AI attack/crash prevention.
- This research must not be used to monitor, probe, inject traffic, modify configs, remotely quarantine, trigger a ground stop, or connect to any live ATC/airport/aircraft/network system.

### Next assurance gates

1. Hazard register and requirements-to-evidence trace, reviewed by qualified communications and safety engineers.
2. Test different common-cause dependencies, source trust models, availability vs false-intervention costs.
3. Offline network topology simulations and fault recovery without real systems.
4. Independent cyber/aviation assurance review before any design for an operator-facing tool.

**Systemia** may orchestrate offline tests, collect logs, and coordinate review. It may never be a live safety-control dependency.
