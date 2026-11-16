# American Infrastructure Watch v0.14 · Pacific Northwest verified research preview

## Deployment status
**Development draft only. Not merged, not deployed publicly, and not a current safety alert service.** The complete self-contained blue/white regional explorer is \`public/infrastructure-watch/pnw-2026.html\`. The national dashboard links to the Yakima County preset. Records are embedded, so this research page needs no third-party map or API dependency after opening.

## Source and classification reconciliation
All figures derive from FHWA 2026 SNBI state downloads with integrity checks completed in GitHub Actions.

| State | Raw records | FHWA classified total | Good | Fair | Poor | Unclassified | Raw JSON SHA-256 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Washington | 8,619 | 8,619 | 4,298 | 3,918 | 403 | 0 | c97fb57339f8f7bd9ae82cb807814443fb7cd8bb9fb99c45adc74f2ae3912c79 |
| Idaho | 4,645 | 4,645 | 1,644 | 2,753 | 248 | 0 | e1e0c3c4024ad43e97e8123d9dc8df3db45910d4278ee06000e03fde395a43d7 |
| Oregon | 8,326 | 8,325 | 2,470 | 5,426 | 429 | 1 | 773af32721950315adb5b5cb64560ef698d3752dabd7ac7c3d5cc41d631bdcf2 |
| **Total** | **21,590** | **21,589** | **8,412** | **12,097** | **1,080** | **1** | |

**Oregon exception:** Official 2026 FHWA Good/Fair/Poor table counts 8,325. The raw OR26.json contains one additional \`BC12=N\` record (\`000013570-00286\`, DUNN DAM-BLITZEN RIVER). The state-specific, exact SHA-pinned reconciliation retains it as unclassified and does not alter or reduce the 8,325 published classified count. The *generic* importer still rejects raw vs published count mismatches. Do not call the N record structurally dangerous.

## Washington geographic provenance
Official BL02 county codes, not spatial approximations. Among 8,619 Washington records, 8,060 recognized county codes, 559 unassigned (556 with BL02 absent; 3 with code 0). Yakima County (BL02=077): 531 records, 290 Good / 214 Fair / 27 Poor. The older Yakima-area bounding-box count (620 / 41 Poor) is not a county count. County codes have not yet been integrated into Idaho or Oregon browser datasets.

Coordinate QA: WA 8,618 plottable, one retained for review; ID 4,642 plottable, three retained for review; Oregon 8,326 plottable in broad geographic bounds. These are only regional coordinate sanity checks, not current location proof, bridge-route permission or safety certification.

## Verification and receipts
- [Live PNW imports and missing-county diagnostics, GitHub Actions](https://github.com/jgaethle10/forge-operator/actions/runs/43779517275): all jobs passed, including Idaho official count, Oregon source exception, and Washington BL02 missingness.
- Original source https://www.fhwa.dot.gov/bridge/nbi/nbi_data_2026.cfm
- Condition totals https://www.fhwa.dot.gov/bridge/nbi/no10/condition26.cfm
- FHWA inspection use limitation https://www.fhwa.dot.gov/bridge/nbi/nbi_data.cfm
- Known blockers tracked in issue #1955 (Massachusetts/Mississippi URL collision and Virgin Islands data) and issue #2072 (Washington missing BL02 fields).

## Safety and product interpretation
- \`Poor\` means a *historical condition classification*, not current imminent danger.
- The app has **no live closure, traffic restriction, evacuation or emergency feed**.
- Records are source-linked; records without plausible coordinates remain searchable but are not plotted.
- No national 2026 completeness claim: this is three states only. Washington, D.C. is a separate verified pilot (261 records).
- Required before public launch: owned hosting, service health monitoring, repair/funding records tied to actual assets, full source date/freshness labels, accessibility review, and current authoritative warning feeds for any danger labels.
