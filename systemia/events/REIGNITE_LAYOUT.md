# REIGNITE layout studio | facility zoning and review

Canonical project: #2546. Reusable Evercraft Events coordination: #2547. Owned website and editor: draft PR #2553.

**Current status:** interactive source and native tests, NOT deployed, NOT an authorized event, and NOT a current facility survey.

## What is documented and what is not

The Tillamook Air Museum reports Hangar B as approximately 1,072 ft long and 296 ft wide: https://www.tillamookair.com/hangar-b/

The historic National Register nomination describes 51 timber arch trusses: https://npgallery.nps.gov/GetAsset/d362271a-ce09-4f8b-9694-04233705f21e

The editor draws an **approximately scale-proportioned historic building envelope**. The truss lines are schematic. The outside planning view is a **symbolic relationship diagram**, not a site map. None of the nine proposed zone positions is verified. The following remain missing: current aircraft/exhibit inventory; roof repairs and shoring; usable interior areas; doors, emergency exits and ADA routes; structural loads/vibration; approved event boundary and airfield security; roads, parking and vehicles; electrical, sanitation and drainage; local noise-sensitive locations.

Do not rely on the current draft for emergency operations, visitor directions, occupancy or construction planning. All zone placements are provisional and may be invalidated by current venue documents.

## Collaboration and approvals

The public/static website preview at /reignite/layout/ allows someone to select, drag, resize, add or remove concept zones. They can edit its type, proposed lead, proposed capacity, notes, evidence references and review stage, then export a JSON draft. No submission is possible on GitHub Pages alone.

An owner-operated Node 22 service is implemented for use on an Evercraft-owned host. It serves the same UI and provides an invited, authenticated review queue. Each editor can submit a proposed full plan with a rationale and a base revision. The owner sees the exact changes and proposed geometry, can preview them, and can explicitly accept the revision for **planning only** or reject it with a written reason.

Accepted planning is NOT venue permission, permit, structural safety, museum consent, ticketing, customer payment, artist booking, partner admission or approval of a real site footprint. These external gates remain separate.

## Local owner setup

From the repo root, on a trusted user-owned machine with a private state directory:

    export REIGNITE_LAYOUT_STATE="$HOME/.local/state/evercraft/reignite-layout"
    node systemia/events/reignite-layout-server.mjs init

This creates 0700/0600 private state and prints a one-time owner key. Store it privately, not in chat, GitHub or URLs. Invite a trusted contributor:

    node systemia/events/reignite-layout-server.mjs invite "Visual producer"

This prints a one-time editor key and its invite ID. Give only that editor key through a trusted channel. Then start the service:

    node systemia/events/reignite-layout-server.mjs serve

It binds only to http://127.0.0.1:8809/ by default, which is **not a remotely accessible public site**. Never directly expose that port. The browser holds the entered key in tab memory only, not cookies or localStorage, and the service requires same-origin, private key, limited request size and a bounded submission queue.

To revoke a collaborator locally:

    node systemia/events/reignite-layout-server.mjs revoke EDITOR_ID

The server reloads revocations on requests. The owner can only run one service per state directory and must verify no resident process remains before recovering a stale runtime lock after a crash. Source testing:

    node --test tests/reignite-layout.test.mjs tests/reignite-site.test.mjs

Real browser/touch, accessible keyboard, reverse-proxy authentication and HTTPS tests remain required for release.

## Security boundary and future remote collaborators

The initial local-key invitation scheme is an explicit limited prototype, not a commercial team login system. A genuine remotely accessible team site must integrate with Evercraft-owned identity, scoped Passport permissions, Interaction Ledger, private documents, an authenticated TLS reverse proxy and a separately validated security review. Do not treat GitHub merge or Node test success as live authorization. Raw invite keys must never appear in source, issues or screenshots.

No public artist applications, fundraising, sponsor contracts, outbound messages or ticket sales exist in this layout service. It writes only a private workspace of draft planning proposals and revision receipts. Never upload private venue diagrams without owner's authorization or re-publish aviation/structure-sensitive details.

## Detail upgrades once current museum documents arrive

1. Obtain owner-permitted current as-built floor plan and site boundary, including authorized LiDAR or surveyed CAD when available. Record rights, owner, document revision/date, units, coordinate origin, calibration and restrictions.
2. Add licensed private background drawing layers and calibrated geometries: structural bays, permanent aircraft, public exits/paths, roof repair exclusion zones, power, parking, road/gates and controlled outdoor footprint. Qualified reviewers must verify all life-safety and accessibility overlays.
3. Reconcile nine example proposals against those drawings and obtain actual measurements/permissions before setting any event occupancy or public wayfinding.
4. Use Systemia and existing EveryStage/Demand/Opportunity Fabric for scope, actual personnel assignments, contracting and approved work packages; do not create a parallel CRM or scheduler.
5. Require explicit owner approval, source provenance and authoritative venue/engineering/permit decisions before treating any planning zone as usable.

**Truth statement:** this delivers an editable, reviewable planning mechanism and a historic-dimensions baseline, not a true detailed current survey of Hangar B.
