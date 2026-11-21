# Evercraft Flight Sentinel | Research Project (v0.2)

**Status:** ACTIVE RESEARCH / SIMULATION ONLY. No connection to any real aircraft, flight-control system, radio, telemetry feed, or actuators. This branch establishes the canonical research charter; it does not contain an airworthy product.

## Mission

Build independent runtime-assurance tooling for AI-enabled aviation, with an eventual focus on detecting **unsafe behavior from ordinary faults or malicious interference**. The system must make safety decisions without needing to establish whether a malicious actor exists. The April 2026 YFQ-42A incident was publicly attributed to an autopilot weight/center-of-gravity miscalculation, **not a confirmed attack**.

## Architecture

AI controller (proposals only) → independent evidence validation → deterministic guardian → symbolic ALLOW / CAUTION / HOLD_PREFLIGHT / REQUEST_FALLBACK / REJECT_UNTRUSTED. An eventual vehicle-specific fallback must be separately validated. **Systemia may orchestrate tests, reports and reviews but may never be in the airborne control loop.**

## v0.2 offline research evidence (local kit)

- 14 invented scenarios, including unsafe command, incorrect load/CG, navigation source disagreement, tampered-manifest *claim*, replay, stale state, source duplication and monitor failure.
- 21 unit tests passing, plus 1,000 deterministic fuzz iterations.
- Deny on nonfinite/ill-typed inputs, monotonic replay checks, and a latched interlock that does not self-reset on the next normal-looking sample.
- Precomputed, browser-readable dashboard and SHA-256-linked event summaries. The chain is **not** a signed or tamper-proof log.

**Important:** These results were measured against toy inputs. Thresholds and attestation flags are fictional; there is no real cryptographic verification, sensor independence, airframe-specific envelope, flight dynamics model, actuator path, or proven controller handoff. The complete tested v0.2 code/package remains a local research artifact and is not yet mirrored into this repository. Do not present it as deployed or certified.

## Engineering gates

1. G0: Preserve isolation. No real aircraft interfaces or network control outputs. Type validation and trace reproducibility.
2. G1: Sandbox a specific *virtual* aircraft and publish traceable requirements and negative tests. Fault-inject off-line flight dynamics.
3. G2: Quantify temporal detection, false triggers, missed hazards, uncertainty, and common-mode failure in simulations.
4. G3: Obtain independent qualified safety/cybersecurity review, and plan the relevant aviation assurance process before any hardware proposal.

## Mandatory safety questions

- How is the guardian truly independent of the AI controller and sensor supply chain?
- Are two sources independent, or just two outputs from a common faulty component?
- Can a seemingly acceptable series of individually safe commands create a dangerous trajectory?
- Could a proposed control handoff be more dangerous than the detected fault?
- What happens when monitor power, timing, memory or authority arbitration fails?
- Which engineer, pilot/operator and regulator approves the vehicle-specific safety case?

## References

- FAA AI/ML technical discipline: https://www.faa.gov/aircraft/air_cert/step/disciplines/artificial_intelligence
- FAA AI Safety Assurance roadmap: https://www.faa.gov/aircraft/air_cert/step/roadmap_for_AI_safety_assurance
- NASA runtime assurance study: https://ntrs.nasa.gov/citations/20240007986
- GA-ASI YFQ-42A incident follow-up: https://www.ga-asi.com/yfq-42a-returns-to-flight-testing

**Commercial scope for now:** offline validation and evidence-generation tools for robotics/drone research teams. No claims of live protection, guaranteed prevention, or flightworthiness.