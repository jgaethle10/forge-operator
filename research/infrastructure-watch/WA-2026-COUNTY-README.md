# American Infrastructure Watch v0.13: Washington county bridge explorer

**Status:** Evidence-gated Evercraft development release. Not an emergency service or production deployment. Dataset: FHWA 2026 SNBI Washington state file, a historical bridge inventory.

## Verified facts
- FHWA state file: 8,619 Washington bridge records. 4,298 Good, 3,918 Fair, 403 Poor.
- Original official JSON: https://www.fhwa.dot.gov/bridge/nbi/2026/JSON/WA26.json
- SHA-256: `c97fb57339f8f7bd9ae82cb807814443fb7cd8bb9fb99c45adc74f2ae3912c79`.
- 2026 county assignment uses original `BL02` (3-digit county code), **not map coordinate estimation**. Codes follow WSDOT bridge manual Table BL02 / Census FIPS.
- 8,060 records assigned to a Washington county; 559 have missing/invalid county codes and are retained as `Unassigned`.
- Yakima County (`077`): 531 bridges, 290 Good, 214 Fair, 27 Poor.
- Prior Yakima *geographic rectangle* remains separately selectable: 620 bridges, 41 Poor. The rectangle and county are **not the same population**.
- One coordinate falls outside the broad Washington geographic bounds; retained in the searchable database but not plotted.

## Safety interpretation
Poor condition reports are historical inspection classifications. They are not an official emergency warning, an imminent-collapse alert, or evidence a bridge is closed. No bridge should be tagged "immediate danger" based on the rating alone. FHWA warns its inventory is not suitable for current route clearance.

## User-facing functions
- County drop-down plus all 39 county comparison table, including a separate `Unassigned` group.
- Bridge name/ID search, Good/Fair/Poor filters, geographic search boxes, clickable coordinate view, record-level FHWA source, and CSV exports.
- Entire UI and verified record indexes are embedded in the HTML for basic offline use. The coordinate preview is **not** a street basemap, county boundary polygon, or navigation tool.

## Validation
- GitHub Actions workflow: https://github.com/jgaethle10/forge-operator/actions/runs/43137616919 (all four jobs passed, including the county provenance audit).
- Browser at 390px: Yakima County 531, Yakima Poor 27, Unassigned 559, rectangle 620, rectangle Poor 41; zero JS errors, no horizontal overflow. Export contained exactly 27 FHWA county-coded Poor reports for Yakima County.
- Synthetic local UI tests were only used to validate behavior, not shipped as real bridge findings.

## Outstanding
- Draft PR, unmerged; full national 2026 inventory and owned hosted API not deployed.
- Known 2026 FHWA federal source discrepancies: Massachusetts/Mississippi link collision and U.S. Virgin Islands 24 JSON objects vs 23 reported (issue #1955).
- County assignment is as reported in the inventory, not an independent verification of current physical location. Funding and repair status are not inferred from a bridge's condition grade.

## Evidence sources
- FHWA NBI 2026: https://www.fhwa.dot.gov/bridge/nbi/nbi_data_2026.cfm
- FHWA NBI data caveats: https://www.fhwa.dot.gov/bridge/nbi/nbi_data.cfm
- FHWA SNBI crosswalk: https://www.fhwa.dot.gov/bridge/snbi/datacrosswalk.cfm
- WSDOT Bridge Inspection Manual (BL02): https://wsdot.wa.gov/publications/manuals/fulltext/M36-64/Chapter2.pdf
- Evercraft draft PR: https://github.com/jgaethle10/forge-operator/pull/1884