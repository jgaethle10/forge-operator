# FAIE Land History: Historical Preservation Is Half the Mission

**Canonical Evercraft direction (November 19, 2026):** FAIE has two inseparable responsibilities: (1) scan physical-world risks and opportunities at a location, and (2) preserve the source-backed, changing and older history of that land in an **Evercraft-owned, queryable and growing archive**. Do not reduce FAIE to a transient risk-score website.

## Historical questions a scan should eventually answer

- **Land and water through time:** streams and waterways, floods, droughts, wetlands, irrigation and reservoirs, geology, erosion and changing shorelines.
- **Human land use:** agriculture, industrial sites, infrastructure, road/rail alignments, buildings, previous land cover, maps, plats and public permits, with dates and limitations.
- **Impacts and recovery:** verified disasters, insured area-level losses, wildfire, landslides, hazardous sites, remediations and infrastructure failures. An absence of claims is not evidence of safety.
- **Cultural and environmental history:** publicly documented local history, Indigenous knowledge and stewardship **with source permission and appropriate sensitivity**, without publishing protected archaeological locations, burial locations or private family/owner histories.
- **Evidence change:** when an official map, study, observation or published account is corrected or superseded, preserve earlier versions rather than quietly replacing them.
- **Timewalk:** feed approved dated source metadata into Evercraft Worlds Timewalk only when period, region and rights are grounded. A reconstructed scene is a visualization, not an original historic photograph.

## Already implemented, first increment

The history ledger is local **SQLite** at `<FAIE_EDGE_STATE_DIR>/history/faie-land-history.sqlite` (or the operator-supplied runtime stateDir in tests). Records contain public named-region keys only, chronology start/end, precision, category, source family/record ID, original official HTTPS link, source publication/update dates when known, collection time, geographic scope, evidence state, usage rights, a limited public metric subset and a content SHA-256 with a previous-row hash link. Same version of a source fact deduplicates; a changed version becomes a new historical row. Chain inspection detects ordinary alteration but **is not equivalent to offsite notarization**. The database needs owner-managed durable disks and tested backups to survive hardware failure.

The *official five-minute collector* is the only automatic source of new records. Its allowlist initially includes USGS Water Data, NWS alerts, NWPS gauges and U.S. Drought Monitor; backfill picks up previously admitted records from those families. Radar, unverified Worldstate data, customer questions, coordinates, site-scan payloads and visitor identity **never auto-enter this shared history**. A consumer-initiated point scan remains ephemeral by default. A separate authenticated, consented private-site archive can be added later; never pretend this regional ledger is parcel history.

A separate **owner-operated curator** can import old public map/record *metadata* using an explicitly sourced manifest, after a dry run and `FAIE_HISTORY_CURATOR_APPROVED=yes` with `--apply`. Public endpoints are **read-only**: `GET /api/faie/history/regions` lists archived public regions, and `GET /api/faie/history/region?key=yakima-wa` exposes sourced chronological events for one public named area. No public upload or write endpoint is installed.

## First archives to integrate, not yet ingested

1. USGS Historical Topographic Map Collection / topoView: published historical topographic sheets dating to the late 1800s. Index map publication date, quadrangle coverage and scale; cite original metadata and do not copy map image bytes without documented reuse rights. https://www.usgs.gov/tools/topoview
2. Yakima County historical aerials listed in Washington Rural Heritage, plus USDA historical imagery catalogs. Verify footprint, acquisition date, attribution and download/redistribution rights before copying imagery. https://www.washingtonruralheritage.org/digital/collection/yvl/id/804/
3. Yakima Valley Libraries map, plat and Sanborn holdings: source-linked historic streets, buildings, land use and maps; distinguish publication date from date represented. https://www.yvl.org/services/special-collections-and-archive-services/maps-and-atlases/
4. Washington State DNR Public Land Survey Office and historical land surveys, where publicly accessible and permitted. Do not expose private owner fields, unverified boundary changes or sensitive locations. https://dnr.wa.gov/buy-maps-or-survey-data
5. FEMA Flood Hazard Layer revisions, NOAA Storm Events, public NFIP area-level insurance claims and USDA RMA crop indemnities: preserve historical periods and scope, but never geocode anonymized insurance loss records to a particular address. See GitHub issue #2388.
6. National Archives catalog descriptions for cartographic, industrial, engineering and environmental records, subject to record-level metadata and rights. https://www.archives.gov/research/catalog/help/api

**Not connected** merely because listed here. Each source requires a separate adapter, permission and geographic/date-precision audit, deterministic tests, and an independent public source receipt before the status changes.

## Import contract, owner only

`FAIE_EDGE_STATE_DIR=/owned/persistent/faie node scripts/faie-land-history.mjs status`
`FAIE_EDGE_STATE_DIR=/owned/persistent/faie node scripts/faie-land-history.mjs timeline yakima-wa`
`FAIE_EDGE_STATE_DIR=/owned/persistent/faie node scripts/faie-land-history.mjs import /path/to/reviewed-public-metadata.json` (dry run)
`FAIE_EDGE_STATE_DIR=/owned/persistent/faie FAIE_HISTORY_CURATOR_APPROVED=yes node scripts/faie-land-history.mjs import /path/to/reviewed-public-metadata.json --apply`

Manifest: `{"schema":"evercraft.faie.curated-public-history.v1","records":[{"land_id":"region:yakima-wa","source_family":"usgs-historical-topo","source_record_id":"<actual verified map ID>","category":"historical_map","evidence_state":"REPORTED","event_start":"1880-01-01","event_end":"1880-12-31","time_precision":"year","summary":"<evidence-backed actual map description>","source_url":"https://ngmdb.usgs.gov/topoview/viewer/","geography_scope":"<verified sheet coverage>","usage_rights":"metadata_only_rights_unverified"}]}`. Placeholders are **not** real records and must not be imported.

## No shortcuts

- Historical **event time**, source publication/update date and date we archived it are different concepts. Missing dates are unknown, not today's date.
- A map or source that covers a region may not establish history at a particular property. Historical map coverage does not establish today's ownership, permitted land use, legal water right or a flood claim.
- Public data can still contain sensitive locations. Apply an explicit restricted-evidence review before publishing indigenous sites, archaeological resources, burial sites or personal records.
- Hash-linked rows can detect some alterations, not prevent a privileged operator from replacing the entire database and chain. Export signed checkpoints and maintain verified off-device backups as separate operational work.
- The public archive must remain useful even when a source has zero records. Label gaps rather than inventing a complete timeline.
- Journal, Systemia missions and GitHub preserve source code, release receipts and governance. Actual historical rows live on Evercraft-owned durable storage; **do not store full private databases in GitHub**.
