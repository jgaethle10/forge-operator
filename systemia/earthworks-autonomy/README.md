# Evercraft EarthWorks Autonomy

Evercraft EarthWorks Autonomy is an owned research and product lane for coordinated autonomous earthmoving fleets. The first proof is intentionally small: a deterministic toy jobsite where an excavator, haul trucks, and a front loader cooperate under one fleet coordinator, one world state, one safety kernel, and one receipt stream.

## What we can accurately say today

**Evercraft builds autonomous fleet coordination, digital-twin, dispatch, safety-envelope, telemetry, and device-bridge technology for earthmoving systems.**

Version 1 is a simulation and control-contract proof. It is not a claim that Evercraft currently sells unsupervised production autonomy for full-size heavy equipment. Physical deployment must move through controlled hardware stages, OEM-compatible interfaces, explicit safety engineering, and supervised field pilots.

## Architecture

1. **Systemia mission layer**: defines the job, production target, constraints, equipment roster, and operating policy.
2. **World Engine / digital twin**: owns site entities, zones, machine state, routes, material state, and deterministic replay.
3. **AI fleet planner**: proposes dispatch and sequencing decisions such as which truck receives the next load slot.
4. **Deterministic safety kernel**: validates every proposed actuation against speed limits, geofences, exclusive zones, holds, heartbeats, and stop state. AI recommendations never bypass this layer.
5. **Equipment adapter layer**: translates safe high-level commands into a specific simulator, RC platform, prototype controller, or approved OEM/retrofit interface.
6. **Yard device trust + telemetry**: enrollment, machine identity, heartbeat, receipts, command lineage, degraded-communications behavior, and operator takeover.

## Toy Yard 001

The browser demo models:

- `EX-01` excavator at the dig face
- `HT-01`, `HT-02`, `HT-03` haul trucks
- `FL-01` front loader at the stockpile
- one exclusive excavator load slot
- queue-aware AI dispatch
- loading, hauling, dumping, return, and stockpile processing
- live tons moved, tons processed, cycles, queue state, and safety interventions
- fail-closed STOP ALL
- unsafe-command injection to demonstrate containment

The controller is deterministic by default so any run can be replayed and compared. A planner adapter can later replace the default queue-age heuristic with Raven/Systemia intelligence without replacing the safety kernel.

## Hardware ladder

The physical program should advance by evidence, not bravado:

- **Stage A: software twin** - deterministic multi-machine simulation and failure injection.
- **Stage B: toy/RC yard** - camera/LiDAR or UWB-assisted mini excavator, trucks, and loader on a bounded tabletop/yard course with hard E-stop.
- **Stage C: scaled prototype** - higher-mass electric platforms with redundant localization, obstacle detection, independent braking/kill, and supervised autonomy.
- **Stage D: closed-course equipment pilot** - instrumented real machine, no public traffic, no mixed human work zone, OEM-compatible controls, remote takeover, and formal hazard analysis.
- **Stage E: production candidate** - only after independent safety validation, regulatory/insurance review, reliability targets, cybersecurity hardening, and site-specific operating procedures.

## Non-negotiable safety rules

- No autonomous actuation outside a declared geofence.
- No command above the machine-specific speed/actuation envelope.
- Exclusive loading/dumping zones are mutex resources.
- Loss of heartbeat or localization quality fails to a safe state.
- E-stop remains independent of the AI planning layer.
- Physical adapters must preserve OEM safety systems rather than bypass them.
- Human operator takeover has priority over autonomy.
- Every command and safety intervention is receipted with machine identity and world-state context.

## Run the proof

```bash
node --test systemia/earthworks-autonomy/fleet-controller.test.mjs
```

The visual demo is in `public/apps/earthworks-autonomy/index.html`.
