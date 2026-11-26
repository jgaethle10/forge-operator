# GEMS-008C: move now on public sources, no email gate

**Status:** public-source metadata pipeline IMPLEMENTED, synthetic-tested; **live NBMG REST feature response not observed in this chat** (local container has no DNS/network access to the service). Do not invent a successful fetch, feature count, independent fault set, or official competition score.

The founder explicitly directed us to work with publicly available geologic materials rather than waiting on publisher permission as a prerequisite for basic investigation. Public availability allows us to **read, inspect, validate provenance and compare under applicable terms**. NBMG's official copyright page states CC BY 4.0 for site works and requests compliance with publication-specific notices. DOE/NLR sponsor redistribution and competition rights still need examination before source-data transfer or candidate submission; they **do not block this exploratory metadata research**.

## Actual evidence already processed in this conversation

The attached original GEMS-008B ZIP has SHA256 `e4d73498f217734d7c886e1129dd991965b085450ca5c8864c605a7f379ef57c`, with intact acquired Petrified Spring PDF bytes (51,894,715 bytes, SHA256 `79676005376b460fe80583e41871db6f33e99dfaa25cfc1ce7cabe7c85ab35b3`). The original private manifest tracks the map in EPSG:26911 and an exact neatline (not fault-specific geometry), overlapping 61,272 valid GeoDAWN cell centers as previously measured in GEMS-008B. The PDF structural audit of the **real PDF bytes** with PyMuPDF found:
- **63 PDF named optional-content display groups**, including `GeoLines`, `Fault Ball`, and `Inclined Fault`;
- **6,105** vector drawing paths in total, including **5,779** generic `GeoLines` drawing paths;
- **22,363** line drawing operations on `GeoLines`, with 4,279 paths at approximately 0.48 pt, 1,499 at ~0.96 pt, and one 0.72 pt line.

These are **graphic primitives** rather than attributed fault polylines. Neither path count nor PDF OCG name establishes surveyed fault traces, geological truth, exact mask intersection, or rights for redistribution. The independent public fault data source must supply actual attribution or original field-source lineage.

## Official public live GIS lead

The NBMG OneGeology 1:24k statewide ArcGIS REST **MapServer layer 4** is documented as `US-NV_NBMG_24k_Faults` (polyline features) with **`source`, `faultType`, `positionalAccuracy`, `observationMethod`** and `OBJECTID` attributes. Layer metadata:
https://gisweb.unr.edu/nbmg/rest/services/Geology/NBMG_Geology/MapServer/4

The new `gems_008c_nbmg_service_scout.py` only prepares or performs **one bounded metadata-only HTTPS GET** to that exact NBMG REST layer, with `returnGeometry=false`, `resultRecordCount=500`, explicit 26911 envelope derived from the owner-private GEMS-008B manifest, 1MiB response cap, 12s timeout, no redirects, attribute and record validation, and automatic failure on truncation or records hitting the 500 limit. All output receipts are private and write-once (mode 0600). No feature geometries, training masks, predicted faults, new candidate rasters or scored submissions are exported. Even if NBMG returns apparent Petrified Spring `source` matches, the service was compiled for OneGeology in 2013, while the Petrified Spring publication was released in 2020. **Source citations and dates must be analyzed, not assumed.** The service may not contain this 2020 study. A zero-record return would NOT mean the Petrified Spring map contains no faults.

The accompanying `test_gems_008c_nbmg_service_scout.py` checks fail-closed behavior on corrupt/missing attributes, duplicates, geometry disclosure, truncation, and source PDF hash/manifest validation. Only synthetic fixtures in GitHub CI.

## Original Work next execution without any email

In the original Work thread's private research workspace, with the actual GEMS-008B `manifest.json` and original verified Petrified Spring sheet1 PDF, check out the latest tested GitHub PR #2259 commit and run:

```bash
cd systemia/mission-bridge/gems
python3 -m unittest -v test_gems_008c_nbmg_service_scout.py

# Explicit one-request public source query, no publisher email:
python3 gems_008c_nbmg_service_scout.py \
  --manifest /PRIVATE/GEMS008B/manifest.json \
  --pdf /PRIVATE/GEMS008B/OF2020-01_sheet1.pdf \
  --receipt /PRIVATE/NEW/GEMS008C_NBMG_Fault_Source_Metadata.json \
  --allow-public-nbmg-query
```

If the official service is unavailable, 404, returns more than 499 features, errors, or omits fields, retain the exact blocker; do not loosen the network, geographic, scope or batch restrictions silently. **Don't start mail outreach.** This audit is a *public layer source-field probe*, not a fault validation or exact private-label intersection. Use results to identify which source publications really contributed to the service; if original fault-specific vector GIS and authorized use become available, then perform properly source-labeled private finite-mask geometry/lineage checks under a new pre-registered protocol.

## Other public-source work in parallel

Review and index the original publication references and legend from the acquired PDF. Search existing NBMG public 1:12k, 1:24k or more recent downloadable GIS layers for source metadata and actual field mapping lineage rather than guessing paths for sheet 2. The Granite Range 2005 PDF returned 404 at the stale URL and has conflicting 1:24k vs 1:50k scale citations; do not claim acquisition or silently resolve map scale. These tasks require no permission email to **begin source/provenance research**. No external dataset qualified yet, and that should remain explicit.

**Safety invariants:** GEMS-001 #330339 stays selected (official public DTI 0.0552); no change to GEMS-002. GEMS-004/006 mapped-fault-proxy signals do not establish hidden new-fault improvement. GEMS-005 directional-feature ablation rejected. GEMS-007 is still unrun/blocked at its frozen bin-7 quota with 0 eligible training negatives. No model fitting, scored candidate, new competition submission, public sharing of original organizer raster or private samples, or paid compute here. Preserve source SHA records and GitHub issue #2260.
