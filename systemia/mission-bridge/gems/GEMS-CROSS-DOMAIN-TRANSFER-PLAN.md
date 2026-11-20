# Evercraft → GEMS: cross-domain geospatial intelligence transfer plan

**Research classification:** source-grounded methods inventory and hypothesis queue; not an operational model release, verified new dataset, or scored submission.

## Prize target and non-negotiable rules

- GEMS evaluates **geologic faults in the western Nevada GeoDAWN footprint**, not mining permit locations or tunnel locations.
- Organizer raster shape 3292 × 3730, EPSG:32611 UTM zone 11N, 100 m cells, affine origin (243350, 4508550) and rectangular extent **E 243350–572550; N 4135550–4508550**. The actual valid-data/competition shape is smaller than this rectangle.
- Performance is distance-weighted Tversky with 300 m matching radius and α=0.2 false-positive / β=0.8 false-negative penalties. Hard negatives must not be silently assigned geological truth: unlabelled surface scars might be faults.
- External sources permitted when the participant has a license permitting **competition use and sharing with the sponsor**; source archive, feature transform and license evidence must be reproducible for finalists. Source: https://www.drivendata.org/competitions/306/competition-doe-gems/page/967/ and https://www.drivendata.org/competitions/306/
- Do not add external geodata to a training run without independent provenance, rights and fold-leakage review. Never train on the private hidden labels or infer them from public leaderboard.

## Reuse findings from actual Evercraft assets

| Asset | Inspected canonical evidence | What is real | Transfer to GEMS | Data boundary |
| --- | --- | --- | --- | --- |
| EverMaps Mineral Intelligence | Draft PR #1681, `docs/evermaps/mineral-intelligence-washington-v1.md`, `systemia/evermaps/spatial-integrity.mjs` | Washington DNR/WGS Grant County evidence packets and reproducible polygon/point source checks | GeoJSON QA, projection, topology/bbox warning, spatial join, source receipt hashing, distinguishing unknown from negative | Washington aggregate polygons and historic mines **do not overlap western Nevada** and aren't fault ground truth |
| GeoLab | GeoLab RC001 earlier research evidence | Synthetic borehole/layer interpolation workbench, coverage hull warnings | Feature interpolation and uncertainty patterns when local survey points actually exist | Synthetic boreholes do not establish Nevada geology |
| Watershed Intelligence | `systemia/research-service/watershed-intelligence.mjs`, PR #1774 | Yakima Basin USGS/NRCS observational-source adapters and historical/source evidence | Data freshness/quality checks; possibly test geomorphic stream-offset and drainage anomalies derived from **Nevada DEM**, with controls | Yakima flow stations are **not** Nevada fault labels; rivers also follow erosion and lithology |
| Subsea Watch | `public/subsea-watch/README.md`, PR #2178 | NOAA Kodiak Seep cruise track provenance, partial position/depth handling; 3D synthetic seafloor clearly separated | Survey registration, lineament geometry, uncertainty filtering, multi-scale relief features translated to **land elevation** | Alaska ROV tracks and fictional seabed are not GeoDAWN bathymetry/fault evidence |
| Hidden World Atlas | `docs/worlds/HIDDEN-WORLD-ATLAS.md`, PR #1855 | Source-linked historical Yakima sites, interpretive underground illustrations | Annotated evidence maps and uncertainty labels for expert review of predicted faults | No verified contiguous Yakima tunnels; illustrative underground meshes are **never** geologic training features |
| Official GEMS DEM tiles | Competition problem description, `1m_DEM_links.csv` on participant data page | Verified **availability of download links**, not possession of any tile in current research runtime | **Highest-priority genuine new candidate layer:** slope/curvature, lineament continuity, aspect, multiscale scarp / relief signals aligned onto the 100 m GeoDAWN study grid | Original tiles, use/share rights, coverage, reprojection, feature lineage, and independent CV gain not yet verified |

## Proposed next science, prioritized

1. **Finish GEMS-004 first:** compare 5 random negatives, distance-bin-matched random negatives, and genuinely hard-mined negatives on the same northern full-area held-out fault-component folds. Report weighted TP/FP/FN and whether hard mining beats its *distance control*. Do not produce candidate or submit.
2. **Feature audit and rights check:** use `gems_external_layer_gate.py` on a proposed source manifest. It SHA256-checks local raster bytes and compares their claimed study area to the GeoDAWN EPSG:32611 bounding rectangle without training on them; the output never grants training authority. Coordinate, mask, coverage and licensing still need independent study.
3. **One bounded high-resolution DEM ablation (if lawful data available):** compare the current 34-feature model against the SAME model plus predeclared multiscale DEM morphology (e.g. smooth elevation residuals, curvature and gradient orientation/coherence) using the original training masks and identical 3 northern full-area folds, with a genuinely held-back spatial confirmation region. The organizer already provides detrended elevation and slope; test *incremental* value, not redundant features.
4. **Hydrography and mineral features only conditionally:** study Nevada-specific river/stream offsets or mapped lithological boundaries as *separate* externally licensed exploratory features, not as positive fault labels or blanket "negative" masks. Audit acquisition/reprojection, ambiguity and overlap.
5. **Seabed/tunnel features:** transfer validation and visualization procedures only. No unrelated Alaska ocean or Yakima historical observations in the GeoDAWN training matrix.

## Required experiment design

- Register input bytes, CRS, bounds, date, original license, rights evidence and whether the data may be shared with sponsor. Avoid using an external source just because it's freely browsable.
- Construct transforms with no hidden new-fault labels, no southern fold information used to fit or select features, and no cross-fold leakage via geographic smoothing/normalization. Document every transform and run a synthetic boundary test.
- Evaluate **full northern scoreable area** and **entire withheld mapped-fault components**, not only 1.5 km corridors. Compare pooled weighted TP/FP/FN, geographic fold consistency and the net increase in prediction footprint.
- A new model is eligible for **offline candidate construction** only after clearly surpassing baseline on the full-area proxy without implausible FP inflation, passing holdout geometry tests and independent confirmation. This is *not* proof of a better official score. Scored submission remains separately authorized and chosen after reviewing actual evidence.

## Read-only intake command

```bash
cd systemia/mission-bridge/gems
python3 -m unittest -v test_gems_external_layer_gate.py
python3 gems_external_layer_gate.py \
  --catalog evidence/gems-cross-domain-methods-inventory-20261120.json \
  --receipt /PRIVATE/NEW/gems-cross-domain-screening.json
```

The initial registry contains **methods-only** records for existing Washington/Alaska/Historical sources. It contains a **proposed but not acquired** official 1m Nevada DEM source; no training-ready new raster is claimed. `source_kind=external_raster` with `file_path`, `expected_sha256`, rights flags and source references can later be added by an independent evidence review. Even for a matching raster, the gate only says **candidate for independent review**, never approved to train. No downloads, paid compute, deployment, or DrivenData submission.
