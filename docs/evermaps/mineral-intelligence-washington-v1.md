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
