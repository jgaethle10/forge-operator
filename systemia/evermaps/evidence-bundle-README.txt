EVERCRAFT EVERMAPS | GRANT COUNTY MINERAL INTELLIGENCE RESEARCH BUNDLE
READ-ONLY REGIONAL GEOLOGICAL EVIDENCE. NOT LAND-USE, ENVIRONMENTAL OR EXTRACTION APPROVAL.

HOW TO VIEW
1. Download and extract the GitHub Actions artifact named "evermaps-grant-full-research-evidence".
2. Open research-viewer.html in a modern browser.
3. Use "Load WGS GeoJSON files" to select available files from the extracted folder:
   wgs-resources.geojson, wgs-tests.geojson, wgs-mineHistory.geojson,
   wgs-studies.geojson and (if present/current) wa-dnr-grant-permit-points.geojson.
4. Enable/disable map layers, zoom and select source points or geological polygons.

SOURCE RECEIPTS
- wgs-full-import-receipt.json: WGS count completeness, schema and feature geometry fingerprints.
- wgs-research-dossiers.json: geology-only research evidence; rights and feasibility unverified.
- land-source-coverage-receipt.json: BLM/WA DNR/Grant GIS source coverage and limitations.
- grant-planning-context-receipt.json: coarse source coverage from historical zoning,
  WA DNR managed interests and statewide WDFW public habitat polygons. Counts
  are intersections with the source REGION bounding envelope, not specific parcels.
- grant-polygon-planning-sample-receipt.json: limited 8-polygon publisher-side
  count comparisons. Not representative of the 1,161 WGS resource polygons.
- wa-dnr-permit-point-overlay-receipt.json: presence/absence of an up-to-date
  approximate permit-point dataset. A source 404 means UNAVAILABLE, not zero.
- source-health-manifest.json: whether all required feeds were current
  in THIS run. A missing feed holds the latest full refresh.

SOURCE MEANING
WGS labels (Demonstrated, Inferred, Speculative, Not a Resource, Not Analyzed)
are published regional geology evidence, not saleable reserves or ranked prospects.
WA DNR point locations indicate approximate reclamation permit locations, not
verified operation or extraction permission. DNR-managed parcel interests are not
necessarily state-owned land open to the public. BLM mapped-claim absence cannot
establish title clearance. WDFW PHS polygons are habitat observations that may be
generalized and incomplete; absence is NOT environmental clearance. The WDFW Puget
Sound nearshore "Protected Lands" dataset previously queried was geographically
inapplicable to Grant County and has been retired.

NO PERSONAL DATA / NO OWNER HARVESTING
The research source probes do not request parcel owner names or PHS species details.
The viewer displays only data the user manually opens. No network call is performed
by the standalone viewer.

REQUIRED BEFORE SITE DECISIONS
Verify current 2026 zoning (2018 map is historical), county/municipal jurisdiction,
surface/mineral rights, parcel boundaries, protected/tribal and critical areas,
water, roads, access, materials tests, geotechnical feasibility, economics, current
permit status, and professional qualified geologist/land-use review.

Code and reviews: https://github.com/jgaethle10/forge-operator/pull/1681
