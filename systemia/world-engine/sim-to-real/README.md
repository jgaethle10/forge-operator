# Evercraft Sim-to-Real Field Lab RC01

**Evidence class: modeled / simulation only.** This is an independent Node.js reference experiment to inform a future integration with `systemia/world-engine`'s deterministic tick, snapshot/replay and navigation systems. It does **not** yet call the canonical World Engine runtime, use NVIDIA Isaac, simulate realistic tire-ground dynamics, or control hardware.

The lab explores a differential-drive-like planar robot's response to randomized traction, steering gain and bias, actuator latency, pose-sensor noise, compass noise and small obstacle location shifts. A straight-line controller and a known-map three-waypoint controller operate under the same per-seed environmental parameters. The recorded world always includes one circular obstacle, a safety margin, a geofence and a goal.

## Run

Node.js 20+ only, no npm dependencies:

```sh
node --test systemia/world-engine/sim-to-real/rover-lab.test.mjs
node systemia/world-engine/sim-to-real/rover-lab.mjs --seeds 40 --out /tmp/evercraft-rover-benchmark.json
```

To inspect traces, open `viewer.html` in a browser and select the generated JSON file. The viewer remains offline and does not require GPU support.

## Receipts and explicit boundaries

- `evercraft.sim-to-real.rover-lab.rc01` episode includes scenario seed, randomized parameters, outcome, optional downsampled frames, and SHA-256 integrity digest.
- `evercraft.sim-to-real.benchmark.rc01` includes paired per-seed results, aggregate success/collision/timeout/geofence counts, and a digest. Digests are *not* signatures or external attestations.
- Sample trajectories are preserved for seeds 1-4, with outcome counts for all configured seeds. Every scenario is modeled, never observed hardware telemetry.
- `hardwareCommand()` always rejects requests. This repo has **no actuator adapter**, real sensor input, external emergency authority or autonomous deployment path.
- The local safety gate rejects malformed observations/commands and adds a near-obstacle stop rule, but it is **not a certified safety controller**. Latency can cause collision after a stop has been issued; the baseline is deliberately meant to expose that weakness.
- A successful planned path in this known toy course should not be interpreted as a general autonomous navigation, robotics, SLAM, or sim-to-real success claim.

## What this unlocks next

1. Convert these episode/benchmark receipt contracts into World Engine tick-bound behavior modules while preserving stable deterministic input lineage and replay receipts.
2. Create multi-obstacle maps with unseen obstacles, dynamic pedestrians, moving targets, occlusion, and failures in stale localization. Compare guarded policies against explicit safety invariants.
3. Add independent verification of controller assumptions, actuator delay budgets, and adversarial runs. Define acceptance criteria before any hardware integration.
4. Only after independent hardware review: add a human-gated robot interface behind an emergency-stop, command expiration, explicit control-mode interlocks, and a sandbox-safe test area. Record real sensor logs separately with observed provenance.

No deployment, commercial readiness, or external agent execution is implied by this lab.