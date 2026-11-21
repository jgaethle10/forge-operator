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

## 2026-11-20: Real prediction disagreement atlas from preserved scored-entry GeoTIFFs

The offline `gems_nevada_disagreement_atlas.py` compares the **existing** preserved GEMS-001 raster and verified GEMS-002 raster with exact pinned SHA-256s. It is independent of the missing 419 MB training feature raster. It does not use actual fault labels, external DEMs, hidden competition targets or any portal.

Verified actual whole-grid outputs:
- **5,167,373 valid source pixels**, matching both original NaN masks.
- At ≥0.20: GEMS-001 has **384,797** predictions; GEMS-002 has **444,269**; intersection **185,133**; incumbent-only **199,664**; challenger-only **259,136**. XOR=**458,800** valid pixels.
- At ≥0.50: incumbent **34,010**; challenger **142,571**.
- **583 nonempty 10-km study tiles**, **541** with at least 3,000 valid pixels, and **45 diagnostic study tiles**: 15 high-disagreement review, 15 median controls, 15 low-disagreement controls. No selection is a label, error or independent validation.
- Highest eligible disagreement tile: `r29c12`, about **41.0%** of 6,805 valid tile cells where the old/new ≥0.20 states disagree. This is a **model divergence**, not a fault location.
- Tile polygons converted from actual EPSG:32611 affine to **WGS84 lon/lat GeoJSON**. Source hashes and full-grid counts fail closed on mismatch. Output is write-once.

The user-owned **private output ZIP** `GEMS_Nevada_Research_Atlas_20261120.zip` (created in the ChatGPT research workspace, **not committed** to GitHub) contains `gems_model_disagreement_tiles.geojson`, `disagreement_atlas_receipt.json`, reproduction instructions, the tested local implementation and tests. ZIP SHA-256 `bcf00fc7cf8224a735d785f1dcb7e3cff150e400135fd72a52d9020946286694`. A canonical code implementation and synthetic checks are committed in this PR at `gems/gems_nevada_disagreement_atlas.py` and `gems/test_gems_nevada_disagreement_atlas.py`. GitHub scientific job **#136111284443** (run **#44683210015**) passed all four new tests plus existing tests. Never treat atlas selection as evidence of 1-m DEM availability.

**Next geospatial science gate:** On the official 1-m DEM source index, query/check *metadata only* for available tiles covering a predeclared small set of high, median and low-disagreement study squares, with real WGS84 bounding geometries; verify that same-source DEM coverage, measurement date, vertical datum, interpolation method and license are recorded for controls, not just review hotspots. Only with actual authorized bytes should the team derive native-resolution scarp/curvature features using proper edge halos and compare against baseline on the same geographic folds. Avoid selecting map areas by the hidden leaderboard score, which the atlas does not have.

**Reproduction (private owner-supplied scored rasters, no external download or submission):**
```bash
python systemia/mission-bridge/gems/gems_nevada_disagreement_atlas.py \
  --gems-001-archive /private/gems_001_verified_submission.zip \
  --gems-002-tif /private/gems_002_candidate_UNSUBMITTED.tif \
  --output-dir /private/NEW/nevada-disagreement-atlas
```

## GEMS-005: physics-derived directional features from already-authorized official bands (Nov 20 UTC)

**Purpose:** use Evercraft geospatial/QA techniques to ask whether persistent directional changes in existing GeoDAWN magnetic RTP and isostatic gravity fields carry additional fault-relevant information. DO NOT interpret directional high response as a confirmed fault. Other plausible sources include lithology contacts, acquisition artifacts, erosional lineaments, and cultural noise.

**Already implemented in draft research PR #2259, no new external data required:** `gems_005_directional_features.py` adds exactly four label-free features: structure-tensor directional coherence × gradient-energy magnitude on existing official `rtp` and `iso_grav_anom` raster bands, with preregistered gaussian scales 2 and 8 *100m* pixels, nodata mask normalization and explicit feature-coverage audit. The original 34-feature HGB feature engine remains untouched; the challenger only adds 4 columns to become **38 features**. All organizer input rasters and archived run.py must pass their pinned SHA-256 gates first.

`gems_005_directional_ablation.py` scores baseline 34 vs challenger 38 on **identical training positive and negative pixel indices**, fixed HGB parameters, original .20 ridge rendering, and 3 northern mapped-fault-component holdout groups with full-area score and TP/FP/FN. The comparator is **0m five-random negatives per positive** on both models. Neither spatial holdout data nor hidden new fault labels enter the feature computation. Computing unsupervised image convolutions across fold boundaries is permitted only as an explicitly documented transductive source-image transform, never an inferred label. Both models are fitted afresh within each fold.

