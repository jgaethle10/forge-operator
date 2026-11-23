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

`assessEventFeasibility({ opportunity_id, scenario, evidence, features })` is pure and deterministic for identical inputs, except that it never creates timestamps or idempotency identifiers. It returns a review packet: required gates, evidence state and open work. Three scenarios are supported:

- `indoor_headphone`: constrained museum-approved headphone experience, pending structural/crowd/egress review
- `outdoor_separate`: separately supported outdoor performance and quiet indoor heritage component, pending sound propagation, weather, airfield and site suitability
- `heritage_only`: quiet exhibit and filmed heritage fundraiser, still pending occupancy/engineering constraints

`eventWorkPackages(packet)` maps the requirements into *unassigned, unauthorized* scoped package candidates using stable IDs `opportunity_id:gate_id`. This allows a future explicit adapter into the already existing protected multi-party Opportunity Fabric after identity, agreement, rights, sourcing and Passport gates are independently met. It does NOT create those records in production.

`evidence` is keyed by gate ID with a private, authorized `source_ref`, an `observed_at` timestamp, and optional `finding`. Missing entries are `missing`; supplied references are `submitted_unverified`; an unsafe/declined/denied finding is a **stop for qualified review**. A self-asserted `approved` finding is deliberately never authoritative. Avoid personal identifiers, email addresses, client documents or arbitrary note bodies in GitHub.

Exceptional effects like open flame, skyward laser beams, drones or attachments to historic fabric add their own mandatory review requirement and are **not included in the default concept**.

No path in this source module grants venue approval, publishes a public event, dispatches an agent, contacts a partner, starts a test, collects charitable donations or opens ticketing. Qualified on-site engineering and site-specific authorizations remain external gates.

## Testing and scope

```sh
node --test systemia/opportunity-fabric/event-coordination.test.mjs
```

The test suite covers all three scenarios, missing source documents, contradictory unsafe conditions, exceptional effects, deterministic work packets and deliberate fail-closed results even when a caller claims everything has been approved.

**Current readiness:** owned-source review candidate, not deployed or authorized. Current flagship evidence includes museum reply and contact receipt (private), published historic context and initial preservation research, but no actual current structural measurements, site-use authorization, engineer's signature, promoter contract or public event permit.

## Next engineering integration

- Authorized private owner import from the existing Demand Desk `/api/systemia/queue` with provenance and revision; no public prospect metadata or brittle scraping.
- Owner review/approval UI inside the existing Demand/EveryStage experience; validate recipient authority before exposing private notes.
- Privileged separate evidence verifier, with actual signature/issuer/provenance checks, is required before any action-capable workflow. **Do not alter the constant deny flags in this module as a shortcut.**
- Replace the static source-only work packets with accepted Opportunity Fabric sourcing/formation only after appropriate human approval and authenticated runtime receipt.
- For Tillamook: obtain museum-authorized condition/repair documentation and assemble an engineering consultant scope before estimating sound or crowd capacity.
