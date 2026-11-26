# Physical Systems and Frontier Engineering | recovery crosswalk
_Last source-level review: 2026-11-16. [Founder directive and canonical recovery issue #2213](https://github.com/jgaethle10/forge-operator/issues/2213)._

This is an evidence index, not a new mission ledger, admitted worker roster, production schedule, or release record. Actual mission authority belongs to the existing Systemia Mission Ledger and Portfolio Sentinel. Existing liveness incident: [#1426](https://github.com/jgaethle10/forge-operator/issues/1426). Distinguish source, CI, independent physical observation, and outcome.

| Domain | Current independently identifiable artifact | Grounded state | Next assurance gate |
| --- | --- | --- | --- |
| Aviation safety | [Flight Sentinel PR #1882](https://github.com/jgaethle10/forge-operator/pull/1882) | Open draft; synthetic v0.6 reference, local suite claimed in PR; full local kit not all mirrored | Reconcile source/test provenance, CI; independent common-mode / fallback review; named offline 6-DOF dynamics |
| Infrastructure safety, distinct lane | [Infrastructure Guardian #2112](https://github.com/jgaethle10/forge-operator/pull/2112) | Open draft; offline synthetic dependency failures | Preserve two harmful counterexamples; no live isolation |
| Robotics and EarthWorks | [Merged #934](https://github.com/jgaethle10/forge-operator/pull/934), [draft #1268](https://github.com/jgaethle10/forge-operator/pull/1268), [physical bench #907](https://github.com/jgaethle10/forge-operator/issues/907) | Merged fleet simulator; separate embodied AI simulation draft; physical bench spec, **not** physical run | Revalidate source CI and no-motor controller boundary; ROS2/Gazebo simulation; STOP ALL independent bench gates |
| Aircraft/3D rendering | [Visual Engine flyover #1844](https://github.com/jgaethle10/forge-operator/pull/1844) | Open draft; geometry and render-plan fixture, not independently verified pixels | Native WebGPU frame capture and visual QA |
| Airborne network | [Air Relay v2 #306](https://github.com/jgaethle10/forge-operator/pull/306), [Saban ambient fabric #466](https://github.com/jgaethle10/forge-operator/issues/466) | Source work and public observation/admission contracts, physical radio unverified | Offline contact-window, packet-loss, consent and no-flight-control tests |
| Space and prize qualification | [Innovation intake #2121](https://github.com/jgaethle10/forge-operator/pull/2121) | Open draft; opportunity research only | Original eligibility/rules verification; lunar comms outage simulation; no registration/submission |

## Historical candidates awaiting canonical source match
Evercraft Physical Systems Engineering Canon, Aero-01-SIM, the Roadster force-budget/6-DOF study, the high-speed collision-aware quad, PX4 SITL/ROS2/Gazebo workflows, lunar resilience and EarthOS Drone Cloud. Their past discussion is **not** proof of present repo implementation. Recover and classify as sourced implementation / CI-proof / simulation / proposal / archival only, with exact paths and hashes.

## Minimal liveness research candidate
`systemia/organism/mission-continuity-readonly.mjs` is deliberately **not wired** into the live Portfolio Sentinel or resident heartbeat. It accepts a caller-provided **normalized** snapshot of already-admitted missions; flags missing/future/stale receipts, overdue/absent next actions, missing owner, and explicit holds; redacts private identities. It does not read private ledger locations or dispatch work. A fresh document or scheduled job is not an execution receipt.

Proof (source-level candidate, run in a Node environment): `node systemia/organism/mission-continuity-readonly.proof.mjs`.

Next steps before integration: locate the authoritative Systemia admitted-mission schema and stable read-only export; establish visibility rules and privacy tests; attach this checker only as a **non-authoritative** observation in the existing Portfolio Sentinel; independent reviewer then signs off on source/freshness behavior. Do not turn a missing private mission into a public log. Explicitly preserve revenue priorities and no Base44/third-party host reliance.
