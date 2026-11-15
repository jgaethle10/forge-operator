# Worlds Business Square | Canonical renderer walkthrough

**Status:** local authored visual pilot only, not a launched business-networking or autonomous-agent product.

## What this adds
- A small walkable 3D business square to the existing `public/worlds/app.mjs` WebGL scene. No parallel renderer, new world storage schema, separate service, external runtime or injected identities.
- An entry control on the Mossmere welcome screen and a Business HUD button.
- Physical stations for a directory, static concierge concept and meeting studio. They are clickable through the normal E/Interact proximity affordance; no phone calls, payments or messages are sent.
- An accessible, mobile-friendly information panel with privacy boundaries, arrival and return controls.
- Local deterministic content only. No customer profile, tracking, remote agent runtime or fabricated live participant.

## Separate security build
The policy in [PR #2067](https://github.com/jgaethle10/forge-operator/pull/2067) is a **separate draft** and must not be treated as deployed here. Before enabling real networking, ship owned authenticated presence, verified adult eligibility, Passport grants and revocation, bilateral block/report, expiring invitations and explicit acceptances. A human/agent introduction needs both humans' informed, independent acceptance. Agent work, memory and Payments remain separately authorized.

## Verification
```bash
node --test tests/worlds-business-square.test.mjs
```
The tests verify authored coordinates inside the existing 3D scene, discoverability, local disclosure, and source integration. GitHub CI and **physical Safari playtesting** remain independent gates. Existing Worlds HTTPS origin/public vault #1994 is a separate release requirement. Merging source is not proof of public access.

## Next milestones
1. In-browser physical keyboard, touch and iPhone playability + visual review.
2. Hook real authenticated owned presence to Passport and the fail-closed policy in #2067, without touching scene-only vault data.
3. Add server-owned accepted invitations and two-way moderation.
4. Only then attach bounded Work Saban concierge tasks and validated paid operations.

Tracking mission: [#2066](https://github.com/jgaethle10/forge-operator/issues/2066).
