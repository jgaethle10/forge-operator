# ANNISTON
## Aerospace, Aerodynamics & Robotics (AAAR)

**Evercraft LLC engineering division · AAAR Mission Control 0.2**

Anniston is an evidence-led, mobile-responsive program operations site for aerospace, aerodynamic engineering, aircraft safety, UAV/drone systems, robotics, physical autonomy and space research. It is a component of the broader **Evercraft OS**, with **GitHub as the canonical record** and **Systemia as the intended orchestrator**.

### What is implemented in this release

- Custom Anniston identity, architectural flight schematic, responsive dashboard and navigation.
- Program registry with proposed / recovery / active / dormant / resurrected lifecycle filters; search by domain, confidence and text.
- Edit and register programs; build maturity, blockers, source confidence, next step and review cadence are independent fields.
- Evidence vault with direct GitHub source links, receipt notes and independent-reproduction status kept distinct from artifact existence.
- Simulation & QA workbench with current observations, next test gate and safety boundaries.
- Commercial pathway tracking with buyer-validation distinctions; no unverified revenue is implied.
- Side-by-side priority comparison and documented heuristic for triage, not safety certification.
- Review queue, local review logging, cadence rescheduling and program attention ranking.
- Local idempotent "Push next action" creating an exportable Systemia *handoff request*, **not** a live command.
- Import/export of JSON data; compatibility with legacy `evercraft.anniston-aaar.v1` and `evercraft.flightworks.v1` registry imports.
- Browser-local persistence, with no third-party frameworks, fonts, image CDNs, analytics, APIs or runtimes.

### Source-backed engineering records in seed registry

1. **Evercraft Network Air Relay**: `systemia/network/AIR-RELAY.md` and its proof contract, with software-only evidence boundaries.
2. **Evercraft Network Aircraft Relay**: `systemia/network/AIRCRAFT-RELAY.md`, `aircraft-relay-planner.mjs`, and `aircraft-relay-proof.mjs`; planned/verified contact separation and explicit civilian aircraft consent.

Both seed records mean **source files were independently located in the GitHub repository**. The proof scripts have **not been rerun for this AAAR interface build**, so AAAR does not claim accepted execution receipts, deployed UAV flight capability, airworthiness, navigation, radio approvals, physical operation or commercial contracts.

The aircraft-safety, lunar-habitat, robotics, and UAV-simulator entries are explicitly **unverified research/recovery leads**, not fabricated engineering milestones.

### Preview / run locally

Open `index.html` or serve its directory from an Evercraft-owned host. The site has no runtime dependencies. Because preview storage is local to the current browser origin, export changes when moving between environments.

The delivered `anniston-aaar-standalone.html` is a standalone version with CSS and JavaScript embedded for quick review. The structured `index.html` + `assets/` version is intended for owned deployment and future backend integration.

### Owned integration needed before production

1. Commit these files in the canonical repository under `systemia/anniston-aaar/site/` or another approved AAAR path.
2. Deploy behind an authenticated private route on Evercraft-operated compute / edge. Do not use Base44, Wix or any third-party site/application runtime.
3. Add Systemia API endpoints for versioned program CRUD, evidence receipts, audit journal, role-based approval and conflict-safe sync. GitHub remains source of truth.
4. Replace local work-order handoff with an authenticated, idempotent Systemia request carrying job ID, explicit human review gate and execution receipt. No direct actuation or aircraft control from AAAR.
5. Connect review schedules and overdue checks to Kaidance/Systemia heartbeat; never claim reminders are live before verified scheduler receipts exist.
6. Add a signed release manifest, CI regression tests and end-to-end integration/authorization tests before private deployment.

### Safety and evidence policy

A GitHub reference is evidence of a file, not of a successful experiment or physical system. A successful simulation is not field approval. Operational flight, robotic actuation, radio use or aviation certification require independent regulatory, engineering, operator and hardware evidence. AAAR exposes no flight-control commands. Buyer and revenue fields record hypotheses until independently validated.

### Smoke tests

`python tests/smoke.py` (requires Python Playwright and a Chromium browser for development tests only). Tests assert desktop registry rendering, lifecycle filtering, local work-order idempotency, comparison views, export, and 390px mobile navigation.

**Tracked engineering issue:** https://github.com/jgaethle10/forge-operator/issues/2285