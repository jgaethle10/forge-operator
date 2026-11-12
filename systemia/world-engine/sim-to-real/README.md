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

## RC03: Native World Engine trajectory proof (modeled only)

RC03 moves the RC02 trajectory projection from data-only to executable **native Evercraft World Engine playback**, through the existing `EvercraftWorldRuntime`. This is a **teleport-based playback of recorded modeled samples**, not an autonomous robotics controller or a validated physics model.

```sh
npm install --no-audit --no-fund
node --import tsx --test systemia/world-engine/sim-to-real/native-engine-proof.test.mjs
node --import tsx systemia/world-engine/sim-to-real/native-engine-proof.mjs --seeds 4 --out /tmp/evercraft-native-rc03.json
```

The native runner cross-checks each recorded sample's position and sphere-overlap contacts against a separate geometric oracle, tests native world snapshot integrity, native deterministic replay, checkpoint restoration and input-ledger order invariance. Tampered episode / proof digests are rejected. Output claims are limited to **modeled synthetic data and sampled positions**. Intervening (unrecorded) ticks are not full-fidelity rover motion, and these tests do not establish continuous collision avoidance, emergency stopping, control quality or hardware safety.

Hardware authority remains absent. Future work is to record every simulated tick, then test movement by native dynamic inputs rather than teleports, before considering any physical system.


## RC04: native velocity-driven motion, not teleport replay

RC04 uses the **actual** `EvercraftWorldRuntime` to integrate a simple dynamic sphere representing a planar rover proxy. A simulated controller submits bounded tick-bound `set_velocity` inputs. A second moving-obstacle entity receives modeled native velocity inputs. No `teleport` inputs are emitted. Every tick is recorded with the requested command reason, sampled velocity, native contacts, obstacle positions, and an independent relative line-segment sweep of the rover against each obstacle. Native deterministic replay and (when the episode crosses its configured midpoint) snapshot-restoration equivalence are checked against the actual final snapshot digest.

This **does not** model wheels, tire friction, steering dynamics, physical robot actuation, SLAM, independent localization or certified stop behavior. The `known-corridor` controller follows *preselected waypoints* with a synthetic freshness-aware hold. `blind` serves as a deliberately weaker baseline; neither controller is advertised as robust autonomy. The independent sweep is a simple mathematical oracle over two tick endpoints, not a continuous collision-physics solver or guaranteed safety system. The sampled synthetic sensor can fail; queued velocity commands may still move after a hold request.

Run after dependencies are installed:

```sh
node --import tsx --test systemia/world-engine/sim-to-real/native-motion-rc04.test.mjs
node --import tsx systemia/world-engine/sim-to-real/native-motion-rc04.mjs --seeds 4 --out /tmp/evercraft-native-rc04.json
```

A valid `evercraft.sim-to-real.native-motion.rc04` proof includes full-tick frames, exactly ordered native input ledger, known simulated provenance, terminal outcome (arrived / collision / geofence / timeout), native snapshot/replay digests, and a SHA-256 integrity check. Digests are not signatures. For genuine hardware qualification, require a separate physics-model calibration, independent safety controller, command expiration, e-stop, hardware-in-the-loop tests, and separately sourced physical telemetry before considering actuator integration.

**Release:** Review-only draft PR; no production merge, external job dispatch or robot commands.


## RC05: held-out local reactive navigation with explicit uncertainty (modeled only)

RC05 does not modify the canonical World Engine core. It introduces an isolated control/sensor lab that runs a simulated sphere rover through **native `EvercraftWorldRuntime` tick-bound velocity inputs**, plus a synthetic bounded-range proximity sensor, simple angular occlusion, noisy modeled location and heading, deterministic steering candidate search, and fail-closed *requests* when the sensor is stale, localization uncertainty is too high, a geofence margin is threatened, or the local collision/braking budget is inadequate.

RC05 controller inputs include only anonymous range/bearing/radius detections, noisy pose, a goal, geofence bounds and modeled dynamics. The world obstacle coordinates are used by the synthetic **sensor adapter** and verification oracle, not exposed to the controller. This is not SLAM, a learned planner, a real proximity sensor, or a validated robotics stack. The command queue, delay, modeled acceleration/braking and native sphere collision model can defeat a hold request.

The held-out comparison uses matched course seeds 41–48 (outside the earlier 1–4 demonstration fixtures), comparing RC05 reactive decisions against RC04's known-corridor baseline. It is a **small modeled comparison with different controller/sensor contracts**; no success rate should be generalized to different courses, physical hardware or safety guarantees.

