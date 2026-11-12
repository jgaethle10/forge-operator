# Becoming Worlds: lifetime progression architecture (v0.2)
**Status:** implemented local-only engineering preview on draft PR #1902. No public deploy or verified cross-device persistence.

## The non-negotiable product change
**No finite season arc.** Franchise Mode is not a seven-day win streak, a ninety-day playoff push, or a reward screen. A user is founding an entire sports organization and shaping its land for the rest of their life. The franchise world includes its founding grounds, practice fields, training facilities, clubhouse, grandstands, stadium, recovery and wellness center, youth academy, indoor arena, legacy hall and additional campuses. Users pick locations on expanding land, invest earned construction credits, and upgrade facilities.

Symphony Mode is similarly a **persistent musical campus**, with rehearsal studios, instrumental halls, light design rooms, open-air stages, concert halls, music academies and additional performance districts. Sanctuary Mode is a living landscape. The same personal journey can be represented across all three; they are not disposable skins.

## Implemented contract
- `public/art-of-becoming/world-engine.mjs`: first-party pure world-state, catalog, construction/upgrade rules, expandable land, deterministic placement summary.
- `public/art-of-becoming/worlds.html`: interactive stylized 2.5D campus map, camera movement, goal/mode selection, building placement, upgrades, and **clearly labeled demonstration**.
- `public/art-of-becoming/engine.mjs`: carries `worldState` forward in normalized check-in state and existing JSON export/restore.
- `tests/art-of-becoming-worlds.test.mjs`: progression, ownership, separate worlds, difficult-day retention, imports, and invalid placement.
- `scripts/probe-art-of-becoming-browser.mjs`: real mobile Chromium flows including facility construction and mode switching.

### Event grammar
```text
SelfReportedDay(goal, date, outcome)
  -> EarnedDayCredit(goal, date) [at most once, never confiscated]
  -> AvailableConstructionCredits(goal)
  -> WorldConstructionCommand(goal, expressionMode, facilityKind, lot)
  -> OwnedFacility(goal, expressionMode, buildingId, location, level)
  -> WorldView(ownedFacilities, currentLand, atmosphere)
```
A missed check-in means **unknown**, not a relapse. A reported hard day can change today's weather or momentum presentation later, but does **not** remove the facilities, milestones, earned credits, or historical place the user built. Facilities are directly selected and placed by the user, never erased to create artificial urgency. Completion of a calendar year never resets the campus.

## Current world and lifetime model
- Each known intention has separate construction worlds for Franchise, Symphony, and Sanctuary. Switching between expressions preserves other expressions. They are parallel personal representations, not competing spendable stores.
- Construction cost comes from that intention's **distinct credited dates**, awarded once per date. Level upgrades and additional copies of facilities remain in the world state.
- Land expansion radius grows as the square root of lifetime days; the camera supports panning. There is no maximum calendar season or final level to beat.
- Data and buildings are currently stored under `worldState` in the same browser-local JSON backup as daily reflections.
- Demo credits/buildings are generated in memory only and never saved to personal progress.
- Current 2.5D browser preview is a first playable map. **It is not a real 3D character walkthrough, 3D physics game, sports simulator, orchestra-performance engine or connected Evercraft Worlds runtime.** Those require a dedicated world renderer/runtime.

## First-person campus viewer, v0.3
A separate first-party, offline-capable browser renderer now lives at `public/art-of-becoming/campus-walk.html`. The original 2.5D map remains the **construction authority** and is linked to the new first-person view. The scene is read-only: entering it cannot spend credits, modify reflections, create facilities or save simulated achievements.

- `campus-walk.mjs`: original zero-CDN WebGL2 geometry, directional lighting/fog, stadium / field / clubhouse / hall facades, footpaths, trees and founding courtyard. Uses the same facility instance IDs/lot positions as the planner.
- `walk-engine.mjs`: pure, testable world-space projection, coordinate conversion, pedestrian collision, camera yaw/pitch and speed boundaries, nearby-facility discovery.
- Desktop supports WASD, drag to look, Shift to speed up. Touch supports drag-to-look and direction pad. Escape/pause and return to founders are available.
- A demonstration world uses **disposable in-memory** sample construction, clearly labeled as a preview and never persisted.
- If WebGL2 is unavailable, the viewer reports this and directs the user back to the existing 2.5D planner rather than modifying saved state.
- The same browser test checks actual WebGL2 frame rendering, geometry, movement, phone screen size, reload persistence, and hard-day retention.
- The viewer generates **procedural buildings** rather than photorealistic stadium assets; building interiors, doors, crowds, live matches, collision optimization across massive cities and physically realistic sound are not implemented yet.
- A first-person browser viewer is not the same as deploying the existing Evercraft Worlds engine as an authoritative long-lived scene; the World Engine V1 data bridge remains local/export-only.

### Follow-on visualization milestones
1. Add entrance portals and walkable interiors for stadium / academy / concert hall, preserving player controls and mobile budgets.
2. Stream detailed geometry and textures by district and hardware quality; don't load twenty years of assets in one frame.
3. Add non-punitive ambient music and reactive lighting authored by Evercraft, with mute and sensory comfort settings.
4. Add landmarks and an in-world campus construction UI, then verified event persistence and secure opt-in multi-device recovery.
5. Test with real iPhone Safari and screen-reader alternatives before broad distribution.

---

## Long-horizon requirements before a lifetime ownership claim
A browser-local save and manual JSON export **cannot guarantee** survival for decades. A credible lifetime platform requires:
1. **User-owned durable account identity** (optional pseudonymous mode), explicit consent and no silent collection of sensitive check-ins.
2. **End-to-end encrypted opt-in backups** with recovery mechanisms, restore drills, key rotation, versioned formats, and periodic offline export.
3. **Append-only event receipts** for earned credit and irreversible owned-world construction, with idempotency keys and tamper-evident recovery (never use a cloud streak calculation as the sole source of ownership).
4. **Migration system** across world-engine revisions, renderers, devices, and decades; old scenes and facilities remain readable and reusable.
5. **Accessible 3D/2D dual views** so low-power phones can explore the same saved world even as immersive graphics improve.
6. **No commercial pay-to-protect-a-streak mechanic**, public sobriety leaderboards, medically framed outcome claims, or punitive world resets.
7. **Deletion/export/privacy policy** in clear language, with special care for substance-use reflections and children/minors if youth use is eventually supported.
8. **Evercraft-owned execution**, using Systemia for orchestration only after privacy gates and documented permissions. No imported Base44 runtime.
9. **Versioned world geometry** and future spatial assets, with immutable facility IDs, an upgrade ledger, and room for procedural terrain and user-driven expansion.
10. **Human-centered pacing**: there's always something pleasant to do without making a hard day feel like personal failure.

## Next engineering gates
- Dedicated CI smoke green on the actual PR head, with a screenshot of Franchise and Symphony on mobile.
- Actual iPhone Safari touch/keyboard and assistive-technology testing, beyond Chromium phone emulation, for **both** campus planner and WebGL2 walk-through.
- Visual-system pass: physically plausible 3D sports campus, navigable clubhouse and stadium, real camera/walk modes, scalable asset streaming, ambient performance.
- Real original orchestral sound and reactive lighting for Symphony, with sound accessibility and mute controls.
- Formal recovery/privacy/threat-model design and independently verified backup restore.

**Product rule:** The world is a lifelong place. A streak is one of the weather patterns, not the world itself.
