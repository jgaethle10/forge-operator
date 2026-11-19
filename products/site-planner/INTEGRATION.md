# Evercraft Site Planner | Integration Contract v1

Status: isolated engineering branch; **not deployed**. This document records the intended contract, not a claim that Systemia or the existing commercial report flow is already wired.

## Ownership and runtime
- Canonical repository: `jgaethle10/forge-operator`
- Evercraft-owned Python/SQLite application and static browser UI, no Base44 runtime or third-party site builder
- Deployment remains private until authentication, uploads, authorization and owner approval are verified
- Systemia is the future workflow orchestrator; plan engineering is an actual reviewed human/engineering queue, not auto-certified designs

## Object chain
`site_id -> scenario_id -> immutable report_id -> order_id -> returned plan_id`

A plan **must** derive its report_id from the persisted order record, not from client input. Orders may only reference scenarios from their own site. Returned plans may only reference orders from that same site. The report snapshot is immutable and retains evidence classification as of order time.

## Evidence discipline
Categories: aerial-visible parking, driveways, pavement edges, circulation, islands, charger placement, ADA access, equipment pads, trench routes, utilities, topography, drainage, floodplain.
Every observation has one explicit state: `verified`, `unverified`, `assumption`. Visible aerial observations do not prove parcel ownership, utility capacity, code compliance, accessibility dimensions, drainage performance, or buildability. Approval and engineering review are separate gates.

## Next interface contracts (not yet implemented)
- `main_report_external_id`: owned report workflow identifier; verify upstream contract before write support
- `source_evidence_hashes`: content-addressed reference to retrieved/attached evidence
- `systemia_event_id`: signed durable event/outbox identifier with delivery, retry and receipt states
- `engineering_assignment_id`: durable engineering queue assignment; statuses queued, assigned, in_review, returned, revision_requested, approved
- `payment_reference`: verified Evercraft Payments transaction id; queueing an order does **not** imply payment
- `share_token`: expiring, revocable, per-report permissions, never anonymous by default

## Safety gates before public deployment
Role-based access for owner/team/engineer, per-site authorization on every API, anti-malware upload handling, signed upstream events, rate limits, TLS reverse proxy, audit ledger, backup+restore drill, report publication permissions, real imagery licensing, geocoding/parcels, and explicit customer acknowledgment that preliminary plans are not stamped designs.

## Operational acceptance
1. Create two unrelated sites; cross-site scenario and plan attachment must fail.
2. Record a source with unverified status; order a plan; confirm report preserves that original status even after later evidence appears.
3. Confirm returned plan refers to exact originating order and immutable report.
4. Confirm downloadable report export returns valid JSON.
5. Confirm mobile view and keyboard navigation.
6. Confirm no public network listener, no external runtime, no synthetic geospatial verification.

The local v1 test run discovered and corrected a report-export serialization defect. Source packaging and upstream integration remain follow-up work.