```sh
node --test systemia/world-engine/sim-to-real/controller-rc05.test.mjs
node --import tsx --test systemia/world-engine/sim-to-real/native-reactive-rc05.test.mjs
node --import tsx systemia/world-engine/sim-to-real/native-reactive-rc05.mjs --first-seed 41 --seeds 8 --out /tmp/evercraft-native-rc05.json
```

Open `RC05_replay_viewer.html` in any local modern browser, and choose the generated benchmark JSON to replay **all recorded ticks** for each seed with native and independently swept contacts. The CI workflow uploads the benchmark JSON as `sim-to-real-rc05-modeled` with seven-day retention.

Evidence labels remain `modeled`. SHA-256 digests establish content integrity, not independent attestation. No physical sensors, actuators, external authority or production deployment have been enabled. Independent physical hazard review, real localization, continuously validated stopping distance and emergency-stop/watchdog controls are separate prerequisites for real-robot work.


## RC05A: progress-gated deadlock experiment, opt-in

RC05's initial 8-seed modeled heldout (41–48) passed CI with **2 arrivals, 0 collisions, and 6 timeouts**. The RC04 known-corridor comparison had **5 arrivals, 2 collisions and 1 timeout**. Frame-level inspection found a deadlock: RC05 sometimes reports the reactive heading reason while commanding 0 m/s at obstacle approaches for hundreds of ticks.

RC05A is a **separate opt-in controller**. The baseline remains the default. Only when a nominal reactive heading produces less than 0.10 m/s does the experimental controller search for feasible alternate headings, apply a capped-speed gate, and return an explicit progress-detour command. Stale-sensor, uncertainty, geofence, goal and genuine hazard holds from the original controller are never overridden. If no viable heading exists, RC05A requests a zero-speed hold. This can trade progress for additional modeled collision risk and is **not** safety-certified recovery.

The isolated CI job performs paired native World Engine runs for seeds **41–48** (prior observations) and **49–56** (new evaluation cohort). Every outcome (arrival, collision, geofence, timeout) is retained. Report digests and per-seed episode digests provide integrity evidence, not external attestation. New collisions or a failed trial must remain visible. Do not promote this variant without inspecting both cohorts.

Run from the repository root after installing its dependencies:

    node --test systemia/world-engine/sim-to-real/controller-rc05-progress.test.mjs
    node --import tsx --test systemia/world-engine/sim-to-real/progress-trial-rc05.test.mjs
    node --import tsx systemia/world-engine/sim-to-real/progress-trial-rc05.mjs --first-seed 49 --seeds 8 --out /tmp/evercraft-rc05a-49-56.json

**No hardware or production execution is authorized.**


## RC05B: observed-path shield and explicit A/B/C review (experimental)

RC05A can escape its zero-speed deadlock but developed *two collisions* in prior evaluation seeds 51 and 56. RC05B keeps RC05A opt-in and adds a second independent **modeled observation-based detour filter**: it checks current motion, requested detour, bounded modeled braking/command delay, anonymous visible sensor obstacles, and a conservative geofence inset. It caps approved detour speed; unsafe or unclear detours are requested holds. Stale scans, localization uncertainty, and original safety holds remain unchanged.

**Important limits:** The shield does NOT see hidden objects, cannot verify actual obstacle speed, assumes modeled braking and modeled sensor geometry, and cannot guarantee an immediate stop while delayed commands remain queued. It does not confer robot safety or hardware authority. Native dynamics still use simple spherical proxy bodies, not a calibrated rover.

Run:
```sh
node --test systemia/world-engine/sim-to-real/controller-rc05-shield.test.mjs
node --import tsx --test systemia/world-engine/sim-to-real/shield-trial-rc05b.test.mjs
node --import tsx systemia/world-engine/sim-to-real/shield-trial-rc05b.mjs --first-seed 49 --seeds 8
node --import tsx systemia/world-engine/sim-to-real/shield-trial-rc05b.mjs --first-seed 57 --seeds 8
```

`runShieldTrial` compares unchanged default RC05, opt-in RC05A, and opt-in RC05B, recording failure status, contact IDs, provenance, per-seed digests and a review flag. **A green CI result only establishes that evidence and tests were produced.** The `reviewEligible` result is evidence-only and is never production release approval; it must remain false if new modeled collisions or geofence exits are seen relative to the default, or if arrivals regress. Repeating known cohorts is a regression check, **not** held-out generalization evidence. Seeds 57–64 constitute one small new modeled evaluation batch only.