The output records full northern known-fault proxy and secondary 1.5km corridor metrics, full fold ledger, exact official source hashes, feature/missingness audit, model settings, and strict `new_candidate_created=false`, `automatic_promotion_allowed=false`, `submission_made=false`. **This is not a GEMS official score or an independent untouched confirmation.** No selected variant becomes a scored competition entry automatically.

Run at most one actual-authorized GeoDAWN execution on isolated free CPU, with original authorized 419 MB organizer feature raster and preserved GEMS-001 source archive already mounted:

```bash
bash systemia/mission-bridge/gems/execute_directional_ablation.sh \
  /private/AUTHORIZED_GEODAWN_DATA \
  /private/gems_001_verified_submission.zip \
  /private/NEW/gems005-directional-evidence
```

Expected outputs: `run-a/directional-full-area-ablation.json`, `directional-decision-gate.json`. Do not upload arbitrary public sources; no network or new dependencies beyond existing pinned test requirements. Four feature-unit tests and one full **real-HGB synthetic** two-run contract test are included. CI gates both files plus shell syntax. Review per-fold FP inflation, full-area pooled difference and missingness before any resource-intensive follow-up. A null or negative result ends this four-feature hypothesis. A positive result motivates separate replication on a genuinely untouched region and assessment of whether coherent gradients come from nonfaults, **not automatic promotion or submission**.

### Owned-system responsibilities, without claims of dispatched execution

- **Systemia and Saban:** can route a bounded private CPU science mission using existing approved paths when Work/owned runtime has the source rasters, but no autonomous task was dispatched here.
- **EverMaps and Kennedy Space Station:** contribute existing reference-plane and geometry QA patterns. They do not provide labels or substitute for UTM raster hash/affine checks.
- **Evercraft Research, ForensiScope, Black Box:** evidence provenance, source lineage and guard principles transferable; no direct runtime wiring to GEMS-005 has been verified.
- **Sovereign Raven/Claude/Grok models:** potential hypothesis and code critics only. No connection, credential, or model inference is asserted in this experiment.
- **Watershed, Subsea Watch, Worlds:** terrain/lineament inspiration, uncertainty classification and optional visualization. No Yakima, Alaska, or fictional site geometry is incorporated into the model.

A new external DEM trial remains **separate** from this source-only GEMS-005 ablation, requiring tile overlap, use/share rights, nodata/datum/CRS verification and explicit model evidence. Preserve original GEMS-001, previously scored GEMS-002, and the public leaderboard distinctions.


## GEMS-006 preparation: balanced DEM metadata reconnaissance (Nov 20)

New zero-network, no-raster preflight: `gems_dem_metadata_recon.py`. It reads the
existing **owner-private** `gems_model_disagreement_tiles.geojson`, validates
its WGS84 CRS and provenance disclaimer, and generates bounding-box lookup
windows for all three equally sized diagnostic groups (15 high-disagreement,
15 median control, 15 low-disagreement in the archived atlas). The output
never asserts DEM coverage or geologic ground truth.

```bash
cd systemia/mission-bridge/gems
python3 -m unittest -v test_gems_dem_metadata_recon.py
python3 gems_dem_metadata_recon.py \
  --atlas /PRIVATE/nevada-disagreement-atlas/gems_model_disagreement_tiles.geojson \
  --receipt /PRIVATE/NEW/gems-dem-metadata-recon.json
```

Optional `--index /PRIVATE/verified-dem-source-footprints.json` accepts a
*manually checked, local* JSON document with
`schema="evercraft.gems.dem-metadata-index.v1"` and
`sources=[{"id":"...","metadata_reference":"...","bbox_wgs84":[west,south,east,north],
"acquisition_date":null,"vertical_datum":null,"rights_reference":null}]`.
These values are **example schema placeholders**, not discovered DEM tiles.
The optional metadata index may also declare `horizontal_crs`, `nominal_resolution_m`, `acquisition_date`, `vertical_datum`, and `rights_reference`. Missing fields appear in `source_metadata_gaps_by_id`. `bbox_candidates_balanced_across_review_and_controls` checks whether all three groups have the same nonzero count of metadata bbox hits, not real pixel coverage. `source_ids_with_bbox_hit_in_each_group` lists source IDs with at least one intersection in each group. `next_research_gate` remains a manual-review or missing-evidence state even when every metadata field is populated. A claimed 1m resolution or cited license still needs independent verification; neither constitutes permission to train. No partial or uneven sample should be used to infer comparative model performance.

The tool never retrieves `metadata_reference` or other URLs. A coarse bbox
intersection is a candidate for **manual metadata review**, not proof that a
pixel is present, that the tile covers the polygon, or that use/share rights
permit competition features. No index = unknown coverage, not missing coverage.

Next scientific gate: source-specific metadata collection for the three groups
under comparable acquisition vintage, vertical datum, nominal 1m resolution,
resampling and rights; spatial footprint validation and actual valid raster
pixel coverage only **after** permitted bytes are available. Keep GEMS-001
selected and do not submit, promote, deploy or spend paid compute here.


