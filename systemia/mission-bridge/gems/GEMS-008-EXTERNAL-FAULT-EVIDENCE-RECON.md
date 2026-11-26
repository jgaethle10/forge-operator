# GEMS-008 | Independent fault-evidence reconnaissance, not another training run

**Status:** PRE-REGISTERED READ-ONLY SOURCE AUDIT ONLY. No independent external fault labels or external GeoDAWN-compatible 19-band features have been verified. No original organizer data are published here. No GEMS-008 model score, candidate raster, official score, or submit action exists.

**Motivation (founder-reported original Work evidence, Nov 26 UTC):**
- GEMS-004 rejected hard negatives: full-area mapped-known-fault proxy DTI 0.04419989 vs 0.07104721 baseline; matched random 0.07381975.
- GEMS-006 independently resampled the training negatives (seed 1306), confirming matched-control advantage 0.07032250 -> 0.07372316 (+4.84%) on the SAME three northern mapped-fault folds.
- GEMS-005 exact parity passed; 34+4 directional features lost 0.07104721 -> 0.07006229 (-1.39%) and were rejected.
- GEMS-007's **frozen** quota method was not executable on the pre-exposed GEMS-002 southern geography: northern-trained bin 7 (>200 through 320 pixels) required 5 fresh negatives but had **0 eligible** after north-only masks, 30-pixel boundary/fault-component embargo (5 crossing components). Both sampling seeds 306/1306 had the same structural absence. No fit, no score, no negative or positive transfer result. Preserve investigation ZIP SHA256 `bba160237f4e29f0542df0192eea9ca44f7939314aa92a45ab612695844997b9` and comment [#7184237735](https://github.com/jgaethle10/forge-operator/issues/2260#issuecomment-7184237735). **Do not alter bin quotas and relabel it a GEMS-007 replication.**

## Mission priority: actual independent geologic evidence

1. **Find mapped fault traces with traceable primary survey/mapping lineage and public access.** Seek original field mapping, lidar-interpreted scarps, independently validated trace geometry, documented release date, scale, uncertainty and descriptive fault type. The existence of a public GIS file is not independence proof.
2. **Determine whether usable evaluation geography is truly disjoint from all GEMS-001/002/004/005/006 label exposure, region tuning, and map-source lineage.** GEMS-002 previously evaluated south. GEMS-004/005/006 re-used northern segment folds. Do not call either region untouched. Distinguish *external annotations* from a *clean, untouched geographic holdout*.
3. **Check whether the original GeoDAWN feature stack and scoring mask actually cover a proposed test region.** The organizer grid is 3292 x 3730, EPSG:32611, 100 m pixels, rectangular bounds E 243350–572550, N 4135550–4508550. Valid cells are a strict subset. If a truly new region lies outside the original footprint, the original 19 raw bands/34 derived features and official mask are NOT automatically available. No out-of-footprint model score or comparison without independently sourced compatible features, grid/semantic QA, and a separate justified evaluation design.
4. **Map source dependence and leakage.** Many Nevada datasets copy or derive USGS QFault/NBMG materials. Treat duplicates/recompilations as a SINGLE mapping lineage, not independent labels. Compare map citations, map series, fault identifiers, geometry provenance, compilation date, traced source maps, and any known organizer mapped-fault dataset lineage. Spatial non-overlap alone is insufficient. Inferred faults are not necessarily field-confirmed faults; unmapped locations are *unknown*, not confirmed negatives.
5. **Check competition rights separately from public access.** Read and save actual official license and usage/shareability clauses, including any sponsor-sharing requirement. A "public domain" map viewer banner or free download doesn't automatically answer the rules for all mixed source contributions.
6. **Produce a provenance and feasibility report FIRST.** No source-data ingestion into training or scoring until a separate preregistered, source-audited evaluation is reviewed. No post-hoc seed, model, score threshold, grid, geographic region, or source selection based on performance.

## Initial official public discovery leads (catalog only, NOT obtained or certified)

