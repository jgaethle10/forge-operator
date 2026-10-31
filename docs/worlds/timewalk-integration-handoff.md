# Timewalk integration handoff · no duplicate Worlds engine

Updated 2026-10-30. This handoff is for a **draft historical-data/world prototype** and intentionally does not edit the production Evercraft Worlds runtime.

## Single implementation authority
- **Main Evercraft Worlds** owns 3D renderer, player physics, controls, editing, collision, animation, authoritative Systemia World Engine adapter and persistence.
- **Timewalk** owns evidence-backed historical scenes: selected time/year, dated source datasets, georeference/reconstruction methodology, rights checks, confidence labeling and historical storytelling.
- **One user-facing product:** Timewalk is a historical exploration mode **inside** Evercraft Worlds; not another independent world-engine product.
- **No new service/host:** keep owned Systemia/Evercraft stack. Do not bolt on another runtime or copy the Mosslight code forward as a second engine.

## Existing repository state
- The existing Worlds browser has `public/worlds/world-core.mjs`, `world-bridge.mjs`, `app.mjs`. Its current `world-core.mjs` validation is Mossmere-specific; **it cannot yet consume a historically sourced Yakima scene** without a planned schema/loader extension from the main Worlds owner.
- The Timewalk alpha in `public/worlds/timewalk/yakima-1960/index.html` has a copied/adapted Mosslight-era browser renderer; it is a **temporary portable visualization/reference**, not a production engine replacement.
- The data-only evidence ledger `public/worlds/timewalk/yakima-1960/evidence.v1.json` is the historical layer's future integration input, not scene geometry or navigation instructions.
- The `tests/timewalk-evidence.test.mjs` Node built-in regression suite can be run with `node --test tests/timewalk-evidence.test.mjs`. It checks evidence IDs, citations, rights and prevents false 1960 historical claims. A test file is not proof that CI passed.

## Integration contract, not yet implemented
The main Worlds thread should add a read-only historical-scene metadata binding without replacing its renderer or persistence:
```json
{
  "worldId": "yakima-wa-downtown-1960-alpha",
  "year": 1960,
  "evidenceLedger": "timewalk/yakima-1960/evidence.v1.json",
  "geometryDataset": null,
  "georeferenced": false,
  "historicalAccuracy": "illustrative-alpha"
}
```
This is a **proposed data contract** only, not a claim the existing code can already load it. No location will be precise until independently georeferenced.

## Historical blockers
1. **Capitol Theatre address conflict:** National Park Service and theatre list 19 South Third; the Yakima city local register lists 9 South Third. Both remain recorded rather than silently choosing one.
2. **Year accuracy:** the 1920–Dec 1950 Sanborn set is an earlier baseline, not a verified 1960 photograph or directory.
3. **Photo rights:** Yakima Memory warns that online publication requires copyright holder permission; do not embed those images before clearing rights.
4. **Street accuracy:** all rendered widths, signs, cars, tenants and facade details are illustrative until corroborated.
5. **Real WebGL2 device and integration test** required before product merge, public deployment or any claim of commercial readiness.

## Review path
Keep PR #1780 as a draft for the Timewalk historical package. The main Worlds thread integrates **data**, not copied renderer. On integration, retain evidence metadata and replace/delete this standalone renderer in favor of the single canonical Worlds scene experience. Do not merge the standalone as a parallel public engine route.

## 2026-10-30 historical-source and adapter update

**Source inventory:** `public/worlds/timewalk/yakima-1960/evidence.v1.json` now records 11 referenced sources and a five-item research inventory. New evidence candidates are the Washington State Historical Society's *circa-1950 eastward Yakima Avenue photograph between Second and Third* as cataloged by Revisiting Washington, plus the Washington State Library's **1959 and 1961** Yakima directory holdings. These are catalog **descriptions**, not newly ingested photographs, exact 1960 store names, or proof of continuity.

**Use without fork:** `public/worlds/timewalk/historical-evidence.mjs` exports `validateHistoricalEvidence(ledger)`, `sourceCanBeEmbedded(source)` and `makeHistoricalOverlay(ledger, 1960)`. The result is a serializable **evidence overlay**, deliberately with `geometry: null`, `renderer: null`, `movement: null`, `georeferenced: false`, no embedded imagery and an explicit `accurateSceneClaimAllowed: false`. Integrate this only as a source/provenance view within canonical Worlds, never a replacement scene or second renderer.

**Regression file:** `tests/timewalk-overlay.test.mjs` adds eight Node built-in tests (run using `node --test tests/timewalk-overlay.test.mjs`). CI outcome must be checked separately, not assumed from the commit.

**Before citing an actual Yakima 1960 business:** read and document **both** directory entries for the business at its numbered address (if they exist), investigate intervening construction/tenant changes, and retain an inferred/uncertain status until independent 1960 evidence confirms presence. An approximate-1950 photo cannot be projected directly into 1960. An online photo catalog does not itself grant publication rights.

New references: [Revisiting Washington Yakima](https://revisitwa.org/waypoint/yakima/), [Washington State Library city-directory holdings](https://www.sos.wa.gov/library/research-collections/city-directories-telephone-books), [Yakima Central Library local directories](https://www.yvl.org/services/special-collections-and-archive-services/washington-cities-counties/).
