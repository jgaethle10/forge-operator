# Flight Sentinel v0.4 | offline virtual-airspace safety experiment

**RESEARCH ONLY.** This is a fictional two-dimensional point-mass simulation with no physical aircraft, command path, network telemetry, flight bus, autopilot, actuator or fallback controller. These files must not be used in aircraft operations.

## Reproducible source included here

- \`virtual_airframe.py\`: a planar constant-speed, constant-turn trajectory approximation and symbolic allow/deny gate; it latches any denial.
- \`benchmark_v04.py\`: 14 fault-injection cases with independently numerically integrated hidden toy ground truth. It classifies missed hazards and false alerts.
- \`test_v04.py\`: 21 new tests, including deterministic randomized checks. Run alongside the v0.3 reference module's 12 tests in this PR.
- \`.github/workflows/flight-sentinel-research.yml\`: limited, read-only CI workflow (if enabled by GitHub policy) that checks these research tests and regenerates the campaign.

\`\`\`bash
cd research/flight-sentinel/v0_4
python3 -m unittest -v test_v04
python3 benchmark_v04.py
\`\`\`

The separately packaged full local laboratory kit contains **77 passing tests** across v0.2, v0.3 and v0.4 plus an interactive precomputed dashboard; it is **not wholly mirrored to this branch**. GitHub checks here cover 21 v0.4 and 12 earlier reference tests, not the complete local regression suite.

## Toy campaign, 14 fixtures

| Classification | Count |
|---|---:|
| TP: hazard blocked | 4 |
| TN: safe allowed | 3 |
| FP: safe blocked (false alert) | 4 |
| FN: hazard allowed (**miss**) | 3 |

These are developer-constructed examples, not population statistics or aircraft risk estimates. The eight-second nominal warning lead time in one straight-line example is **not** validated against a real fallback, reaction latency, terrain, flight dynamics or actual controls. Both synthetic 'sensor' identities may be counterfeited consistently. The monitor cannot establish their actual independence or authenticity.

### No safety claims

This is neither certified nor airworthy, nor a demonstration of real cyberattack detection or crash prevention. NASA's runtime assurance / Simplex research motivates the exploration but supplies **no certification** to this work. See https://ntrs.nasa.gov/citations/20240007986 and https://www.faa.gov/aircraft/air_cert/step/disciplines/artificial_intelligence .

**Next research gate**: independent review of the trust model and false-alarm costs; credible environmental/plant uncertainty, more diverse sensing, and a verified offline-only fallback authority model, then a named offline aircraft dynamics environment. Systemia may coordinate this work only outside the actual control loop.
