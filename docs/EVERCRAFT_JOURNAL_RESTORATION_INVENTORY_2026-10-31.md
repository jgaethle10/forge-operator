# Evercraft Journal restoration inventory | 2026-10-31

**Status:** source inventory, not a full preservation audit. **Project:** #1828. **Implementation:** PR #1829.

## Confirmed owned release state

- Repository: `jgaethle10/forge-operator`.
- Generator: `systemia/newsroom/journal-publisher.mjs`.
- Input inventory: `systemia/newsroom/stories/` has **3 approved JSON stories**.
- Generated release: `public/journal/index.json` has **0 current + 3 archived**, `live_edition=false`.
- Draft queue: `systemia/newsroom/editorial-queue/2026-10-31-arase-radiation-barrier.md` exists but **not approved/published**.
- The public owned origin is configured at `https://fabric.systemiacommandcenters.com/journal`. Canonical edge confirmation and visual/mobile acceptance are **not established** by this source inventory.
- Existing external canary intentionally requires at least one eligible live edition; archive-only is an editorial availability problem, not proof of a healthy current newsroom.

| Approved owned source | Public slug | Current status | Area |
| --- | --- | --- | --- |
| `2026-09-30-boeing-fa-xx-industrial-base.json` | `boeing-fa-xx-industrial-base` | Archive; published 2026-09-30, freshness expired | Aviation & Industry |
| `2026-10-06-cfb-power-rankings.json` | `college-football-power-rankings-2026-10-06` | Archive; published 2026-10-07, freshness expired | Sports |
| `2026-10-07-cfb-power-rankings.json` | `college-football-power-rankings-2026-10-07` | Archive; published 2026-10-08, freshness expired | Sports |

## Previous editorial product footprint (reference only)

An earlier Journal front-page snapshot exposed **100 published stories** and these real editorial experiences: photo-led flagship feature; top stories; Curiosity, World, Markets, Local, Weather, Sports, Culture, Health, and Science desks; archive filters; local weather; Follow/Your Feeds; Around You; and product releases as a separate section.

Founder visual/functional standard from previous design work: “New York Times in a box”; live-feeling front door; real photography with rights/credits; compact Weather Desk; deep reads; watch/listen/source/timeline/what-changed affordances; comfortable mobile reading; no empty/dead controls.

**A 100-vs-3 index count is not evidence that 97 stories were deleted.** It establishes a preservation/discovery gap. A source manifest and rights audit are needed before any import. Do not access the legacy runtime to fill the gap.

## Migration recovery trail to inspect, read-only

1. Existing owned Git tree, historical branches/commits and previously written Journal manuscripts/receipts.
2. Previously exported Journal handoff bundles and manuscript archives in connected Drive or library, subject to permissions.
3. `public/journal` build artifacts, `systemia/newsroom` story JSON, saved publication receipts, previous release manifests and public archive metadata.
4. Explicit per-asset source rights and image provenance. **No synthetic event photographs.**
5. Unique canonical slug mapping and content hashes; no duplicate pages or redirects without evidence.

## Release gates

- **Website:** mobile and desktop screenshots reviewed; no horizontal overflow; working links/desk navigation.
- **Stories:** approved source/claim ledger, uncertainty, 10/10 editorial and visual/rights gates; new scientific stories cannot be published just because they have social drafts.
- **Operational:** new/current story means eligible live receipt + actual external canary, not “generated artifact exists.”
- **Distribution:** Evercraft Clip gets independently verified live permalinks, not assumed posted status.
- **Hosting:** owned runtime only; no reinstated Base44 or third-party host dependencies.

This inventory is intentionally honest about incomplete recovery and failed public proof. Continue through issue #1828.