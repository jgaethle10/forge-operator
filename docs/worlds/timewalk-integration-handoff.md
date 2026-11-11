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

## 2026-11-04 provenance hardening: reject place-name collisions

A public web-search result presenting a **1960** R. L. Polk excerpt with the heading **Yakima Ave** turned out to be from the *Irving & Yakima* environmental report in **Seattle, Washington 98144**, not from Yakima city. This candidate has been excluded and recorded at `excludedSearchResults` in the Yakima evidence ledger. Do not use Seattle's or Tacoma's Yakima-named streets as evidence for this world.

**Machine-readable gate:**
- All admitted source records now contain `targetJurisdiction: {city:'Yakima',region:'WA',country:'US'}`, matched against `location.jurisdiction`. Off-city records fail validation even if their filenames or street names contain "Yakima."
- An explicitly **documented 1960** claim may be accepted in the future only when the source itself is indexed for 1960 and a `targetYearProof` record gives an original item locator, date in 1960, location-check flag and recorded inspection note. This requires actual editorial examination. No current scene claim satisfies this gate.
- `mediaAssetCanBeEmbedded(source,asset)` additionally requires an item identifier, HTTPS original URL, credit, explicit item-level rights and a publication review. Merely citing a public catalog or permission-limited archive does not authorize public display.
- `tests/timewalk-jurisdiction.test.mjs` tests the false-positive exclusion, wrong-city failures, rights and positive *synthetic software fixture* for future verified-year ingestion. Synthetic test evidence is not historical evidence and must never be imported as content.
- Existing Worlds rendering, physics and scene persistence remain outside Timewalk ownership.

