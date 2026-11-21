# Flight Sentinel v0.3 | trajectory reference

**State:** active research, OFFLINE SYNTHETIC DEMONSTRATION. Not aviation or security certification, never connect this code to real aircraft systems.

The two Python files in this directory are the **standalone, reviewable v0.3 reference subset** from Evercraft's separately packaged simulation kit.

- `trajectory_reference.py`: stateful 1-D toy lateral corridor gate, six-second forecast, sample-gap and consistency checks, latched denial.
- `test_trajectory_reference.py`: 12 Python unittest methods with deterministic randomized checks.

Run from this directory:

```bash
python3 -m unittest -v test_trajectory_reference
```

**Do not construe this as flight protection.** It assumes a fabricated quadratic trajectory, invented thresholds, nominal timestamp truth, no authenticated sensors, no actual fallback, no actuators and no verified independent hardware. Two independently named sensors can still suffer the same hidden fault. Its advisory text cannot be used as a real control command.

The broader local Flight Sentinel v0.3 kit combines this trajectory idea with the previous static guard and provides **56 locally passing unit tests**, **16 synthetic scenario fixtures** (15 with assigned expected outcomes, all 15 matched), one **deliberately undetected common-mode sensor spoof scenario**, a static dashboard and evidence notes. Those aggregate numbers describe **the local kit**, not CI execution on GitHub. The full integrated kit has **not yet been mirrored to this PR**; do not claim otherwise.

### Engineering gates

1. Replicate tests inside GitHub CI before review, keeping it simulation-only.
2. Review unit consistency, adversarial traces, model assumptions and false alarms.
3. Choose one virtual airframe and use its **offline** dynamics model with qualified reviewer involvement.
4. Build a traceable safety argument and independent sensor/fallback feasibility study before any hardware proposal.

### Background

NASA's runtime-assurance research: https://ntrs.nasa.gov/citations/20240007986

FAA AI/ML aviation safety discipline: https://www.faa.gov/aircraft/air_cert/step/disciplines/artificial_intelligence

EASA June 2026 Concept Paper AI guidance: https://www.easa.europa.eu/en/newsroom-and-events/news/easa-releases-latest-issue-its-concept-paper-artificial-intelligence

**Systemia role:** orchestrate research, tests, evidence capture and review only; never become a flight-control dependency.
