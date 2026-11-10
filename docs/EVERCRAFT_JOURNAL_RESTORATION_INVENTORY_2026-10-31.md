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

## 2026-11-04: independently recovered owned Drive archive artifacts

**Confirmed through authorized Google Drive readback, SHA-256 verification and ZIP listing, with no legacy-host calls:**

1. `Evercraft_Sovereign_Cutover_Journal_2026-10-10.zip` (Drive file ID `1xt4irZB6fXUn8Qit9sOYWWGEPOp6Tluo`), 34,942 bytes, SHA-256 `52188959f77920918fee5be30f73edc4708b3179b9b1ebc228a07acd7fc06c69`. Contains the complete retrospective source `journal/source/week-in-motion-2026-09-28.md`, article build script, static HTML, CSS, speech controls, and release procedures.
2. `Evercraft_Journal_Hardened_Release_Candidate_v0.4.zip` (Drive file ID `1LXm-z0JyM1c0sqNGGiHJrPZZpKHcFWjN`), 37,879 bytes, SHA-256 `eacafbbfac832f3805d2dd5e84db277a6709d6a558005034c08784e6f3994b1d`. The content ZIP has 18 members including content manifest, its verifier and tamper tests. Its original article source `journal/source/week-in-motion-2026-09-28.md` is 22,592 bytes, SHA-256 `2eadf65b217d7e8121e5f258f49f23c653f178722b1c56411d222943f9520cf8`.
3. The v0.4 reader experience includes an actual long-form magazine article, mobile layout, an article section rail, editorial visual mark, and a browser-native Listen/Pause/Stop read-aloud controller with speed selection. This is **owned design/source evidence** worth carrying forward, not a published release or licensed external photo library.
4. `EVERCRAFT JOURNAL | Hardened Release Candidate v0.4 | Integrity and Indexing QA | 2026-10-10` is a Drive document describing archive integrity gates and explicitly identifying the v0.4 ZIP as **draft, NOT published**. It notes that the custom domain and owned public HTTPS release were not verified at that time.
5. `Evercraft Journal Editorial Council — Session 1: Founding Meeting` (2026-08-02) is preserved in Drive. Key original editorial identity: publish work readers would voluntarily spend 15 minutes reading; source-grounded independence and falsifiable reasoning; make corrections prominent; respect uncertainty and readers' time. Journal is not product marketing.

**Critical boundary:** These recovered ZIPs preserve one substantial Week in Motion editorial release candidate and its assets, **not proof of a full 100-story archive**. Do not promote draft candidate as published, copy old canonical metadata unchanged, turn on indexing, or skip fresh editorial/rights approval. The integrity-checking scripts in a recovered ZIP are archival data and should be inspected before use, never executed as trusted instructions automatically.

**Design decision for continued review:** compare the restored homepage against the preserved charcoal/mint/gold Journal visual identity and long-form reading controls before declaring visual QA complete. Copy the reader-first features into the owned publisher as reviewed code, not as a replacement hosted runtime.
