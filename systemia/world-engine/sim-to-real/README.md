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

## RC02: The Unknown Course (additional experiment)

RC02 adds `rover-challenge.mjs`, `rover-challenge.test.mjs`, `world-engine-handoff.mjs`, and `challenge-viewer.html` alongside the original RC01 without changing its behavior.

The challenge uses four synthetic circular obstacles (one moving), a 10 Hz unicycle-approximation rover, anonymous noisy range-and-bearing detections, randomized traction/braking/steering/command delay, sensor-drop probability, and scheduled sensor blackouts. **Obstacle positions are never given to either controller**; positions are used by the *model* to generate synthetic detections and score collisions. The sensor approximation does not model occlusion, independent lidar rays, SLAM, or real field observations. A blind direct-to-goal policy is compared against a reactive safety-first policy that requests stops on stale range data. Delayed commands can continue driving after a stop request.

### Run locally

Node.js 20+ and no npm packages:

```bash
node --test systemia/world-engine/sim-to-real/rover-lab.test.mjs systemia/world-engine/sim-to-real/rover-challenge.test.mjs
node systemia/world-engine/sim-to-real/rover-challenge.mjs --seeds 40 --out /tmp/evercraft-rc02-benchmark.json
```

Open `challenge-viewer.html` in a browser and choose the output JSON file. The viewer reads the local file without uploading it. Recorded animations are retained for seeds 1–4; all 40 seeds retain episode outcomes and modeled evidence receipts. An optional self-contained offline HTML viewer, generated from the JSON, can be distributed separately without a service.

### Local RC02 receipt, 40 paired seeds

| Policy | Arrived | Collisions | Geofence exits | Timeouts |
|---|---:|---:|---:|---:|
| Blind direct-to-goal | 0 / 40 | 40 | 0 | 0 |
| Reactive safety-first | 19 / 40 | 18 | 3 | 0 |

The safety-first policy requested **422 holds** across those 40 trials, yet collisions and boundary exits still occurred. The test shows a partial reduction in failure, not proof of safe autonomous navigation. The course is deliberately constructed with hazards on the direct route, so these values must not be generalized. Near-miss tick totals should not be compared across policies without exposure normalization.

### World Engine projection boundary

`world-engine-handoff.mjs` converts an intact sampled RC02 episode into data shaped like `evercraft.world-engine.world.v1` and tick-bound `teleport` inputs for the simulated rover and moving obstacle, mapping the 2D model's Y coordinate to World Engine Z (Y-up). It links the source episode's SHA-256 digest and fails on altered receipts. **This is projection-only.** It does **not** import, execute, or validate the native World Engine runtime, and teleport playback does not demonstrate physics or autonomy. The canonical engine must validate/replay this data in a later integration with explicit parity tests.

The modeled SHA-256 hashes are deterministic integrity checks only, not signatures, third-party attestations, or independent safety validation. There is no robot/actuator interface; `hardwareActuation` always rejects. No public deployment, CI pass, physical-world result, or production release is claimed.

### RC03 exit criteria (proposed, not complete)

1. Integrate with the native World Engine runtime and confirm replay tick/state parity on actual execution, not only schema shape.
2. Add occlusion-aware sensors, unknown object tracking, dynamic collision sweeps, localization dropout, and adversarial near-boundary conditions.
3. Validate stop-distance invariants with delayed commands across a larger held-out seed set and independent oracle checks. Publish failure cases.
4. Only after separate hardware-safety review, define a fail-closed device adapter with emergency stop, watchdog/expiry, independent physical safety bounds, human enable and observed hardware receipts.