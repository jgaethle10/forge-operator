# Evercraft Worlds integration branch

Staged static route: `/worlds/hidden-world/` on an Evercraft-owned host serving the repository `public/` directory. This is source staging, **not evidence of deployment**. The package uses a single-file Yakima exhibit (`yakima-standalone.html`) and relative links. A successful HTTPS fetch, iPhone Safari test, and the established Worlds public release gate are required before declaring it live.

---

# Evercraft Hidden World Atlas · Field Edition 003

**Status:** Working, local/offline-capable historical exploration prototype. Created October 30, 2026. **Not deployed on Systemia or Evercraft Worlds.**

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
