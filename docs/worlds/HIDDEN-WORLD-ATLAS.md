# Evercraft Worlds integration branch

Source merged into the main Evercraft Worlds repository with PR #1855. Expected static route: `/worlds/hidden-world/` on an Evercraft-owned host serving `public/`. The source integration **is not evidence of deployment**. Live public HTTPS reachability and physical-device behavior require separate proof. The package uses a single-file Yakima exhibit (`yakima-standalone.html`) and relative links. A successful HTTPS fetch, iPhone Safari test, and the established Worlds public release gate are required before declaring it live.

---

# Evercraft Hidden World Atlas · Field Edition 003

**Status (November 9, 2026):** Working historical exploration prototype, merged into the Evercraft Worlds source tree. External HTTPS reachability and physical-iPhone verification remain unconfirmed.

## Open the exhibit
- **Fastest:** open `yakima-standalone.html`. It includes static illustrated surface and underground previews with a CSS-only switch if the viewer blocks scripts. To walk the environment, open the file through a normal browser that permits JavaScript or deploy it on Evercraft-owned web infrastructure.
- **Full project:** open `index.html` to browse the existing twelve-location Pacific Northwest Atlas, then select **Enter Yakima Reconstruction 001**. This links to `yakima-standalone.html`, the self-contained exhibit. `yakima.html` also includes the same fallback; original separated assets are included as source for development.
- All drawing and interaction code is original, written for Evercraft, and needs no third-party scripts, CDN, account, network connection or external model.
- Historical source links require internet. No analytics or tracking.

## Reconstruction 001 features
- Procedurally illustrated street-level scene inspired by early downtown Yakima imagery.
- Historical lenses for approximately 1910, 1920 and 1950. **They are interpretive scenes, not faithful exact-date reproductions.**
- Distinct underground **conceptual research gallery**. This is NOT a reconstruction of a confirmed continuous downtown tunnel system or a real underground route.
- WASD/arrow-key walking; mouse/touch drag to rotate; scroll or +/- to zoom; mobile D-pad; reset viewpoint.
- Six evidence stops, each with archive links, claim category, what is known, and what remains unknown.
- Existing twelve-place regional atlas: filters, map, sourced site records, public access markings and CSV export.

## Why the unknowns matter
A local history book and contemporary recollections discuss Yakima tunnels and basement spaces. But the exact underground networks, their dimensions, entry points and whether routes connect are **not established** by the sources reviewed so far. The exhibit's subterranean rooms, dashed question mark and buildings are invented illustrative geometry, not survey coordinates. No entrances to private property or restricted sites are provided.

## Grounded references
- F. H. Newell, *Yakima Avenue, looking East from railroad tracks*, 1905–1915, Spokane Public Library. Original item is marked public domain: https://lange.spokanelibrary.org/items/show/5659
- Sanborn Fire Insurance Map, Yakima, 1920, Library of Congress: https://www.loc.gov/item/sanborn09381_001/
- Sanborn Fire Insurance Map, Yakima, 1920–1950, Library of Congress: https://www.loc.gov/item/sanborn09381_002/
- Ellen Allmendinger, *Hidden History of Yakima* (2018), Google Books bibliographic entry: https://books.google.com/books/about/Hidden_History_of_Yakima.html?id=Dj9vDwAAQBAJ
- Yakima Valley Museum, Sundquist Library and Archives holdings: https://yvmuseum.org/news/our-library-archives
- Yakima Valley Libraries, Sanborn/map access: https://www.yvl.org/services/special-collections-and-archive-services/maps-and-atlases/
- KATS-FM, “More Haunted Spots Across the Yakima Valley” (2021), local recollection: https://katsfm.com/more-haunted-spots-across-the-yakima-valley/


## Walkable Titan I Research Gallery (November 11, 2026)

