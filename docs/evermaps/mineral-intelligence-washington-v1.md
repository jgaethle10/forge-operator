# EverMaps | Mineral Intelligence | Washington research adapter

**Owner:** Evercraft LLC. **State:** draft research capability; not a live commercial service, operating-mine tracker, or parcel-level land recommendation.

## What has been built

- Resource polygon discovery by county from official WGS FeatureServer layer 11
- Source classifications preserved without inventing mineral likelihood
- GeoJSON review queue with complete/partial source warning
- Four independent evidence feeds: resource polygons (11), material test sites (1), mine-history points (0), and mapped study-area polygons (12)
- Before/after WGS count reconciliation and duplicate OBJECTID rejection on the evidence packet
- CI contract tests and a read-only public source-count canary that records a machine-readable receipt

Datasets: Washington Geological Survey, Digital Data Series 31 v3.0, July 2026.
Primary source: https://gis.dnr.wa.gov/site1/rest/services/Public_Geology/Aggregate_Resources/FeatureServer/11

## Run

Node.js 22+, repository root:

    node --test systemia/evermaps/*.test.mjs
    node systemia/evermaps/wgs-live-canary.mjs
    node systemia/evermaps/aggregate-evidence-cli.mjs Grant ./grant-wgs-evidence

The CLI writes a new JSON evidence packet. It fails rather than overwriting an existing output file. The included material tests and historical mine locations are **independent evidence layers**, NOT attributed to nearby polygons.

For the original, narrower single-layer adapter:

    node systemia/evermaps/mineral-intelligence-cli.mjs Grant ./grant-wgs-resource

CI for this draft PR uses non-production contract tests and the source-count canary. Live counts from the canary only establish query availability and record counts. They do not validate feature geometry or site selection.

## Observed real-source validation (2026-10-27)

The canary reached all four WGS layers and checked 1,161 aggregate resource polygons, 232 test-site point records, 304 historical surface-mine markers, and one study-area polygon with county = Grant. First-record GeoJSON samples passed field and geometry validation. **These are publisher counts, not completed full-geometry ingestion or mineable prospects.**

Yakima County returned zero records in this published dataset; statewide COUNTY values in resource and study layers were Grant, Grays Harbor, Kitsap, Skagit and Spokane. Zero Yakima matches means **coverage unavailable in this specific inventory**, not that Yakima lacks aggregate resources. Pilot defaults to Grant. County-level coverage still requires geometry intersection confirmation.


## Full-county research import (review branch only)

Run from a clean output directory, Node 22+:

    node --test systemia/evermaps/*.test.mjs
    EVERMAPS_COUNTY=Grant EVERMAPS_PAGE_SIZE=100 node systemia/evermaps/wgs-full-grant-import.mjs

The script produces four WGS-source GeoJSON files, a classified map review GeoJSON, a study-envelope broad-phase candidate list, and an import receipt in evermaps-grant-full-evidence/. Source counts are checked before and after pagination, with duplicate IDs rejected. SHA-256 fingerprints cover sorted original feature payloads. Geometry checks cover closed nondegenerate rings, valid coordinates and source IDs; they do not certify every topological or property-boundary condition.

Workflow job full-grant-research-ingest also runs against public WGS, preserves files as a 30-day GitHub Actions artifact, and is intentionally non-production. A workflow success alone must not replace examination of wgs-full-import-receipt.json.

A study bounding-box overlap is a broad-phase screening observation, NOT proof that a resource polygon intersects or lies within a study. Polygon topology, ownership, permitting, ecological restrictions and material economics remain unverified. No publishable mining recommendations come from this artifact.


## Live complete Grant import and publisher spatial check (2026-10-28 UTC)

GitHub Actions fetched all **1,161** Grant resource polygons, **232** tests, **304** historical mine-site points and **one** study-area polygon. All source counts reconciled; all geometries passed the first-pass ring/coordinate/identifier audit; original ordered features were hashed for each layer. The publisher classified **700** source polygons into the map review queue, with the remainder retained in the original unfiltered source GeoJSON.

The official WGS server-side spatial query returned **1,161 intersections** with the Grant study polygon. The same server returned **zero within** matches. That second result is unexpected and must be held as an unresolved spatial-relation discrepancy rather than interpreted as proof that all resources cross study boundaries. The receipt exposes the zero and the unresolved state independently.

The source JSON, study-spatial join receipt, map-ready classified GeoJSON, and separate unmodified evidence layers are preserved as a 30-day GitHub Actions artifact on the PR. The source-evidence receipt and publisher join are reproducible but NOT a mining proposal.

### Native offline viewer

Open systemia/evermaps/research-viewer.html in a browser and use **Load WGS GeoJSON files** to select the four source GeoJSON files from the evidence artifact. The viewer uses native Canvas, not a third-party map service. It colors published classification and displays reference test/mine points and study bounds. No live basemap or rights layer is implied; the page must not be used to approve extraction.

## Evidence boundaries

1. **Geological observation:** WGS aggregate resource classification means Demonstrated, Inferred, Speculative, Not a Resource or Not Analyzed. Not a mineral discovery score.
2. **Material tests:** dated point samples, including LA Abrasion and Degradation test readings, are local historical test observations. Never assume they validate every nearby resource polygon.
3. **Mine history:** labels such as Active or Inactive describe WGS *identification-time* source data. Not independently verified 2026 operating status.
4. **Study bounds:** study polygons tell us where particular WGS mapping projects occurred. County name matching does not prove full county coverage; a future spatial coverage join is necessary.
5. **Land rights:** federal MLRS mining claims, title, surface ownership, easements, permits, zoning, protected land and tribal jurisdiction are NOT established by these geology layers.
6. **Economics:** distance, material quality, drilling, reserve tonnage, recoverability, water impacts, public health, hauling and infrastructure all require independent analysis.
7. **Spatial scale:** WGS warns these geologic maps should generally not be interpreted more finely than 1:24,000.
8. **Completeness:** absent records do not imply absent geology; incomplete counts, duplicate IDs or mismatched before/after counts block claims of complete ingestion.

## Data lifecycle and gates

A. **Read source:** ensure all four official WGS endpoints answer the canary. If not, record source unavailable and do not fabricate data.

B. **Ingest polygons and points:** run county scans, count reconciliation, raw record IDs, provenance and version record. If partial, stop at review state.

C. **Geospatial validation:** verify EPSG:4326 results, polygon validity, projected accuracy, study polygon intersection and feature quality. Cannot be inferred from only county names.

D. **Context and exclusion:** add local parcel/zoning/critical areas, road access, environmental restrictions, tribal land and BLM MLRS as distinct observed layers with metadata. Review ownership with competent land-title specialists.

E. **Domain review:** licensed qualified geologist/mining engineer reviews any proposed exploration site, including on-the-ground testing before any investment, prospect or drilling claims.

F. **Commercial readiness:** only after data quality, legal constraints, feasibility and human acceptance are evidenced should EverMaps publish commercial prospect reports.

Relevant independent claims authority: https://www.blm.gov/services/land-records/mlrs

**Not shipped:** production map UI, 3-D deposits, parcel mining suitability, operating mines, tested resource reserves, proof of permits, or paid production fulfillment.

## Phase 2: land-source coverage canary (source metadata and coarse counts only)

New adapter `systemia/evermaps/land-context.mjs` consumes *only* a verified, SHA-256-matched full Grant WGS source and creates a read-only receipt:

- **BLM active mapped mining claims**: https://nlsdbpubgis.blm.gov/arcgis/rest/services/Mining_Claims/MiningClaims/MapServer/1 . Uses a coarse envelope enclosing the imported WGS polygons. This envelope may overlap other counties, and BLM's geocoding can omit cases or map at county/section precision. Zero records would **not** establish an unencumbered mining opportunity.
- **WA DNR active surface mine reclamation permit locations**: https://gis.dnr.wa.gov/site1/rest/services/Public_Geology/Active_Surface_Mine_Permit_Sites/MapServer/0 . Queries only county-level point counts. Permit records don't establish that a mine is currently operating or give a third party extraction rights.
- **Grant County public parcel assessment map**: https://services.arcgis.com/33TOOklri9xpic7U/ArcGIS/rest/services/Grant_County_Interactive_Parcel_Map/FeatureServer/0 . Metadata-only validation, **no ownership query, no owner extraction or commercial mailing list**. The service is for assessment/planning, not a survey, legal boundaries or title. Washington public-records restrictions on commercial lists of individuals must be respected. Parcel-license and access review required before any expanded usage.

All three sources are independently probed. Source unavailable, schema changed, GIS request failed and zero matching count are separate states. A source count cannot unlock any `research-dossiers.mjs` land-rights, eligibility, zoning, or economics gate. The output is `land-source-coverage-receipt.json` in the GitHub Actions 30-day research artifact.

Reproduce after full Grant import:

    node --test systemia/evermaps/*.test.mjs
    node systemia/evermaps/land-context-cli.mjs

Do **not** produce individual property-eligibility rankings or contact lists from this stage.

## Phase 2 point-to-polygon research overlay

Added a complete, read-only Washington DNR reclamation-permit **point** ingestion to the full Grant WGS pilot. The query selects only `OBJECTID`, `MINE_PERMIT_NUMBER`, `COUNTY_NAME` and `COMMODITY_DESC`, explicitly omitting applicant/owner fields. It compares the point location against each WGS geology polygon with a conservative local point-in-polygon test, keeping the interior, boundary-uncertain, and outside counts separate. Polygons can overlap, so point matches are not deduplicated into site or permit decisions.

**Important:** WA DNR describes these locations as approximate locations with active *reclamation permits*. Neither being in a WGS geological polygon nor having a reclamation permit proves an operating mine, recoverable reserves, parcel ownership, permitted extraction or access.

Artifacts: `wa-dnr-grant-permit-points.geojson`, `wa-dnr-permit-point-geology-overlay.json`, and `wa-dnr-permit-point-overlay-receipt.json`. These come from live public WGS and WA DNR queries, require complete source counts and SHA-256 checks, and cannot authorize site recommendations. The full geologic import is a separate source, not automatically validated by a permit-point match.

Run: `node systemia/evermaps/permit-point-overlay-cli.mjs` after the complete Grant WGS import.

Official source: https://gis.dnr.wa.gov/site1/rest/services/Public_Geology/Active_Surface_Mine_Permit_Sites/MapServer/0 .

## Phase 2 zoning, state lands and protected-land source receipts
A new read-only metadata and COUNT-ONLY service probe reads three independent official GIS layers:
- Grant County unincorporated zoning published in 2018, https://services2.arcgis.com/hQZvdtFxRzJpMtdS/ArcGIS/rest/services/Zoning/FeatureServer/0. **Not verified 2026 zoning law**; municipal jurisdictions may differ.
- WA DNR managed land parcels, https://gis.dnr.wa.gov/site3/rest/services/Public_Boundaries/WADNR_PUBLIC_Cadastre_OpenData/FeatureServer/6, with mixed parcel/easement/lease interests and incomplete subsets.
- WDFW public Priority Habitats and Species polygons, https://geodataservices.wdfw.wa.gov/arcgis/rest/services/PHSOnTheWeb/PHSOnTheWebPublic/MapServer/3. This is public habitat-observation context with generalized locations and incomplete survey coverage, **not** a legal protected-land exclusion, species absence, or clearance. Do not retrieve species-level records in this pilot.

The probe requires WGS source integrity and uses the *regional WGS import bounding envelope*. It returns only source availability and counts of features meeting a bounding-envelope spatial query. This is NOT polygon-level zoning, environmental clearance, title, access or authorization to mine. No parcel owners or contact lists are retrieved. Source error or zero count never unlocks an eligibility gate.

Run after the full WGS import: `node systemia/evermaps/planning-context-cli.mjs`. Output `grant-planning-context-receipt.json` is bundled in GitHub Actions research artifacts (30-day retention).

## Evidence refresh integrity manifest

The `research-source-health-cli.mjs` command reads the **current-run** full WGS import, dossier, land-context, planning-context, permit-point overlay and WGS study-spatial receipts. It emits `source-health-manifest.json` with independently labeled statuses. An upstream failed source such as WA DNR ArcGIS `404 Service not found` is a `research_source_dependency_hold` and fails the CI research-import job while still preserving receipts through the unconditional artifact upload. The Node contract tests may remain green independently.

Source-health completion is **never** legal permission, approved mining, mineral reserves or environmental clearance. No previous observed 42-record permit scan is substituted for a missing current service. If a public layer is unavailable, keep its dossier gate unverified and use agency-maintained dataset downloads only after separate source/version/terms checks.

## 2026-10-30 source-scope correction
The older WDFW Protected Lands layer (PHS_PSNERP/MapServer/27) belongs to a Puget Sound **nearshore ecosystem project dating to circa 2006**. Its Grant envelope count of 0 was a **geographically inapplicable source selection**, not evidence of Grant County being free from protected lands. That source is retired from this pilot and replaced by WDFW's statewide public PHS polygons (layer 3). Even a zero result on statewide PHS would never prove no habitat, wetlands, tribal lands or protected areas. This correction supersedes prior mentions of WDFW 'protected land' 0 in the research receipts.

Reference service scope: https://geodataservices.wdfw.wa.gov/arcgis/rest/services/ApplicationServices/PHS_PSNERP/MapServer
Statewide PHS public service: https://geodataservices.wdfw.wa.gov/arcgis/rest/services/PHSOnTheWeb/PHSOnTheWebPublic/MapServer

## Verified-polygon sample (bounded, **not all resources**)
The script `systemia/evermaps/planning-polygon-sample-cli.mjs` loads the complete source-hashed Grant WGS import, then deterministically selects **two polygons by smallest source OBJECTID** in each WGS class: Demonstrated, Inferred, Speculative, and Not a Resource. This is a biased engineering validation sample, **not a statistically representative selection, a prospect ranking, or a parcel recommendation**.

The script transforms those eight WGS GeoJSON polygon rings into publisher-native ArcGIS polygon geometry, including ring orientation and holes, then sends a read-only `returnCountOnly=true` ArcGIS POST query to three separate publisher layers per polygon. Queries request *only* source feature counts, never landowner data, PHS species names or original source geometries. Each source independently retains unavailable vs zero vs counted status; large polygons are held rather than silently generalized. The resulting `grant-polygon-planning-sample-receipt.json` is retained in the CI evidence artifact.

A publisher-reported geometry intersection merely establishes that some source shapes overlap the uploaded historical WGS polygon. It **does not establish coverage proportion, current zoning, physical habitat presence, legal exclusion or clearance, operating mines, mineral rights, ownership or economics.** WDFW PHS public geometries may be section- or township-generalized, and unobserved habitat is not absent. Full 1,161-resource screening requires additional independent geometry/legality review.

## Usable offline geology research packet (separately gated from external GIS refresh)
The `research-packet-cli.mjs` exporter builds a searchable `research-brief.html`, sanitized `research-index.csv`, and machine-readable `research-packet.json` from the **complete WGS Grant import and exact source-hashed dossier set**. It first checks all 700 research dossiers against the full WGS source class/ID/hash and the eight evidence gates. Geologic research can remain reproducible in a run where an external WA DNR permit or BLM source is unavailable. Source health is explicitly reported as **incomplete**. No missing external data is substituted with zero or with a previous run's evidence. No packet can be produced if WGS or dossier source provenance fails.

The offline HTML provides filters by WGS published geological class, source OBJECTID, and commodity and shows nonrepresentative polygon-sample zoning, WA DNR and WDFW intersection counts **only where current-run source hashes match**. Unobserved rows show **not sampled**, not zero. No PHS species or private parcel owner fields are exported. CSV publisher-derived values are formula-injection protected. Never call this an eligible mining site list, commercial reserve inventory or excavation recommendation.

Use `research-brief.html` from the downloaded research artifact directly in a browser, no hosting or external libraries required. Source-health and all legal/access/environmental feasibility gates remain separately unknown.

## Alternate official WA DNR permit source discovery
The legacy `gis.dnr.wa.gov/site1/Public_Geology/Active_Surface_Mine_Permit_Sites/MapServer/0` began responding `404 Service not found`. WA DNR publishes an October 2026 version 4.0 GIS dataset under a *different* official `site3/Geology/Active_Surface_Mine_Permit_Sites/MapServer` root. Before changing the production importer, `permit-source-discovery.mjs` now checks both endpoints with only metadata, read-only Grant County count and a single restricted non-owner GeoJSON point. It validates geometry/schema and outputs `wa-permit-source-discovery-receipt.json` in the independently running source-canary artifact.

The discovery receipt is **not** a complete county permit import and cannot establish current mining, title, site permission or permit issuance to any user. A candidate gets promoted into the full importer only after a verified compatible live sample and full provenance/count reconciliation. The source is publicly published by WA DNR, but legal and operational limitations remain.

New service: https://gis.dnr.wa.gov/site3/rest/services/Geology/Active_Surface_Mine_Permit_Sites/MapServer

## 2026-11-04 service routing and dependency isolation

The first alternate WA DNR `site3/.../MapServer/0` returned ArcGIS `404 Layer not found`. The source discovery canary now explicitly probes **MapServer/1**, **FeatureServer/1**, and legacy **site1 MapServer/0**, with county counts and one non-owner geometry sample, before any importer promotion. Do not infer that an authoritative service root makes any specific sublayer available.

The verified-geology packet exporter is now marked `if: always()` with an independent source-hash gate and `continue-on-error` after the full-source-health step, so it can produce the WGS-only HTML/CSV/JSON deliverable even when BLM or DNR ancillary sources cannot refresh. WGS-source absence or bad hashes still blocks packet generation. Full dependency validation retains its own failure status; **separate artifacts do not convert a failed full refresh into a green run**.

## One-file verified offline map (November 2026)
`preloaded-viewer-cli.mjs` now generates `research-map-preloaded.html` that can be opened without selecting four source GeoJSON files. The code runs `auditGeojsonCollection` against every complete WGS layer, verifies each layer against the original full import's SHA-256, then embeds only the four public WGS GeoJSON layers inside our own `research-viewer.html` template. No ArcGIS request, external map provider, owner names, permit data, or basemap is required at page open. The browser is still able to select local files if desired. All external attributes are script-escaped to prevent malicious HTML injection.

**No permit point layer is preloaded** when the WA DNR permit source fails current refresh. The offline file is geography research, not mineral-rights or zoning clearance. Source-complete 1,161/232/304/1 layer counts must match the audit for generation.

## 2026-11-09: WA DNR DDS-34 v4.0 schema migration

The retired `site1` reclamation-permit service returns ArcGIS 404. The current WA DNR **October 2026 DDS-34 version 4** public permit-point service is `https://gis.dnr.wa.gov/site3/rest/services/Geology/Active_Surface_Mine_Permit_Sites/MapServer/1`. Required schema: `OBJECTID`, `PERMIT_NO`, `COUNTY`, `COMMODITY`. The read-only importer queries only these four attributes and point geometry, restricts to `COUNTY='Grant'`, reconciles before/after county counts, verifies source feature IDs and SHA hashes, and joins approximate locations to the verified WGS geology map. Applicant names are deliberately **not retrieved** even though the publisher's layer contains them.

These mapped locations describe mines with active **reclamation permits**, not proof of current operation, land title, economic reserves, permission to extract, or site accessibility. Earlier 42-point findings were from a different dataset vintage, not an automatically trusted current count.

Official DNR layer: https://gis.dnr.wa.gov/site3/rest/services/Geology/Active_Surface_Mine_Permit_Sites/MapServer/1

### Export privacy invariant
Regardless of an ArcGIS server's handling of `outFields`, the WA permit-point adapter now constructs a **new** feature with only `OBJECTID`, `PERMIT_NO`, `COUNTY`, `COMMODITY`, and normalized point coordinates. Any unsolicited applicant, address, owner, or other attributes are dropped before hashing, saving, joining, or rendering. Unit tests simulate an upstream server returning applicant and address values and prove the evidence export excludes them.

**Passing November 9 local / November 10 UTC acceptance:** https://github.com/jgaethle10/forge-operator/actions/runs/42738307100 achieved 56/56 unit tests and 3/3 jobs passing; 48 DNR v4 Grant approximate reclamation-permit points, WGS geology polygon import 1,161, material tests 232, historical mine points 304, one study area, 700 research dossiers, and 8 WGS polygon planning sample checks all source-verified. DNR point geography intersects WGS classes: 29 Demonstrated, 6 Inferred, 10 Speculative, 3 Not a Resource, with no legal title/permissions findings. The only remaining publisher-spatial issue is WGS anomalous zero `within`, explicitly unresolved, rather than a newly confirmed map containment fact. No production rollout or mining advice is authorized.

## iPhone script-disabled map preview (November 9, 2026)
An iPhone screen recording demonstrated an empty Canvas and a misleading 'No source files loaded' status despite a complete, preloaded 6.9MB HTML file. Some mobile file viewers display HTML/CSS but disable JavaScript. The builder now embeds a zero-JavaScript, source-derived SVG preview of the verified WGS polygons, test sites, historic mines and study boundary. The preview appears above controls on iPhone until JavaScript successfully initializes the interactive Canvas; otherwise it remains visible with a clear label. Publisher data are still checked against all four SHA-256 source receipts before creation. This fallback is a static geographic overview, not a full interactive map. True iPhone pan/zoom requires serving the self-contained map at an HTTPS URL rather than opening a ChatGPT download preview.