## GEMS-006 USGS 3DEP one-meter index query packet (Nov 20)

USGS's **official** 3DEP layer 18 is a polygon feature layer covering 1-meter
projects with fields `OBJECTID`, `project`, `project_id`, `pub_date`,
`product_link`, and `metadata_link`. Service:
https://index.nationalmap.gov/arcgis/rest/services/3DEPElevationIndex/MapServer/18
(USGS layer schema inspected Nov 20). This is useful as a **public project index**,
not the organizer's private fault labels and not the raster pixel coverage.

`gems_usgs_3dep_index.py` consumes the already-produced **private**
`gems_model_disagreement_tiles.geojson` and writes 45 deterministic public
ArcGIS 1m project-index query URLs (one per balanced high/median/low study tile).
The output is an offline metadata request packet; it **never** sends requests
or downloads DEMs. The official source is fixed in code (not user-selectable),
all WGS84 query bboxes come from the private atlas geometry, and an SHA-256
identifier binds each request to its tile for later response matching.

```bash
cd systemia/mission-bridge/gems
python3 -m unittest -v test_gems_usgs_3dep_index.py
python3 gems_usgs_3dep_index.py \
  --atlas /PRIVATE/nevada-disagreement-atlas/gems_model_disagreement_tiles.geojson \
  --receipt /PRIVATE/NEW/usgs-3dep-1m-index-queries.json
```

For optional **offline** response screening, manually save public ArcGIS query
JSON responses to a private local bundle with schema
`evercraft.gems.usgs-3dep-one-meter-responses.v1` and
`responses=[{"tile_id":"r...","query_sha256":"<plan query_sha256>",
"response":{"features":[{"attributes":{"OBJECTID":123,"project":"..."}}],
"exceededTransferLimit":false}}]` containing **one record for every query**.
Then run with `--responses /PRIVATE/usgs-results.json`. The tool fails closed
on missing/duplicated tile IDs, wrong query digests, upstream errors,
pagination flags, repeated object IDs and record caps. It hashes the captured
response bytes represented as canonical JSON but **does not authenticate the
upstream server or imply that any DEM pixels exist**.

### Gate after the metadata packet

1. Make read-only queries to the official USGS index for **all three groups**,
   retaining timestamps, response provenance and metadata pointers privately.
2. Check the exact project polygon and product metadata (vintage, datum,
   processing, available source resolution, and actual valid DEM cells).
   A positive ArcGIS bounding-box intersection can still contain no usable
   elevation values. Match control and review group coverage before comparing.
3. Verify organizer 1m DEM URL matches, provenance and right-to-use/share
   documentation; only then consider authorized high-resolution terrain
   transforms in isolated free research compute on held-out geographic folds.
4. Preserve the official GEMS-001 candidate. Do not submit, deploy, promote,
   infer new faults, or spend paid compute from index-query results.


## GEMS-006 next boundary: gated public 3DEP metadata capture (Nov 20)

A separate, explicit-run `gems_usgs_3dep_capture.py` can now **fetch
public project-index JSON from the pinned USGS 3DEP layer 18 endpoint** once
the owner-private diagnostic atlas is available locally. Network access is
**off unless** `--allow-public-usgs-query` is provided. No arbitrary base
URLs or redirects are allowed, and the client bypasses inherited proxies,
checks TLS, caps each response at 1 MiB, uses a 12-second timeout, and pauses
between queries. No raster source download, model training, or submission.

Privacy boundary: sending 3DEP metadata queries necessarily reveals the
bounded diagnostic **coordinates** to the external USGS server. The script
does not upload the input atlas, prediction probabilities, labels, or raster
files. Write the response bundle into private owner-controlled storage;
**never commit response bundles or private atlas locations to the public repo**.
The write-once file is created with 0600 permissions.

```bash
cd systemia/mission-bridge/gems
python3 -m unittest -v test_gems_usgs_3dep_capture.py
# First bounded live trial: one tile from each diagnostic group, 3 public requests.
python3 gems_usgs_3dep_capture.py \
  --atlas /PRIVATE/nevada-disagreement-atlas/gems_model_disagreement_tiles.geojson \
  --max-per-group 1 \
  --receipt /PRIVATE/NEW/usgs-3dep-public-index-pilot.json \
  --allow-public-usgs-query
# Only after a verified pilot: --max-per-group 15 in a fresh receipt path
```

A returned project metadata record is only a **public index intersection**,
not evidence of valid 1m elevation pixels, source rights, equal-area coverage,
or geology. If any request fails, the script fails without a completed receipt
instead of silently interpreting missing data as no coverage. This work does
**not** establish that a live request was sent or that any USGS project matched
our target tiles. Those are next-run evidentiary questions for the owned
research runtime or another authorized environment with the preserved atlas.
