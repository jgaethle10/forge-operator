# Flight Sentinel v0.6 | Offline fallback recovery research

**ABSOLUTE BOUNDARY:** Simulation only. This is a fictional planar point-mass and rectangle; there is no aircraft, no physical sensor, no controller, no fallback certification, no actuation, and no real security guarantee. **Never connect this software to flight controls or drones.**

Previous Flight Sentinel versions tested the guardian's **detection**. This research module examines whether a fictional object's path stays within a corridor after a symbolic, delayed fallback request.

## What is actually in GitHub

- recovery_reference.py is a reviewable **reference subset** of the full local v0.6 lab, with an eight-second fictional movement experiment, a five-candidate toy heading-rate search, and a hidden-truth-vs-reported-state separation.
- test_recovery_reference.py has 17 standalone GitHub test methods.
- .github/workflows/flight-sentinel-v06.yml runs these tests and checks the constructed 21-scenario regression matrix on GitHub.
- The separate downloadable local lab bundle contains the complete v0.2–v0.6 Python suite, a read-only interactive HTML viewer and **125 locally passing tests**. These full tests are **not** all mirrored or run on this PR.

To run the GitHub reference subset: from the research/flight-sentinel/v0_6 directory, execute python3 -m unittest -v test_recovery_reference.

## Twenty-one developer-selected toy examples

| Symbolic switch delay | Prevented | Still crossed | Switch introduced crossing | Neither crossed |
|---:|---:|---:|---:|---:|
| 0 seconds | 3 | 6 | 1 | 11 |
| 1 second | 3 | 6 | 1 | 11 |
| 2 seconds | 3 | 6 | 0 | 12 |
| 4 seconds | 1 | 8 | 0 | 12 |
| 8 seconds | 0 | 9 | 0 | 12 |

Definitions refer to crossing imaginary coordinate limits, **not actual crashes or aviation hazards**. Counts on hand-designed cases have no statistical meaning. The most important counterexample uses a **wrong initial reported position**, resulting in a fallback command sequence that crosses the toy boundary even though the original path would stay inside it. Another case continues to miss coherent multiple-source spoofing; some paths cannot recover within the model's heading-rate limit even with immediate switching.

The model has no altitude, speed management, stall, pitch/roll, aerodynamic response, validated authority transfer, environmental uncertainty certification, or real sensor provenance.

## Engineering gate

Do not attempt hardware or user-facing crash-prevention claims. Next: requirements-to-test traceability, independent safety review, formally stated observation/uncertainty assumptions, a named offline dynamics simulator with a separate verifier, and human-factors analysis of unnecessary handoffs. Systemia may orchestrate **offline** experiments, not airborne decisions.