The source and GitHub workflow are authored for PR review only. No production merge, autonomous device, e-stop, physical sensor, deployment, or robot actuator access.


## RC05D: opt-in anonymous motion-watch experiment

**Motivation:** RC05C's synthetic moving-obstacle collision at seed 51 occurred during a normal `reactive_heading` command, well after the experimental escape maneuver finished. The RC05C escape envelope checks escape vectors, not every ordinary cruising command.

RC05D adds a separate **synthetic anonymous motion tracker** that compares noisy range/bearing returns across time using estimated rover poses; no true obstacle IDs, global obstacle coordinates, or moving-object simulation parameters are passed to the controller. The tracker considers measurements separated by 3–12 ticks, caps inferred speeds, and emits a modeled constant-velocity relative-motion warning against proposed commands over up to 2.8 seconds. A warning requests a `moving_hazard_hold` through the **same delayed velocity-command queue** used in prior versions. This is not immediate braking, an independent watchdog, an emergency stop, or a guarantee of collision prevention.

- New opt-in controller mode: `observed-motion-watch`. The `baseline` default is unchanged.
- New source: `controller-rc05-motion-watch.mjs`, with isolated geometry tests.
- Native integration: `native-reactive-rc05.mjs` records per-tick motion-watch diagnostics and continues to use real `EvercraftWorldRuntime` dynamic velocity inputs, no teleports.
- New `motion-watch-trial-rc05d.mjs` compares baseline, RC05C, and RC05D on the same modeled course seeds and retains failure-contact IDs and last-16-tick diagnostics.
- GitHub CI checks regression cohort 49–56 including the seed 51 moving-obstacle collision, plus fresh synthetic cohort 73–80. The **same world-generator family** is used; calling it a general held-out physics benchmark would be misleading.
- Review eligibility requires actual observed progress, meaningful arrival improvement, and no new collision or geofence regression. Research review never authorizes production or hardware action.

```sh
node --test systemia/world-engine/sim-to-real/controller-rc05-motion-watch.test.mjs
node --import tsx --test systemia/world-engine/sim-to-real/motion-watch-trial-rc05d.test.mjs
node --import tsx systemia/world-engine/sim-to-real/motion-watch-trial-rc05d.mjs --first-seed 49 --seeds 8
```

**Known limits:** matched synthetic observations are noisy and may associate the wrong anonymous object; occlusion can hide hazards entirely; constant-velocity prediction omits acceleration; request-to-motion latency remains; no calibrated brakes, true sensors, SLAM, wheel model, hardware adapter, live robot, safety certification, or production promotion. A hazard hold is **not** an emergency stop. Outcomes and failed runs must remain in evidence.


## RC05E: Persistent modeled hazard latch and simulated queue cancellation

The RC05D crossing-hazard warning could alternate with ordinary forward commands while previously queued requests remained. RC05E adds an **opt-in** `observed-motion-latched` policy and an explicit software command-queue cancellation experiment.

- Persist a moving-hazard latch between ticks and during missing/stale sensor observations. Never assume one clear reading proves the crossing hazard has disappeared.
- Inspect already pending modeled commands for predicted crossing risk. During a latch, clear pending **simulated software** commands and apply a zero desired velocity using the native engine's existing rate-limited braking path. This is **not** a real robot cancellation API, emergency stop, or guarantee of immediate rest.
- Require five consecutive fresh, nonhazardous observations after at least six latch ticks, with modeled rover speed below 0.09m/s, before allowing a capped 0.24m/s recovery phase.
- Keep original `baseline` behavior unchanged. RC05E's opt-in policy inherits synthetic geometry, anonymous motion-tracking limitations and uncertainty; its track-matching may miss or mischaracterize crossing objects.
- Collect a complete native input ledger, tick-by-tick latch diagnostics, count canceled modeled commands and preserve failure windows and SHA-256 receipts.
- Compare default RC05, RC05C, RC05D and RC05E on **49–56** (including known collision seeds 51/56) and **81–88** (new seeds but **same** synthetic course generator). An evidence-only review requires net arrival improvement of at least 25% of the cohort, actual detour/recovery movement, and no new collision/geofence regressions.
- Full integration and results run on GitHub Actions. **Do not infer a robotics safety certification, hardware readiness, or release authorization from successful test execution.**

Source: `controller-rc05-latched-watch.mjs`, `latch-trial-rc05e.mjs` and respective tests. Release remains review-only draft.