- Owned Worlds route: `/worlds/hidden-world/titan-walk/`, linked from the 1962 Titan source exhibit and the Hidden World Atlas. Original, local WebGL2 gallery; no hosted rendering APIs, external JavaScript libraries, telemetry or geolocation.
- Existing Worlds heritage renderer and control model adapted to a **separately labeled fictional museum**: keyboard WASD/arrow movement, drag look, touchscreen joystick, research markers, optional interpretive walls and deterministic 60-second guided tour. The source and tour modules are isolated under `titan-walk/`; later renderer deduplication may be done after parity QA, not by destabilizing the working Heritage exhibit.
- Five historical research stops linked to published HistoryLink, Air Force and Space Force sources. Their **local XYZ values have no georeferenced meaning**, and their invented room relationships must never be plotted against the real Washington complexes.
- The 3D scene deliberately uses stylized gallery sculptures, not missile engineering hardware, real silo-scale models, actual control panels or precise passage topology. It carries access disclaimers in its introduction, source panel, guided tour and no-script static fallback.
- No-JavaScript and no-WebGL2 fallback leads to `/worlds/hidden-world/titan-i-1962.html`, a script-free public evidence exhibit. A 3D failure must not leave an empty page.
- Tests: `tests/worlds-titan-gallery.test.mjs` validates source provenance, bounded fictional coordinates, no actual facility coordinates, geometry tiers and deterministic tour. The existing Hidden World browser probe now validates WASD navigation, research panels, tour control and JS-blocked fallback at four browser viewport/script profiles.
- Owned HTTPS release gate now requires `titan-walk/`, `app.mjs`, `scene.mjs`, and `tour.mjs`, with exact content markers and MIME checks. **Passing CI does not prove deployment or a physical iPhone run**.

## Cold War File 001 · Titan I (November 9, 2026)

- New conceptual historical exhibit: `/worlds/hidden-world/titan-i-1962.html` linked from both the atlas sidebar and its earlier 1962 cutaway. The interactive date lenses use CSS-only radio selectors and original, static SVG to remain visible in script-blocking phone previews.
- Four source-labeled periods: construction beginning December 1, 1959; 1962 operation; January/March 1965 stand-down/deactivation; present-day restrictions. Three educational feature lenses explain silos, crews and connecting infrastructure without supplying operational procedures.
- Companion structured provenance file: `/worlds/hidden-world/titan-i-1962-evidence.v1.json`. Facts cite named historical sources; Odessa, Warden and Quincy/Royal City are **town context**, not site coordinates, and every listed complex has `open_to_public:false` with null installation coordinates.
- Primary historical anchors: HistoryLink 10158 at https://www.historylink.org/File/10158; U.S. Air Force historical engineering context at https://www.govinfo.gov/content/pkg/GOVPUB-D103-PURL-gpo107257/pdf/GOVPUB-D103-PURL-gpo107257.pdf; and the federal missile-history report at https://www.losangeles.spaceforce.mil/Portals/16/documents/AFD-060912-023.pdf.
- Exact Washington complex geometry, orientation, passage layouts and entrance locations are **not** represented. The original illustrated relationship of three silos, control and support spaces is an intentionally non-surveyed artistic schematic. Historical plans refer to period engineering, not a current property or permission to enter.
- The earlier 12-location atlas includes regional context for the three Titan sites. Source deployment and UI checks (Node contracts, desktop/mobile Chromium including disabled JavaScript, read-only owned HTTPS release probe) now include the Titan file and source manifest.
- **Release truth:** no source merge, CI test or public-domain image link proves an Evercraft-owned public URL is live. A verified external HTTPS response and native iPhone Safari QA remain separate gates.

## Lund Building architectural study (November 9, 2026)

- New source-driven exhibit: `/worlds/hidden-world/lund-building.html`; linked from the Pacific Northwest atlas and Yakima Evidence Lab.
- Uses CSS-only year controls and an original **illustrative, not surveyed** SVG elevation for 1899 saloon, circa 1910 storefront, 1920s exterior alterations and the 1983 nomination description. No source images are embedded or assumed licensed.
- Primary document: 1983 National Register nomination for the Lund Building, pages headed **7. Description** and **8. Significance**, https://npgallery.nps.gov/GetAsset/34270517-7a19-422d-a0a6-3070adf1befa.
- Documented details: local stone load-bearing walls, a two-story structure with a truncated original corner entrance, the Alfalfa Saloon (completed 1899), circa-1910 plate-glass retail changes, segmentally arched upper windows, an approximately fourteen-foot first-floor ceiling and a metal marquee added in the 1920s. Exact panel/window proportions in the drawing are invented for illustrative purposes and explicitly labeled.
- **Critical evidence distinction:** The nomination states the Lund interior was connected by doorways to two surrounding buildings, as described by the 1983 author. It does **not** establish that those connections were underground, identify the neighbors or date the individual passageways. This is evidence for historical inter-building circulation only, not a tunnel map or public-access claim.
- Evidence ledger retains seven primary records with their original geometry/tunnel certainty flags and enriches the Lund entry with seven sourced architectural facts, a primary PDF link and explicit inference limits.
- Existing owned vault serves the static HTML without new services; source-level tests, browser viewport/JS-off tests and the public HTTPS release gate now also cover the architecture exhibit.

