# Toy Yard 002: physical fleet proof

Toy Yard 002 is the first physical EarthWorks fleet. It should be visually obvious, portable and deliberately safer than jumping directly to full-size iron.

## Fleet

Minimum useful fleet:
- one RC excavator with controllable boom/stick/bucket/swing/travel,
- two RC haul trucks with controllable steering/throttle/dump,
- one RC front loader or dozer,
- one independent fleet stop controller.

## Site

A bounded miniature earthworks course with:
- dig/loading face,
- exclusive load zone,
- truck queue,
- outbound haul route,
- dump zone,
- return route,
- stockpile,
- physical boundary markers,
- overhead camera or other global localization reference.

The course should use lightweight material suitable for repeatable loading without creating hazardous stored energy.

## Control topology

EarthWorks Site Contract
→ fleet planner
→ deterministic safety kernel
→ machine adapter
→ local machine controller

Telemetry returns through:
machine
→ local controller
→ machine identity + heartbeat
→ Yard telemetry bridge
→ EarthWorks world state
→ receipt stream.

## Required physical safeguards

- independent hard fleet stop that does not depend on the AI planner,
- local machine stop on heartbeat loss,
- bounded speed and actuator envelopes,
- physical operating boundary,
- no person inside the active miniature operating zone,
- visible machine authority state,
- explicit manual takeover,
- adapter watchdog,
- replayable command receipts.

## Acceptance tests

1. Trucks queue without entering the excavator zone together.
2. Excavator loads the assigned truck only.
3. Loaded truck travels to dump zone, dumps and returns.
4. Second truck fills the vacated loading slot.
5. Loader manages the stockpile without entering a truck exclusion zone.
6. Loss of fleet heartbeat stops all affected machines.
7. Invalid speed/actuation request is rejected locally.
8. Operator STOP ALL halts every machine independent of planner state.
9. Every physical command can be traced to a mission, planner decision, safety decision and adapter receipt.
10. A complete material loop can be replayed in the software twin from the receipts.

## Demonstration value

The physical miniature is not merely a toy. It is a portable systems-integration bench for perception, localization, dispatch, traffic management, machine adapters, safety enforcement, failure injection and human takeover.

If a physical behavior cannot survive Toy Yard 002, it has no business graduating to heavier equipment.
