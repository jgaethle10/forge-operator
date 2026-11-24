# Evercraft Events: existing Opportunity Fabric adapter

Canonical tracking: [Evercraft Events #2547](https://github.com/jgaethle10/forge-operator/issues/2547); flagship preservation project: [Tillamook Hangar B REIGNITE #2546](https://github.com/jgaethle10/forge-operator/issues/2546).

This is a reusable **source-only event feasibility planner**, not a separate SaaS app, an event booking service, an authorized production crew, a live venue, or a replacement for EveryStage/EventWave. It links potential event work to the existing Demand and Opportunity Fabric relationship/work-package concepts without creating a second CRM.

## Existing systems to reuse

1. Demand Desk owns the opportunity, stage, current next action and source follow-up (human-entered until separately authenticated sync is proven).
2. Interaction Ledger + Passport owns communication preflight and exact-message outbound authority; this planner never sends a message.
3. Opportunity Fabric handles bounded potential partner work packages, sourcing and actual acceptance under its separate rights/identity rules.
4. EveryStage is the intended run-of-show and live-event operations surface; current public registry alone proves discovery intents, not a verified active operational backend.
5. EventWave is the intended source-reviewed public event discovery/promotion surface. No publishing while venue/event approval remains unverified.
6. Systemia/Saban may review proposed work after actual authenticated admission, never simply because a GitHub issue or work packet exists.

## Software contract

`assessEventFeasibility({ opportunity_id, scenario, evidence, features })` is pure and deterministic for identical inputs, except that it never creates timestamps or idempotency identifiers. It returns a review packet: required gates, evidence state and open work. Four scenarios are supported:

- `indoor_headphone`: constrained museum-approved headphone experience, pending structural/crowd/egress review
- `outdoor_separate`: separately supported outdoor performance and quiet indoor heritage component, pending sound propagation, weather, airfield and site suitability
- `heritage_only`: quiet exhibit and filmed heritage fundraiser, still pending occupancy/engineering constraints
- `hybrid_silent_zone`: independent outdoor music stage plus a small, **museum-approved** headphone-based dance zone inside Hangar B and quiet heritage activity elsewhere. This is not a soundproof dome and does not establish a safe visitor count, egress plan, or reduced floor vibration.

`eventWorkPackages(packet)` maps the requirements into *unassigned, unauthorized* scoped package candidates using stable IDs `opportunity_id:gate_id`. This allows a future explicit adapter into the already existing protected multi-party Opportunity Fabric after identity, agreement, rights, sourcing and Passport gates are independently met. It does NOT create those records in production.

`evidence` is keyed by gate ID with a private, authorized `source_ref`, an `observed_at` timestamp, and optional `finding`. Missing entries are `missing`; supplied references are `submitted_unverified`; an unsafe/declined/denied finding is a **stop for qualified review**. A self-asserted `approved` finding is deliberately never authoritative. Avoid personal identifiers, email addresses, client documents or arbitrary note bodies in GitHub.

Exceptional effects like open flame, skyward laser beams, drones or attachments to historic fabric add their own mandatory review requirement and are **not included in the default concept**.

### Hangar B special concept: THE SILENT HANGAR

The indoor music is delivered over individually controlled headphones, not high-power amplified speakers or subwoofers. A freestanding visual enclosure/dome is **optional** and adds the `freestanding_visual_dome` feature gate. Do not promise soundproofing, measured attenuation, isolation or a safe event footprint without qualified site-specific work. A smaller audience only reduces risk if site loads, pathways and vibration transmission actually support that conclusion.

**Separate engineering dependencies:**

- **Airborne sound:** headphones can substantially reduce amplified airborne music indoors; there will still be conversation, singing, footfalls, visual equipment hum, outdoor main-stage transmission and local sound spill.
- **Structure-borne forces:** rhythmic dancing/jumping/stamping, crowd density, floor/slab condition, resonance, ground/foundation transmission, temporary structure anchors and independent cabling must be assessed. No inference that the slab is independent of timber arch foundations.
- **Hearing and emergency safety:** volume-limited headphone system with suitable user guidance, independently tested distribution/interference/latency, an immediate mute-and-message/broadcast interruption mechanism backed by visible alarm cues, accessible communication for those not wearing headphones, and headcount/flow monitoring. WHO recommends device sound exposure features and volume limits: https://www.who.int/news-room/questions-and-answers/item/deafness-and-hearing-loss-safe-listening/
- **Museum activities around dance zone:** quiet approved aircraft/history exhibits, preservation donor display, family archive/story collection, art and educational booths. Keep exhibits, restricted roof-repair areas, emergency routes, visitor circulation and preservation-sensitive zones clear.
- **Optional visual dome:** only a free-standing temporary enclosure if approved by the museum, event structural engineer and fire authority for occupancy, ventilation, temporary construction material/flame resistance, egress and emergency communication; a fabric/inflatable dome is **not** effective soundproofing by default.
- **Outdoors:** only approved stage/food vendor footprint and weather/ground/power, airport/aviation lighting, outdoor noise/vibration transmission. Exterior sound cannot be assumed disconnected from historic structure.
- **Participant experience:** idea of multiple music channels in one headphone zone is a concept, not vendor equipment verification. No ticketing, capacity, schedule or equipment purchase.

**Authoritative feasibility sequence:** museum-authorized zones and current repair drawings → historic structural PE evaluation of indoor dance loads and external source coupling → acoustical consultant outdoor + indoor survey → fire/AHJ occupancy and temporary structures → headphone safety/interruption demonstration → qualified production review and contracts → written approvals. Stop or redesign if any professional review excludes the proposed usage.

Treat the above as a *concept review packet*, not a certified engineering analysis, vendor contract or legally approved event.


No path in this source module grants venue approval, publishes a public event, dispatches an agent, contacts a partner, starts a test, collects charitable donations or opens ticketing. Qualified on-site engineering and site-specific authorizations remain external gates.

## Read-only Demand adapter (present in source)

`assessEventFromDemandQueue(queue, opportunityId, options)` consumes the exact existing `GET /api/systemia/queue` envelope, requiring `schema: 1`, `kind: evercraft.demand-desk.queue`, integer revision and exactly one currently open opportunity ID. It passes that ID to the same event feasibility evaluator. It records a *claimed* Demand stage and verification flag for context but **never translates "Replied", "Won", "verified" or any sales classification into venue or regulatory approval**. It refuses missing, duplicate and closed opportunity records. It neither mutates Demand's workspace nor fetches a queue by itself; an authorized owned runtime supplies the queue and establishes its origin independently.

## Testing and scope

```sh
node --test systemia/opportunity-fabric/event-coordination.test.mjs
```

The test suite covers all three scenarios, missing source documents, contradictory unsafe conditions, exceptional effects, deterministic work packets and deliberate fail-closed results even when a caller claims everything has been approved.

**Current readiness:** owned-source review candidate, not deployed or authorized. Current flagship evidence includes museum reply and contact receipt (private), published historic context and initial preservation research, but no actual current structural measurements, site-use authorization, engineer's signature, promoter contract or public event permit.

## Next engineering integration

- Connect the **already-written read-only Demand queue adapter** to an authorized owned private poller with request provenance and revision controls; source-code adapter is not an actual running poller. No public prospect metadata or brittle scraping.
- Owner review/approval UI inside the existing Demand/EveryStage experience; validate recipient authority before exposing private notes.
- Privileged separate evidence verifier, with actual signature/issuer/provenance checks, is required before any action-capable workflow. **Do not alter the constant deny flags in this module as a shortcut.**
- Replace the static source-only work packets with accepted Opportunity Fabric sourcing/formation only after appropriate human approval and authenticated runtime receipt.
- For Tillamook: obtain museum-authorized condition/repair documentation and assemble an engineering consultant scope before estimating sound or crowd capacity.