## Historical Evidence Lab 004 (November 4, 2026)

- Route: `/worlds/hidden-world/yakima-evidence.html`, linked from the atlas research sidebar.
- Machine-readable, no-coordinate source ledger: `/worlds/hidden-world/yakima-evidence-ledger.v1.json` (seven sourced records; all real geometry and connected tunnels marked unverified).
- This is an evidence board and responsive, script-free four-year research lens, **not a measured street model**. Its building silhouettes are deliberately illustrative.
- The National Register records the Lund Building at 5 N. Front Street, with the late nineteenth-century period of significance (https://npgallery.nps.gov/AssetDetail/NRIS/83004276). Detailed building chronology still requires the nomination form and architectural plans.
- Spokane Public Library holds a public-domain F. H. Newell view east along Yakima Avenue from the railroad tracks, dated within 1905–1915: https://lange.spokanelibrary.org/items/show/5659.
- Yakima's municipal historic register dates the Capitol Theatre at 9 S. 3rd Street to 1920 and the Union Pacific Freight Building at 104 W. Yakima Avenue to 1923–1924: https://www.yakimawa.gov/services/historic-preservation-commission/yakima-register-of-historic-places/.
- The 2018 `Hidden History of Yakima` description mentions underground tunnels, but **no specific connected tunnel alignment has been authenticated** by these sources.
- Historic Sanborn fire-insurance maps document footprints, construction and use; they do not independently prove passable subterranean tunnels. See https://www.yvl.org/services/special-collections-and-archive-services/maps-and-atlases/.
- A new read-only `scripts/probe-hidden-world-public.mjs` verifies the owned Worlds runtime identity and five artifacts (atlas, Yakima exhibit, evidence page, CSV, JSON) through the existing manual Worlds public release gate. It does not perform writes or assert physical iPhone validation.
- The Worlds vault static router was updated to resolve nested directory index requests (`/worlds/hidden-world/`), with read-only regression tests covering the entry route, exhibit and CSV MIME. This source check is separate from a live owned-host probe.

## Still required before public launch

1. Confirm an Evercraft-owned HTTPS origin actually serves the new directory route and resources with 200 responses.
2. Perform real iPhone Safari checks, including the fallback with scripts disabled and the interactive page with scripts enabled.
3. Complete parcel-scale research from fire insurance maps, historical street photographs and authorized archival plans, then label every proposed building or passage by evidence tier.
4. Obtain explicit permission before entering, filming or documenting privately owned or hazardous underground spaces.

## Next evidence work
1. Compare the actual relevant 1920 and 1950 Sanborn sheets against the exact historic street photographs and address directories.
2. Request a permitted archive research visit to the Sundquist Library for architectural drawings, business records, basement plans, oral histories and fire insurance records.
3. Establish a sourced parcel-level timeline. Only then commission measured geometry; every modeled feature must link back to a source and evidence/confidence class.
4. Confirm any physical passage with the property owner and qualified survey/structural staff. Never access a closed building, flooded underground facility or restricted property without permission.
5. Route the reviewed import schema and asset package into the owned Evercraft Worlds/Systemia stack. No live deployment has occurred.

## Files
- `index.html`: Existing 12-site regional map, now linked to Yakima exhibit.
- `yakima.html`, `yakima.css`, `yakima.js`: Source implementation of the interactive exhibit.
- `yakima-standalone.html`: All-in-one local edition.
- `yakima-research-ledger.json`: Assertions, historical evidence and research questions.
- `hidden_world_atlas_v1.csv`: Original 12-site catalog.

No photo or historical plan has been reused or embedded in the exhibit itself. The original archival public-domain photo is linked for readers to consult; any additional archive content requires a permissions review before inclusion.

## Edition 003 iPhone preview correction
The October 30 iOS screen recording showed that the in-app HTML attachment preview displayed static page text/CSS but **did not execute the scene JavaScript**: the scene canvas was blank, marker buttons were absent, and source links were not populated. Edition 003 embeds pre-rendered illustration frames and CSS-only surface/underground tabs so users see visual content even with JavaScript disabled. Full movement, dynamic evidence switching and camera controls still require a script-enabled browser. This is not a public deploy; an Evercraft-owned URL is the recommended mobile end-user delivery.