**Verification:** [Timewalk evidence Actions workflow](https://github.com/jgaethle10/forge-operator/actions/workflows/timewalk-evidence.yml). Check the head commit's run result; a queued run is not a test pass. Draft PR #1780 remains unmerged.

**Primary research references:** [Seattle environmental report, exclude for Yakima](https://www.seattle.gov/documents/Departments/FAS/RealEstateServices/Property/1594-PhaseI-ESA-Irving-Yakima-pgs-Apd-E-F.pdf) and [Washington State Library Yakima city-directory holdings](https://www.sos.wa.gov/library/research-collections/city-directories-telephone-books). The Washington State Library catalog itself does **not** list a 1960 Yakima city-directory volume; 1959 and 1961 remain acquisition priorities.

## 2026-11-04 map-registration workbench

Timewalk now includes a **data-only projected-map registration workbench** in `public/worlds/timewalk/map-registration.mjs`. Given an **identified and inspected** historical map sheet, at least four independently cited and reviewed non-collinear ground-control points, and a declared projected CRS, it calculates a least-squares affine pixel-to-projected-coordinate fit and reports per-point, RMS and maximum residual errors.

**Crucial safety boundary:** even a perfect numeric fit remains `draft_requires_review`, `geometryAuthorized:false`, `productionAuthoritative:false` and `publicMapTileAuthorized:false`. A fit does not prove that imagery, a building or a street represents 1960, nor does it authorize publication. Only the existing Worlds authoritative engine can import a separately reviewed and authorized scene.

The real Yakima staging record is `public/worlds/timewalk/yakima-1960/map-registration-pending.v1.json`. Its controls array is **empty**, and its selected map sheet URL, image number, update date, CRS and surveyed tie-points are intentionally **null/pending**. The verified public-domain Library of Congress collection at `https://www.loc.gov/item/sanborn09381_002/` contains 96 map sheets, but we have not yet identified the specific sheet for Yakima Avenue between South Second and South Third streets. Do **not** use an arbitrary sheet number or invent GCPs.

Regression file `tests/timewalk-map-registration.test.mjs` contains synthetic coordinate fixtures to check math and fail-closed behavior. The CI gate now runs `node --test tests/timewalk-*.test.mjs` so all historical, jurisdiction, rights and map-draft tests are included.

**Human acquisition steps:** find precise LOC sheet; record sheet image URL and date; select trustworthy street/boundary control features; record image-pixel positions and geodetic survey coordinates with citation; inspect residuals and local distortions; review the 1950-to-1960 changes and image-level rights before historical promotion.

This is **not** a second map engine, GIS authority, or new rendering dependency.

## November 9 update: first source-qualified walking storyboard and 1960 Larson architecture

We confirmed an important **route correction** from the [City of Yakima's historic walking tour (PDF)](https://www.yakimawa.gov/services/historic-preservation-commission/files/2012/08/Walking-tours.pdf): A.E. Larson Building is **stop 27** near Second Street and Yakima Avenue, while Capitol Theatre is **stop 10** along Third Street farther south. They should **not** be represented as two buildings simply facing each other across the single East Yakima Avenue 2nd–3rd block.

The [official Capitol Theatre 2022–23 packet (p. 4)](https://capitoltheatre.org/site/files/file_manager/page/shared/Capitol_Theatre_Tech_Packet_2022-23.pdf) puts the **modern** main entrance midway along the east side of South Third; this does not establish the same entry configuration in 1960. The 9-vs-19 South Third **address discrepancy remains unresolved** in the historical registry. The walking tour's underlying base map bears 2008 Google/NAVTEQ attribution; link/cite only, never copy that map raster into a released world without a rights check.

The [1984 NRHP nomination for Larson Building](https://npgallery.nps.gov/NRHP/GetAsset/NRHP/84003647_text) is exceptionally useful **retrospective year-specific architectural evidence**. It states that **three original corner storefronts were remodeled in 1963** into a combined commercial-bank unit. Thus a reconstructed 1960 Larson exterior must **not** depict that later bank-glazing layout. The nomination documents original four shop entrances on Second Street and three on Yakima Avenue, and describes a 65-by-130-foot building and a height of 188 feet to the **flagpole**. These are **1984-reported** measurements and descriptions, not a validated 1960 mesh, independently surveyed 1960 dimensions, or an original 1960 photo. Original forms should carry `retrospectively_inferred` status for 1960. Do not assert tenant names without period directories.

### New code and data contracts (no duplicate engine)

- `public/worlds/timewalk/yakima-1960/larson-periods.v1.json`: NPS-linked 1931–1984 architectural chronology; 1932–1962 original storefront state, 1963 modification year unresolved to month, and post-1963 bank alterations. Later than 1984 unverified by this record.
- `public/worlds/timewalk/architectural-periods.mjs`: validates the above and resolves source-based architectural *appearance cues* for the selected year. Never emits geometry or claims direct 1960 photographic observation.
- `public/worlds/timewalk/yakima-1960/walk-topology.v1.json`: four graph nodes and three **illustrative** walkway segments. Exact sidewalk routes/crossings/lengths are **not verified for 1960**; all positions and distances are null.
- `public/worlds/timewalk/walk-topology.mjs`: `makeTimewalkSceneHandoff(evidence,route,architecture)` gives the original Evercraft Worlds runtime a **data-only historical payload** with sourced claims, approximate street-storyboard, and pre-1963 facade cue. It provides no renderer, physics, coordinates, or production scene authority.
- `tests/timewalk-architecture.test.mjs` and `tests/timewalk-route-handoff.test.mjs`: fail-closed year transitions and route/engine-authority checks. CI command is `node --test tests/timewalk-*.test.mjs`, but confirm successful run before claiming new work passed.

**Still blocked:** the exact Library of Congress 1950 Sanborn plate for this downtown block, surveyed georeferencing tie-points, direct 1960 storefront imagery, 1959/1961 directory entries, and a reviewed source-media rights manifest. The standalone alpha HTML is a renderer reference and is **not production-authoritative**, particularly because its schematic arrangement does not accurately encode the whole route.

**Main Worlds integration owner:** only import the history handoff into existing Worlds' scene authoring / provenance UI after schema review. Do not copy standalone Timewalk rendering, movement, save, hosting or physics code.

## 2026-11-09 research discovery: CSUN Yakima 1960 Sanborn atlas holding

The [CSUN Department of Geography's Sanborn collection catalog](https://www.csun.edu/sites/default/files/outside_california.pdf) **lists Yakima, Yakima County with a 1960 edition** (also 1953, 1955, 1956, 1958 and 1959). This is a materially closer candidate than the public-domain [LOC 1920–Dec 1950 collection](https://www.loc.gov/item/sanborn09381_002/). Crucially, CSUN's listing is **collection-level, not the exact downtown plate**. We have **not obtained, visually inspected or licensed a 1960 Sanborn sheet**, and must not claim 1960 footprints or actual original storefront details from the catalog.

**Research-access terms:** The [CSUN archive access page](https://www.csun.edu/social-behavioral-sciences/sanborn-collection/about) gives `sanborn@csun.edu` as the research contact. It lists a **$10 USD volume pull fee** and **$20 USD imaging fee per sheet**, with digital copies described for **non-commercial research or personal use**. Do not initiate charge or scanning order automatically. This is not an authorized quote or public/commercial re-use license. Any derivative/public-world usage and item-level rights must be checked with archivists/rights holders separately. The [Library of Congress rights guidance](https://guides.loc.gov/fire-insurance-maps/copyright) also cautions that *copyright status is not uniform for all Sanborn maps*; the already-public LOC images are public domain but a distinct 1960 physical atlas does not automatically inherit that clearance.

**Committed data and executable acquisition guards:**
- `public/worlds/timewalk/yakima-1960/csun-1960-acquisition.v1.json` lists original volume/sheet ID, item URL, edition correction stamps, scan hash, image rights, and exact block coverage as **not inspected / null**. Explicit `purchaseAuthorized:false`, `geometryReady:false`, `publicDistributionAllowed:false`.
- `public/worlds/timewalk/archive-acquisition.mjs` provides `validateArchiveAcquisition`, `acquisitionReadiness`, and `archiveInquiryPacket`. Inquiry is a **draft packet only**, with no external send action or fee permission. The module cannot turn a catalog year into approved 1960 scene geometry.
- `tests/timewalk-archive-acquisition.test.mjs` adds six no-fee, original-verification, exact-year and city-rights regression cases.
- `map-registration-pending.v1.json` still contains the unresolved LOC 1950 sheet; a new `preferredTargetYearAcquisition` points to the more period-relevant CSUN 1960 candidate. Both remain unlocated.

**Archive inquiry scope:** 6 S. Second Street A.E. Larson Building, S. Second/E. Yakima intersection, S. Third/E. Yakima intersection, and Capitol Theatre along South Third; ask for atlas volume/sheet IDs, original updates, feasibility of remote viewing, item price, and rights for public/possibly commercial 3D reconstruction. **No inquiry has been sent.**

**Main Worlds** must continue to own rendering, movement, scene persistence, and navigable geometry. Once a specific dated 1960 sheet and rights have been reviewed, Timewalk can supply period-authenticated map features and georeferencing evidence. Until then, 1960 shape/data accuracy is still *unverified*.

## November 9 archival architectural originals: Yakima Valley Museum catalog found

**Major source lead from Washington State DAHP:** The [Yakima Valley Museum drawing collection index (PDF)](https://dahp.wa.gov/sites/default/files/Drawings_at_YakimaValleyMuseum.pdf) identifies **original A.E. Larson Building office drawings dated July 15, 1930** (drawings 1–33, E1–E10, S1–S8; **Drawer 7 bottom left**), a separate **linen-tracing set** by John W. Maloney dated the same day (A1–A33, E1–E9, S1–S8; **5-2, rolled with no tube**), and **four Fox Capitol Theatre alteration drawings dated June 27, 1930**, by Maloney (**accession 0096-085, 5-1, Tube Y-11**). The index separately lists **1962–79 Larson floor plans** in storage area **4-1**, which must not be back-projected into 1960.

This is **cataloged source metadata**, not physical confirmation, inspection of the plans, proof of actual as-built condition or unchanged exterior in 1960. A proposed 1930 design may have been revised or built differently. Rights for copying the originals and preparing public/commercial 3D derivatives are **not cleared**. Do not invent storefront geometry or assume every indexed sheet is still physically held.

**Research outreach actually executed:** On November 9, 2026, a no-cost inquiry was sent to museum archivist **John Baule** at `john@yvmuseum.org` (address in the museum's 2025 annual report). A follow-up message **in the same Gmail thread** supplied the newly located Larson drawing shelf numbers. No appointment, purchase or scan order was placed. Response tracker: [issue #1972](https://github.com/jgaethle10/forge-operator/issues/1972). The parallel CSUN 1960 Sanborn atlas request remains tracked at [issue #1938](https://github.com/jgaethle10/forge-operator/issues/1938).

**New data contracts:**
- `public/worlds/timewalk/yakima-1960/yvm-architectural-drawings.v1.json` holds four individually identified cataloged archival records; each carries `inspectionStatus: catalog-only`, `historicallyBuiltAsDrawn: null`, `unchangedBy1960: null` and separate unapproved image and derivative rights.
- `public/worlds/timewalk/architectural-drawing-intake.mjs` validates the register and returns a bounded source-review queue with `geometry:null`, `renderer:null`, `worldsAuthority:false` and `readyForProduction:false`.
- `tests/timewalk-architectural-drawing-intake.test.mjs` adds seven regression cases enforcing accession, catalog location, item rights, uninspected status and no independent Worlds runtime authority. Included automatically in `node --test tests/timewalk-*.test.mjs`.

**Acceptance path:** archivist confirms item existence and access; Timewalk examines actual dimensioned plans and their revision/as-built labels; rights are reviewed independently; a dated image / period record cross-checks 1960 continuity; human-reviewed geometry data is submitted through the original Worlds engine. The standalone alpha remains a non-authoritative reference.

## 2026-11-10 critical archive response: exact sheets #6 and #15

**A CSUN Sanborn Collection staff response has been received** to the November 9 information-only inquiry, with exact sheet IDs:
- **Sheet #6**, covering the **A.E. Larson Building**; CSUN staff supplied the public [LOC digitized 1952 sheet, viewer page 11](https://www.loc.gov/resource/g4284ym.g4284ym_g093811952/?sp=11&r=0.251,0.255,0.496,0.416,0).
- **Sheet #15**, covering the **Capitol Theatre**; CSUN staff supplied the public [LOC digitized 1952 sheet, viewer page 20](https://www.loc.gov/resource/g4284ym.g4284ym_g093811952/?sp=20&st=image&r=0.56,0.858,0.345,0.289,0).

The archivist describes the final Yakima volume as **apparently corrected to 1960** and reports the building footprints on the LOC 1952 originals appear **identical** to their 1960-corrected volume. That comparison is valuable **archivist testimony**, NOT independent inspection of either 1960 physical sheet by Evercraft. We have not established **sheet-level 1960 correction stamp dates**. A concise no-cost follow-up asked for those exact dates and distinct rights conditions. **No paid scan or license was ordered.**

**Rights split:** The [Library of Congress online Sanborn collection rights statement](https://www.loc.gov/collections/sanborn-maps/about-this-collection/rights-and-access/) says material in its **online collection is public domain and freely reusable**, so those *LOC-hosted 1952 images* have a known collection-level reuse basis. Do **not** extend that permission to separately scanned **CSUN 1960 originals**. The archive staff's informal interpretation of LOC rights does not itself grant a legal license for CSUN's copies. A 1952 map image also does not prove specific 1960 shopfront designs, store occupants, or walkable street details.

**New executable data contract:**
- `csun-1960-acquisition.v1.json`: reply status advanced to `archive-sheet-numbers-confirmed-awaiting-original-inspection`; records numbered sheet-to-landmark association, exact LOC viewer URLs, and archivist-reported footprint comparison. **Original 1960 images, GCPs, image hash, geometry and rights remain null/false.**
- `map-registration-pending.v1.json`: maintains the original unlocated 1950 collection fallback while separately listing 1952 digital page 11 / sheet 6 and page 20 / sheet 15 with 1960 curator correction questions still unresolved.
- `evidence.v1.json`: adds LOC digital 1952 volume as a separate source from the 1960 CSUN physical holding, with unambiguous distinct reuse rights.
- `archive-acquisition.mjs`: accepts a supported intermediate *archivist replied, sheets located* state, but rejects uninspected originals, invented exact sheet dates or premature commercial publication rights.
- `map-sheet-anchors.mjs`: produces a **data-only** sheet-to-landmark crosswalk with `historicCoordinates:null`, `extractedPolygon:null`, `worldGeometry:null` and `accurate1960SceneAuthorized:false`.
- `walk-topology.mjs`: optional fourth argument to `makeTimewalkSceneHandoff(ledger,route,architecture,archiveAcquisition)`, which attaches those provenance anchors without modifying Worlds scene simulation, physics or renderer. The earlier three-argument call remains supported.
- `tests/timewalk-map-sheet-anchors.test.mjs` and updated acquisition tests verify the progression of archival evidence but leave physical 1960 source geometry untrusted.

**Outstanding for main Worlds:** visually inspect LOC 1952 originals, confirm individual 1960 correction dates or obtain licensed 1960 physical-source access, review surveyed control points and independent 1960 shape changes, then supply reviewed renderable geometry as a separate authorized dataset. PR #1780 is still a draft; issue #1938 tracks archive reply/rights and issue #1794 the canonical-engine integration. This research **is not** a launch of a 1960 3D city.
