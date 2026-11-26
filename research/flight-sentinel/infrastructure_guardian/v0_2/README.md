# Evercraft Flight Sentinel | Infrastructure Guardian v0.2

**OFFLINE RESEARCH ONLY. NOT FAA, ATC, or aviation safety software.** This module does not query, monitor, control, or connect to actual networks, aircraft, airport systems or service providers.

## Purpose

Assess whether apparently independent backup network routes can conceal a **shared dependency**, and whether a proposed isolation could interrupt healthy critical services. The new independent **fictional truth oracle** makes incorrect decisions visible without giving the advisor access to hidden ground truth.

- `dependency_lab.py`: dependency graph validation, service route evaluation, conservative review of proposed isolation, separate hidden-truth oracle
- `cases_v02.py`: nine fictional cases, including counterexamples
- `test_dependency_lab.py`: 31 Python unittest methods, including 1,000 seeded randomized property checks
- `run_v02.py`: reproducible local JSON evidence generator
- `.github/workflows/flight-sentinel-infrastructure-v02.yml`: offline GitHub tests (when permitted)

From this directory:
```bash
python3 -m unittest -v test_dependency_lab
python3 run_v02.py
```

### Locally measured toy results

Nine hand-designed cases; **two explicitly unresolved harmful sandbox interventions**:
- `unmodeled_backup_power_failure`: declared alternate relay does not disclose a dependency on the failed shared power source
- `all_telemetry_consistently_wrong`: the backup relay is actually down, but reported data says it is available

Both yield **unexpected loss of fictional critical voice and tracking services** when an isolation that looked safe is hypothetically executed. The module **does not fix these misses**: it identifies them when independently compared with hidden toy-world truth. Conversely, a visibly failed backup, an explicit declared common dependency, missing approval, and stale reports lead to conservative responses.

### Explicit boundaries

- The `explicit_human_review` flag is a Boolean within an invented research world, never a verified approval or a real operator action.
- No real network isolation, telemetry, sensor provenance, authenticated identities, physically proven redundancy, regulatory approval, actual fallback, or production effect.
- No evidence of real-world attack detection, aviation safety performance, or the cause of any FAA incident.
- **Systemia** may coordinate experiments and evidence collection only, never act as a critical infrastructure control dependency.

Next engineering gate: evaluate evidence trust and common-mode fault taxonomy with qualified independent reviewers, then model time-dependent recovery and false interventions under a broader set of fictional assumptions. Keep this PR a draft.