| Priority | Publisher / candidate | Primary reference URL | What to check | Known caution |
|---|---|---|---|---|
| 1 | Nevada Bureau of Mines and Geology / University of Nevada Reno geologic faults derived from 1:24,000 geologic maps | https://gisweb.unr.edu/nbmg/rest/services/Geology/NBMG_Geology/MapServer/4 | Service availability, per-map source citations, geometry precision, map date, bounded coverage intersection with GeoDAWN valid mask, rights and technical export | Service page is not a verified downloaded GIS dataset, and map compilation may be part of organizer existing fault inputs. A dated source map is required; check whether requested layer endpoint actually responds. |
| 2 | USGS Quaternary Fault and Fold Database, official Earthquake Geology data page | https://www.usgs.gov/programs/earthquake-hazards/earthquake-geology | Obtain official GIS ZIP link and metadata, citation/author/source map for each fault, QFault inclusion criteria, age range, geographic footprint, source independence | Only faults in Quaternary time range; not comprehensive mapping of all geologic faults. Multiple datasets reuse these same USGS/NBMG traces. The old database search is retired as of Feb 26, 2026, but GIS download remains listed. |
| 3 | NBMG Nevada Active Faults ArcGIS polyline service for National Geothermal Data System | https://web2.nbmg.unr.edu/arcgis/rest/services/NV_Data/NVActiveFaults/MapServer/0 | Official layer metadata and actual feature query export with bounded request budget, exact record IDs and source, CRS/geometry, date and license | "Nevada active fault" does not imply undiscovered, independent, new mapped-fault truth. Likely shares lineage with source 1 or 2. |
| 4 | NBMG statewide Nevada 1:500,000 fault map (coarse reconnaissance comparator) | https://data-nbmg.opendata.arcgis.com/datasets/nevada-500k-geology-faults/data | Dataset provenance, geometry availability, overlap and coarse resolution limits | 1:500,000 source geometry cannot be treated as precise 100 m pixel labels; historical map compiled from earlier sources. |
| 5 | USGS National Geologic Map Database and individual original mapped-fault surveys | https://ngmdb.usgs.gov/ | Discover original high-resolution GIS maps with sources, dates and citations (rather than relying on aggregate derivative layers) | Index/catalog is NOT itself new surveyed fault truth. Verify original map publication and actual geodata availability. |

**Source verification as of research reconnaissance:** USGS official page explicitly lists 16 MB GIS faults ZIP and source citations; NBMG official service metadata describes its active-fault layer and GeoJSON-supporting query formats; NBMG 1:24k and 500k catalog pages have been identified. No GeoDAWN-compatible external labeled set, independent lineage or spatial overlap has yet been tested. Do not assert any source passes.

## Required read-only evidence package in the original private Work environment

Create a write-once private artifact `GEMS008_external_fault_evidence_recon/manifest.json` with a record per candidate:

```json
{
  "source_id": "publisher-layer-map-year",
  "publisher": "actual publisher",
  "primary_url": "official absolute URL",
  "retrieved_at_utc": "ISO timestamp",
  "metadata_version_or_publication_date": null,
  "source_map_citation": null,
  "lineage_parent_sources": [],
  "geometry_file_sha256": null,
  "geometry_crs": null,
  "geometry_type": null,
  "source_scale_denominator": null,
  "source_footprint": null,
  "intersects_geodawn_rectangle": null,
  "intersects_geodawn_valid_cells": null,
  "valid_cell_overlap_verified": false,
  "external_trace_count": null,
  "original_label_lineage_disjoint_verified": false,
  "previously_uninspected_geography_verified": false,
  "same_34_model_features_available": false,
  "rights_reference": null,
  "competition_use_and_sponsor_sharing_verified": false,
  "geology_negative_truth_known": false,
  "eligible_for_model_training_or_scoring": false,
  "limitations": ["Do not infer independence from map service availability"]
}
```

Treat unknown/null fields as **not verified**. For acquired official vector files, verify source integrity and pinned SHA256, CRS axis order, boundary, true finite intersections with organizer valid mask, metadata lineage, and whether the map represents trace, inferred fault, fold, contact, or other class. For *read-only* geometry comparisons, prioritize summary counts and hashes; do not publish restricted private organizer labels, sample coordinates, rasters or cross-source spatial joins.

**Stop gates:** no metadata lineage -> HOLD; no verified geometry overlap -> HOLD; rights unclear -> HOLD for scientific use; suspected organizer-source dependence -> NOT INDEPENDENT; out-of-footprint missing raw features -> NOT EVALUABLE by current GEMS-001 feature stack; no adequate negative truth -> report positive-trace proximity diagnostics only, not formal Tversky with implied true negatives. When feasible, produce a prospective evaluation design *without running training or inspecting scores*.

## Fallback, separately named and NOT yet authorized

A **common-support negative-distance-bin approach** could be studied as a *distinct GEMS-009 protocol* with quotas restricted to empirically available bins, frozen before any fitting. That would not reproduce the original northern frozen-bin GEMS-007 method and would be a **reused-geography** result, because the south was already evaluated. It must not be silently substituted for GEMS-007 or promoted as independent evidence. Prioritize original independent geologic evidence instead.

## Existing Evercraft evidence machinery to REUSE

- `gems_external_layer_gate.py` for hash/CRS/footprint/rights *screening of raster features only*, not fault ground-truth label certification.
- `gems_nevada_disagreement_atlas.py` for candidate disagreement coordinates, **not fault truth**, and not an untouched-test selector.
- `gems_usgs_3dep_index.py` / `gems_usgs_3dep_capture.py` for public 1 m DEM metadata, **not surveyed faults** or label truth.
- Existing GitHub research PR #2259, issue #2260, original Work evidence archives. No new branch or duplicate research lineage.

**Current decision:** GEMS-008 is *evidence scouting only*. GEMS-001 #330339 remains selected at official public DTI 0.0552; GEMS-002 #330456 unselected. No candidate, submission, model promotion, paid compute, or training authorized by this document.
