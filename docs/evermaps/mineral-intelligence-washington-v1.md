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
