# GEMS-008D | NBMG public alternate active-fault metadata source audit

**Status: ENGINEERING ONLY pending scientific CI and original Work live probe.** GEMS-008C is completed as an **endpoint failure**, not a geological result. The fixed `gisweb.unr.edu/nbmg/rest/services/Geology/NBMG_Geology/MapServer/4/query` returned HTTP 200 carrying ArcGIS `error: {code:404, message:"Service not found"}` (exact error body SHA256 `3a5833b82cbe6a06a47c30047d94be886deda8a57843ae0e2bc6ec4d67f54fef`). No NBMG 24k feature records, fault attributes, valid-mask overlaps, or independent validation labels were observed. GEMS-008C owner-private evidence ZIP SHA256 `18955d8c1c6607d365dafcf4fc18f45c6b19b21ca325b23de773c85d7d21b1bf`. The existing 24k REST service **directory appears in search caches despite live failure**. Never treat indexed service metadata as live, successful feature access.

## Verified official alternative, but a DIFFERENT source lineage

NBMG's official ArcGIS REST layer `https://web2.nbmg.unr.edu/arcgis/rest/services/NV_Data/NVActiveFaults/MapServer/0` currently displays an **ActiveFault polyline Feature Layer** and its **Query** child page (confirmed in an independent public web read, Nov 26, 2026). Fields include `OBJECTID`, `FeatureURI`, `Name`, `Source`, `PositionAccuracy`, `ObservationMethod`, `FeatureType`. The description says NBMG assembled an NGDS active-fault data service, **not** the OneGeology 2013 1:24,000 mapping and **not** original 2020 Petrified Spring GIS. It must remain a separate, legacy source candidate, with common USGS/QFault/INGENIOUS provenance suspected, **not presumed independent**. Service page: https://web2.nbmg.unr.edu/arcgis/rest/services/NV_Data/NVActiveFaults/MapServer/0 . Query page: https://web2.nbmg.unr.edu/arcgis/rest/services/NV_Data/NVActiveFaults/MapServer/0/query . Neither page-view establishes successful live REST **feature response** in this session.

The alternate `gems_008d_nbmg_activefault_probe.py` intentionally requires the **already hash-pinned original Petrified Spring PDF and GEMS-008B private source manifest** before even constructing its bounded spatial query. It derives the same EPSG:26911 map-neatline **ENVELOPE ONLY**, not actual map fault trace geometry, and asks for NBMG active-fault **attributed metadata only**, `returnGeometry=false`. A single explicit live run makes at most (a) one official metadata preflight GET and (b) if the exact schema matches, one 100-record-capped ArcGIS query GET. Both requests are same-source, HTTPS, no redirects, no ambient proxies, 1 MiB maximum response bytes, 12s timeouts. It fails closed on ArcGIS JSON errors within HTTP 200, absent source fields, duplicate IDs, truncation or exactly the 100-record cap. Write-once 0600 receipt only if the whole audit passes; on failure there is no success receipt. **Do not relax a quota or widen an envelope on a failure; inspect a prospective revised protocol first.**

The source fields may return non-Petrified-Spring legacy source names: this is scientifically useful for *lineage research only*. The retrieved data do not establish independently observed faults, source-map attribution for 2020, or valid-mask line intersections. A zero-record result is not proof the Petrified Spring sheet contains no faults. Public source terms may allow research inspection, but competition sponsor-sharing rights remain separate.

## Original Work bounded replay (no publisher email, no model fitting)

Repository `jgaethle10/forge-operator`, existing PR #2259 / issue #2260, branch `research/gems-systemia-bridge-20261118`. Before live operation, verify exact current GitHub commit and green `gems-scientific-unit-tests` and `admission-contract` jobs. Use original owner-private files, unchanged hashes:

- Petrified Spring original sheet 1 PDF SHA256 `79676005376b460fe80583e41871db6f33e99dfaa25cfc1ce7cabe7c85ab35b3`.
- GEMS-008B private manifest with its original NEATLINE and ownership/rights flags.
- Original GEMS-008B research archive SHA256 `e4d73498f217734d7c886e1129dd991965b085450ca5c8864c605a7f379ef57c`, and original GEMS-008C archive SHA256 `18955d8c1c6607d365dafcf4fc18f45c6b19b21ca325b23de773c85d7d21b1bf`.

```bash
cd systemia/mission-bridge/gems
python3 -m unittest -v test_gems_008d_nbmg_activefault_probe.py

# Offline schema-bound public request plan:
python3 gems_008d_nbmg_activefault_probe.py \
  --manifest /PRIVATE/GEMS008B/manifest.json \
  --pdf /PRIVATE/GEMS008B/OF2020-01_sheet1.pdf \
  --receipt /PRIVATE/NEW/GEMS008D_Offline_Public_Request_Plan.json

# Explicit owner-authorized two-GET official service probe, NEW private path:
python3 gems_008d_nbmg_activefault_probe.py \
  --manifest /PRIVATE/GEMS008B/manifest.json \
  --pdf /PRIVATE/GEMS008B/OF2020-01_sheet1.pdf \
  --receipt /PRIVATE/NEW/GEMS008D_NBMG_ActiveFault_Source_Metadata.json \
  --allow-public-nbmg-query
```

Record exact HTTP/source status in the private Work execution log. If schema/fetch fails, report a source-access blocker. If it succeeds, summarize `Source`, `Name`, `PositionAccuracy`, `ObservationMethod`, `FeatureURI` and `FeatureType` distributions, classify whether any cited publications could actually be new field geology rather than shared QFault/INGENIOUS lineage, and pursue *original document* citations if promising. Do not use resulting fault lists as true labels or train on them.

## Required continuing controls

No model fitting, no original organizer downloads, no spatial disclosure of private fault/diagnostic sample coordinates in public GitHub, no new candidate TIFF, no DrivenData entry, no paid compute, no automatic selection. GEMS-001 #330339 remains selected with public official DTI 0.0552. GEMS-007 remains blocked before model fit at its frozen distance-bin 7 (0 eligible samples, 5 required). GEMS-004/005/006 scientific receipts unchanged. No actual independent validation dataset qualified.
