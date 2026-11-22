# Systemia Chat Mission Bridge (owned Git-source v1)

This is the smallest runnable indirect path from an authenticated ChatGPT GitHub connector into one **bounded** Evercraft specialist. ChatGPT never needs an SSH, root shell, or persistent terminal link to Penguin for these read-only missions.

## Provenance and execution

ChatGPT / approved GitHub writer -> new immutable `requests/<mission_id>.json` on reviewed main -> GitHub Actions workflow -> Systemia allowlist admission -> deterministic specialist -> source/HTTPS observations -> downloadable evidence receipt.

The request file is an **inert instruction candidate**. GitHub identity and branch protection are the source-ingress controls; neither a field in the JSON nor a passing test grants Passport authority, remote NodeSeed control, payment, publishing or deployment. The worker's only admitted mode is `observe`. No arbitrary URL, program, command, GitHub workflow, external payload or target hostname is accepted.

## Admitted specialists

- `signal-public-ingress`: GET only the exact owned `/health`, `/offers/signal-brief` and `/api/signal/readiness` paths, from the independent GitHub runner. Reports route availability and payment hold truth without an actual customer submission.
- `forge-source-evidence`: hash a fixed allowlist of repository source files; never inspect secrets or arbitrary paths. Useful for proving software source presence, not production runtime deployment.
- `gems-research-evidence`: hash two fixed, source-only GEMS checkpoint manifests (accepted entry evidence and GEMS-002 research scope). This does not access DrivenData, verify private account state, train a model, or dispatch Saban.

## How to submit from ChatGPT, without Penguin

1. Create a branch and a new request file via the **connected GitHub app**. The immutable request is constrained to the schema in `bridge.mjs`.
2. Open a pull request and require contract CI. Merge to main only when reviewed and green. The workflow on main examines request files in the merge commit, max eight per batch. `workflow_dispatch` also supports rerunning one exact request ID.
3. Read the GitHub Actions `systemia-chat-mission-observations` artifact for a source-bound receipt. A green workflow is **not** proof of live Signal intake unless that receipt records a valid external GET for the readiness route.

The initial mission `signal-public-ingress-20261116-001` addresses the November 2026 Signal case. It does not charge, expose records, create orders, restart systems, dispatch a remote command or imply that a payment has been received.

## Trust boundaries

- GitHub is an execution location for this specialist and a durable source transport, not the owner of Systemia mission authority or Evercraft's production runtime.
- Mainline branch admission is currently reviewed Git changes, not a general authenticated conversational Mission Gateway. Converting untrusted messages directly into a write/execution job must use Systemia Intake Fabric, Passport and Execution Gate.
- This v1 has **no** dynamic Saban, Penguin, NextGen or Yard remote dispatch. Those routes require separate authenticated worker adapters, live admission and receipts.
- Every read-only specialist is a deterministic adapter, not an LLM pretending to have executed a command.
- Unknown route, executable mode, extra authority fields, disallowed IDs, and unsafe source paths fail closed.
- The GH runner cannot prove ChromeOS port forwards or local network status. Its HTTPS result describes only what the runner observed.

## Commands

```sh
node --test systemia/mission-bridge/bridge.test.mjs
node systemia/mission-bridge/cli.mjs --plan signal-public-ingress-20261116-001
node systemia/mission-bridge/cli.mjs --request signal-public-ingress-20261116-001
```

The last command performs external **GETs** and writes `artifacts/systemia-mission-bridge/*.json` locally. It does not deploy or mutate any Evercraft service.

## GEMS checkpoint mission (bounded)

Request: `systemia/mission-bridge/requests/gems-research-evidence-20261118-001.json`. The GitHub observation receipt hashes fixed evidence files and reports whether source is present. It **cannot** attest that a Drive/Library artifact was downloaded by the runner or that DrivenData certified a result. The accepted submission score and model results were supplied by the participant and archived locally; use primary portal evidence for authoritative leaderboard status.

For real private Systemia/Saban execution, a separate authenticated Mission Gateway must enforce identity, Passport capability scopes, agent/compute allowlists, approval gates, bounded resource budgets, replay protection, and externally verifiable receipts. No generic POST-to-execute endpoint, user-supplied commands, direct Node002 dispatch, or public bypass should be added to this Git-source observer. A PR merge is not permission for private remote execution.

## GEMS private research staging (not remote execution)

The GEMS branch includes `gems/private-research-preflight.mjs` and `gems/research-job-ledger.mjs`. An identity/Passport-authorized internal server may use these as **policy-only components** to validate one of three named GEMS workloads and write one exclusive, idempotent staging record into its own private ACL-protected directory.

The ledger never contacts an agent, runs a command, accesses a training dataset, or mints a Passport lease. A `staged_not_dispatched` record is **not** a mission run, and a passing preflight is **not** proof of authenticated identity. The future gateway must source verified context from trusted identity middleware rather than user-provided JSON. Existing GEMS-001 / GEMS-002 evidence remains unchanged.

Tests: `node --test systemia/mission-bridge/gems/private-research-preflight.test.mjs systemia/mission-bridge/gems/research-job-ledger.test.mjs`. Admission CI runs these automatically on the feature PR.

## GEMS started-lease binding (separate from dispatch)

`gems/research-lease-binding.mjs` checks a durable staged request against a live **started** receipt retrieved from the existing Evercraft Execution Gate. It checks receipt hash, Passport actor and scope, exact dataset resource, fixed internal research-worker route, completed one-time permit consumption, and exact request fingerprint. It deliberately returns `dispatch_allowed:false` even after a positive check, because a one-use atomic work claim and an isolated registered worker are not yet implemented.

**Security caveat:** The gate object and verified identity context must be supplied by trusted internal middleware. Passing caller-supplied JSON that impersonates a server context or `getLease` is not authentication. This is a reusable validation component, **not** a network-facing endpoint or a live lease verification service.

This adapter does not issue Passport grants, start Execution Gate leases, invoke the model trainer, interact with DrivenData, or touch Penguin/Node002 production. Its tests exercise simulated immutable lease receipts to prove denial paths; they are not evidence of a live Saban job.

## GEMS single-use local claim (still no compute dispatch)

`gems/research-work-claim.mjs` adds an exclusive owner-only file claim after the staged request has been matched with a verified started Execution Gate lease. A duplicate claim enters `work_already_claimed_manual_reconciliation_required` instead of replaying automatically. This is a **local state transition only**: it does not run the worker or authorize remote compute. The entire path requires a private authenticated gateway to supply trusted identity and the live Execution Gate object; it must run on an owner-only filesystem, not a shared public mount.

Before production use, the private server must additionally implement safe restart/reconciliation, lease expiration and revocation checks, a registered isolated bounded worker, a resource admission service and authoritative output receipts. A successful unit test with a synthetic gate is not proof of live Passport authority.

## Synthetic-only compute smoke

`gems/synthetic-research-worker.mjs` runs a deterministic **48 x 48 internally generated** geophysical fixture. The experiment compares a sampled unlabeled-as-negative logistic baseline against exclusion of negative samples close to synthetic faults. It evaluates on a held-out synthetic x-region, writes a hashed local receipt, and performs no network calls. The `admission-contract` GitHub Actions PR job runs this proof and publishes `gems-synthetic-research-smoke` as a temporary artifact.

The receipt explicitly marks `real_gems_dataset_used:false`, `official_dti_claimed:false`, and `drivendata_submission_made:false`. The resulting synthetic F1 is a **mechanism test only**, not a validated improvement to GEMS-001 or GEMS-002. It does not call Passport, start a real lease, dispatch a private Saban agent, or obtain the official competition training rasters. Production use still requires the authenticated and separately authorized private gateway.

## Authorized local GEMS raster integrity gate

`gems/private-dataset-integrity.mjs` validates the byte integrity of three files (`features`, `faults`, and `submission_template`) against expected SHA-256 values from a **trusted private dataset registry**. It emits a path-free receipt, refuses unexpected file roles, untrusted registry claims, symlinks, world-writable roots, pathname escape attempts, digest mismatch, and oversized data. The CI tests use tiny **synthetic placeholder bytes**, never the official GEMS download.

**Boundary:** This is a filesystem integrity check, not GeoTIFF semantic validation. A real authorized runner must additionally inspect CRS, grid dimensions, band semantics, nodata, label meanings, and licensing. The registry and expected hashes must be resolved server-side from authenticated records, not supplied by the chat/mission request. It must execute in an isolated private research environment with an approved dataset, and only the path-free receipt may be exported. No official GEMS dataset was accessed by this check.

This code neither creates Passport identity nor dispatches Saban/NextGen/Penguin, and is not a public endpoint. It does not establish that any real-data experiment has run.

## GEMS-001 preserved real GeoTIFF audit (independently run outside GitHub)

`gems/audit_preserved_candidate.py` is a read-only validator for the owner's preserved `gems_001_verified_submission.zip`. It uses Rasterio and NumPy and must run **in a private environment where that archive has already been authorized and mounted**. It does not fetch the competition data, authenticate to DrivenData, submit anything, or touch the original ZIP.

An actual independent local execution on the preserved submitted candidate produced `gems/evidence/gems-001-independent-raster-audit.json`: SHA-256 `3b2360bed8966b4bfdae76bfeb5436bf6dccd16ac9dc5ff402434736bdee57a4`; EPSG:32611; 3292x3730; one float32 band; 100m grid; 5,167,373 finite cells; 7,111,787 NaN; 384,797 positive-valued cells; no out-of-range values. This matched the archived receipt's staged-file digest and the previous local validation counts.

Rows partitioned north-to-south showed positive-valued fractions of valid pixels roughly 4.26%, 12.54%, 9.65% and 7.90%; these are *coverage diagnostics only*, not real fault prevalence or performance metrics. **Important**: the original feature/reference raster was not present, so the official allowed-area mask was NOT independently matched. The archived portal DTI 0.0552 is sourced from a participant-supplied receipt, not a fresh organizer API call. GitHub CI did not run this real-data validator because the private archive was intentionally not uploaded.

For local reproduction with the private ZIP: `python systemia/mission-bridge/gems/audit_preserved_candidate.py /path/to/gems_001_verified_submission.zip`. No GEMS-002 performance claim follows from this format audit.

## GEMS-002 controlled negative-label ablation (real-data runnable, not executed here)

`gems/gems_002_negative_ablation.py` implements a fixed-seed experiment against the **three organizer rasters already obtained by the authorized entrant**. It imports the preserved GEMS-001 `run.py` implementation (must be alongside the script in the private workspace), checks the **exact SHA-256 hashes** recorded in the archived official input manifest, uses the same multiscale HistGradientBoosting model/seed, and varies only the exclusion radius around `training-known` fault pixels: **0, 3, or 10 pixels** (100 meters per pixel). All variants use the original 5:1 sampled-negative cap, threshold 0.20, and ridge thinning. The training buffer cannot see geographic holdout labels.

**Leakage fix (Nov 19):** Tuning now uses three geographical folds entirely within the northern 75% development region. Southern-label pixels are EXCLUDED from the training masks for **every** tuning fold, including when those pixels are beyond the local geographic buffer. After tuning freezes the radius, only the baseline and the selected radius are tested once against the southern quarter; the southern result never changes the selection. Earlier commits used southern labels as training data for northern folds and were therefore not a valid locked-holdout experiment. Do not use results from that pre-fix method. The original GEMS-001 source also used its southern holdout in a fallback decision, so its 0.1023 score should not be treated as fully untouched model-selection evidence. Output: `evidence/gems-002-negative-buffer-ablation.json`, with all fold results, per-file organizer digests, fixed settings, and no submission. It does not modify GEMS-001, write a candidate GeoTIFF, submit to DrivenData, or auto-promote a new model. The score is the **archived local mapped-fault proxy**, not the organizer's official public DTI for newly mapped faults.

Run only in an isolated authorized environment with the official data and locally installed Python, NumPy, Rasterio, SciPy, scikit-learn:

```sh
# Copy the preserved GEMS-001 run.py into this directory before invoking.
python gems_002_negative_ablation.py --data-dir /private/official-data --evidence-dir /private/research-evidence
python -m unittest -v test_gems_002_negative_ablation.py
```

ChatGPT's current execution container does **not** have the three organizer rasters. The deterministic sampling and leakage test cases passed locally with synthetic small arrays; GitHub CI syntax-checks the script but cannot run the real-data training or dependency-heavy test suite. No actual GEMS-002 proxy scores have been produced by this new experiment yet. A separate gate is required before scored submission and daily UTC quota compliance.

### GEMS-002 integration smoke and source pin (Nov 19)

A local **synthetic GeoTIFF** end-to-end rehearsal using the preserved GEMS-001 source and the packaged v2 experiment ran 11 fold/radius model evaluations and produced an evidence JSON report. A deliberately narrow first fixture (24 columns) correctly failed: the 10-pixel exclusion radius left no eligible negative cells. A wider 512x96 fixture allowed the full pipeline to execute; the generated fixture-only holdout proxy was 0.0940 (baseline) versus 0.1050 (chosen 10-pixel buffer). These numbers are **not** official GEMS DTI and have no demonstrated geological generalization. No actual organizer rasters were loaded.

To prevent accidental model changes, the canonical ablation script now checks the neighboring archived GEMS-001 `run.py` against its original SHA-256 `db07aef8eb3edaa78efdc704d867cc8c2cf12ae1c8d17152fd0280238c92ca8b` **before importing** it. Tampered or symlinked model source is rejected. Run only in an approved private environment with authentic organizer file hashes; never bypass this integrity check to make experiments pass.

### GEMS-002 real-data grid alignment gate (Nov 19)

Before calling the archived GEMS-001 feature extractor, `gems_002_negative_ablation.py` now checks that the organizer submission template, existing-fault labels, and 19-band feature GeoTIFF share an identical EPSG:32611 grid, 3292 × 3730 dimensions, 100m unrotated affine transform with the observed origin, and recognizable unique feature-band names (including `rtp`, `tmi`, `iso_grav_anom`, `det_elev`, and `tc`). Any band-count, CRS, transform, shape, or required-feature mismatch fails before model training.

The comparison is based on the preserved GEMS-001 submission raster geometry and archived feature audit, not an inspection of the three organizer rasters in the current environment. Tests use fake raster metadata; they do not prove the official files pass. Local fixture checks of a matching grid and five malformed cases passed. The existing GitHub bridge workflow verifies Python syntax; it does not install scientific dependencies or execute the real-data integration script.

### Organizer data recovery and full feature-order pin (Nov 19)

Three organizer filenames/expected SHA-256 digests are stored in `gems/evidence/gems-002-source-recovery-20261119.json`; a public, unofficial dataset listing advertises matching hashes, but **the actual bytes have not yet been downloaded or verified in a research runtime**. Local DNS access to that host is blocked. This is not a real-data experiment or a proven license for mirror reuse. Use the official DrivenData participant downloads where possible and verify every downloaded file locally.

The experimental raster gate now demands **all 19 ordered feature-band identifiers**, exactly as recorded in the owner-preserved `GEMS-001/evidence/feature-audit.json`, instead of merely recognizing five of them. The source feature matrix uses positional columns, so reordered bands would silently invalidate training. The archived metadata confirms the new ordered identifiers, and a negative regression case rejects reordered metadata; CI is the authority for source checks. Neither this gate nor the recovery verifier authenticates an external source by itself.

### Correction: pooled organizer-style DTI rather than fold-average ratios

The GEMS-002 ablation formerly selected its negative-buffer radius by arithmetic mean of three per-fold mapped-fault proxy DTI ratios. On October 1, 2026 the DrivenData organizer explicitly confirmed the official scoring pools weighted TP, FP and FN terms over all evaluation pixels **before** taking one index: https://community.drivendata.org/t/leaderboard-aggregation-pooled-over-public-test-pixels-or-mean-of-per-chunk-scores/11550 . GEMS-002 now accumulates the original local proxy's weighted TP/FP/FN terms per northern tuning region and selects by `sum(TP)/(sum(TP)+.2*sum(FP)+.8*sum(FN))`. The helper checks numeric equivalence against the preserved GEMS-001 local DTI implementation on each region; two regression tests show an average-of-ratios can reverse model ranking and that the new components reproduce the archived proxy on synthetic inputs. The southern holdout remains entirely isolated until after selection.

**Crucial remaining mismatch:** the proxy evaluates held-out, already-mapped faults, whereas the competition evaluates **new faults** and excludes the provided USGS/INGENIOUS known-fault ground truth. Even perfect pooled arithmetic on known labels is *not* the official hidden-test DTI and does not prove model improvement. The next genuine model validation should hold out whole mapped fault segments with leakage buffers, alongside geographic tests. No official labels/raster bytes have been recovered in this execution environment.

## GEMS-002 REAL-DATA result and connected fault segment validation

On Nov 19, Work provided `gems_002_real_data_ablation.zip` (archive SHA-256 `2854798f87ef414d15c7f3e248d0dbd30b19553061ba069c04b9ff7e2204fd22`). The bundle contains two separately executed real-data experiment ledgers, exact organizer-input SHA-256 receipts and unchanged incumbent evidence. Replaying the bundle's `compare.py` successfully verified all per-fold metrics match across executions except elapsed time. Tuned northern mapped-fault proxy DTI: 0m 0.07469303, 300m 0.08879694, **1000m 0.10121027**; locked southern proxy DTI: 0m 0.10226688, **1000m 0.13675249**. Absolute southern gain **0.03448561** (+33.7% relative). The large organizer TIFF bytes are not included in the archive, so this chat has **not rehashed those bytes or independently rerun the model training**. Full reproducibility provenance is saved in `gems/evidence/gems-002-real-data-repro-20261119.json`.

### Next scientific gate: held-out whole connected fault components

`gems/gems_002_segment_holdouts.py` is a **new, separate** experiment comparing only the two precommitted variants: baseline radius 0 and selected radius 10 pixels (1000m). It constructs 8-connected fault-pixel components on the entire known label map, drops components crossing the southern boundary, assigns eligible northern components into 3 deterministic, approximately positive-pixel-balanced groups, and withholds **all** pixels belonging to the group during fitting. A 30-pixel (3km) Euclidean training buffer around withheld pixels prevents nearby training leakage; both variants are evaluated on the **same** 15-pixel (1.5km) vicinity, excluding any other mapped positive labels from scoring rather than mislabelling them negatives. Only the original 5:1 negative sample cap differs by the fixed 0/10 pixel negative exclusion setting. The report pools DTI weighted components and keeps an explicit summary of excluded nearby mapped-fault pixels.

This is a connected-component approximation, **not a verified geological fault-trace segmentation**. Disconnected sections of the same physical fault can still end up in different folds, and model scoring against **held-out mapped faults** remains different from official newly mapped fault DTI. The same known rasters are reused, so it is a second validation design rather than an independent external dataset. Results are *not yet measured*.

With archived GEMS-001 `run.py` alongside both scripts and the original organizer rasters mounted into a private isolated CPU workspace, run:

```bash
python -m unittest -v test_gems_002_segment_holdouts.py
python gems_002_segment_holdouts.py --data-dir /private/official-geodawn --evidence-dir /private/research/segment-holdout-run-a
```

Use a second isolated evidence directory for a reproducibility replay and independently compare all non-runtime fields. The script refuses overwriting its segment evidence JSON. Never submit, deploy, or change GEMS-001 based on segment proxy results alone.

## GEMS-002 offline full-grid candidate gate (Nov 19)

Owner-supplied Work replay bundle `gems_002_segment_replay.zip`, SHA-256 `128ed665ac261754e75a669a050c3c9b51fdde20de729cd08ba2d4c17c594323`, reports and independently cross-checks three connected fault component folds. Baseline pooled local mapped-fault proxy DTI `0.13944445894661742`; preselected 1000m exclusion `0.15165058139994816`, gain `0.012206122453330748` / `8.75339%`. All three folds favor the 1000m variant; the two JSON ledgers match excluding elapsed runtime. Archived organizer file hash receipts all match the pinned values; source 419MB raster bytes are NOT included in the evidence ZIP and cannot be rehashed in this chat. Historical GEMS-001 contestant remains unchanged; no scored GEMS-002 submission. Compact provenance in `gems/evidence/gems-002-segment-real-replay-20261119.json`.

This result **authorizes preparation only, not competition submission**: connected raster components are not authenticated complete geological faults, corridor-scored mapped fault labels cannot assess whole-area false positives or newly mapped fault discovery.

`gems/gems_002_prepare_candidate.py` creates a new **offline-only**, unsubmitted single-band float32 full-grid GeoTIFF. Fixed science: `SEED=306`, preselected negative exclusion 10 pixels (1000m) using all known fault labels, 5:1 random unlabeled negative cap, original archived 34-feature pipeline, HGB 100 iterations / 0.10 learning rate / 23 leaves, and `render(prob, .20, ridge=True)`. It does not retune or use hidden/leaderboard results. The script SHA-verifies the authentic original `run.py`, each of the 3 organizer TIFFs, 19 band order and georeferencing before training. It refuses existing output directories, writes `gems_002_candidate_UNSUBMITTED.tif` with the official profile, reopens the file to check CRS, affine, dimensions, nodata mask, float32, probability bounds and exact raster pixel roundtrip, and writes candidate-evidence JSON with hashes and density/quantile summaries. No network action or submission code.

For a future **authorized offline Work run**, use the existing isolated participant dataset mount and original SHA-verified `run.py` alongside the script:

```bash
cd systemia/mission-bridge/gems
python -m unittest -v test_gems_002_prepare_candidate.py
python gems_002_prepare_candidate.py \
  --data-dir /AUTHORIZED/GeoDAWN/data \
  --output-dir /ISOLATED/NEW/gems-002-candidate-run-a
```

**Never** upload the candidate to DrivenData or automatically promote it. Before any scored submission: inspect full-area candidate positive coverage and spatial artifacts, compare against preserved GEMS-001 output, validate required format and challenge rules, evaluate competition strategy and user authorization. Two identical model executions may yield different compressed TIFF bytes across GDAL runtimes; separately compare normalized pixel arrays and metadata, not just raw ZIP/TIFF SHA, before making deterministic claims.

### Full-map spatial comparison before any leaderboard submission

The new `gems/audit_candidate_comparison.py` is read-only: compares the complete original GEMS-001 `gems_candidate.tif` (SHA-256 pinned) inside `gems_001_verified_submission.zip` against the offline GEMS-002 full-grid `gems_002_candidate_UNSUBMITTED.tif`. It fails closed on grid/CRS/transform/mask mismatches, altered incumbent bytes, invalid probability values, or an optionally mismatched expected GEMS-002 SHA. It reports >0.05/0.1/0.2/0.3/0.5 coverage, 8-connected positive regions/singletons, row-quartile concentrations, overlap/union and new-only areas, and full-grid prediction-change quantiles. **These diagnostics do not estimate the official newly mapped fault DTI, false-positive rate, or promotion eligibility.**

Once the actual offline candidate and verified saved incumbent ZIP are accessible in an isolated research workspace, run:

```bash
python systemia/mission-bridge/gems/audit_candidate_comparison.py \
  --gems-001-archive /PRIVATE/gems_001_verified_submission.zip \
  --gems-002-tif /PRIVATE/gems-002-candidate-run-a/gems_002_candidate_UNSUBMITTED.tif \
  --expected-gems-002-sha256 THE_VALUE_IN_CANDIDATE_EVIDENCE_JSON \
  --receipt /PRIVATE/gems-002-candidate-run-a/full-grid-comparison.json
```

Use a new report path; receipts cannot be overwritten. Review possible excessive map coverage and disconnected predictions alongside whole-connected-fault mapped-label validation **before** asking the participant whether to use another scored submission. No automatic submission code is provided.

### One-command candidate + incumbent full-map QC (GEMS-002)

`gems/execute_candidate_qc.sh` is the recommended **single bounded Work execution** once the original GeoDAWN raster bytes are already mounted on an isolated, authorized CPU environment. It first checks that input files exist and output is new and outside the source/data directories; pins the original GEMS-001 model source from the owner-preserved ZIP; runs existing local candidate/comparison scientific tests; builds a full-grid **unsubmitted** 1000m negative-exclusion candidate; reopens and hashes the generated TIFF; runs the incumbent GEMS-001 vs GEMS-002 full-map coverage/topology audit using the exact candidate digest; crosschecks the two evidence receipts and prints a compact summary. Neither script has DrivenData credentials or a submission action. It **does not** use the earlier experimental holdout as a retraining trigger and doesn't invoke Kennedy or private Saban.

```bash
bash systemia/mission-bridge/gems/execute_candidate_qc.sh \
  /private/official-geodawn/data \
  /private/archive/gems_001_verified_submission.zip \
  /private/outputs/gems-002-candidate-NEW-UNUSED-DIR
```

Do not rerun into the same output directory or upload the resulting TIFF without a separate submission decision. Archive both evidence JSON files, the untouched GEMS-001 ZIP hash, candidate GeoTIFF hash, scientific-environment versions, and output logs in private evidence storage. After this run, assess prediction footprint/fragmentation, newly covered areas, and independent mapped-fault holdouts. These cannot infer the organizer's newly mapped fault score. If missing authorized TIFF files, stop rather than rebuilding infrastructure or spending money.

## GEMS-002 full scoreable-area proxy and sparse challengers (Nov 19)

**Scientific correction:** The earlier 8.75% 1000m negative-exclusion uplift was measured on 1.5 km corridors around held-out known fault components, not the full study area. This omits false positives distant from those held-out traces, whereas the actual GEMS metric penalizes off-trace prediction mass across all scoreable pixels. DrivenData staff confirmed that existing USGS/INGENIOUS fault labels are excluded from scoring by an **exact known-fault pixel mask**, NOT by a 300 m buffer, and nearby predictions still receive false-positive penalties: https://community.drivendata.org/t/scoring-clarification-are-known-usgs-ingenious-faults-masked-when-scoring-and-are-they-in-the-final-round-label-set/11516 . We therefore cannot infer better official DTI from the 8.75% corridor gain alone.

**New study:** `gems/gems_002_full_area_validation.py` reuses the original official-input SHA/CRS/19-band/source hash gates and 3 northern 8-connected mapped-fault holdout groups. For each fold, train fixed 0 vs 1000m negative-exclusion HGB models with the same archived 34 features and settings; predict all northern valid pixels; zero known-training-fault predictions before scoring; score against heldout mapped faults over **all northern valid scoreable pixels**, except the exact known-training-fault cells. Also report the **same predictions** scored in old 1.5km corridors, allowing an apples-to-apples audit of how restricting the evaluation window biased the result. For the preselected 1000m variant alone, evaluate fixed postprocess combinations of .20/.35/.50 probability threshold and retain-all/omit-singletons. Compute and pool the original weighted TP, FP and FN components. No candidate is automatically selected, no hidden new fault labels used, and no scored submission occurs. All three fold groups were previously used to validate 1000m exclusion; this study is **not a pristine independent unseen validation**, nor a surrogate public leaderboard.

A read-only audit of the user's real **unsubmitted** GEMS-002 candidate found 62,862 single-pixel regions among 444,269 selected pixels; those singletons carry approximately 10.995% of selected confidence mass. Two legitimate but **unevaluated** sparse variants were generated as private experimental GeoTIFFs with original geometry/NaN mask: (a) removing singletons retains 381,407 cells / 7.381% of valid area; (b) raising threshold to 0.35 retains 256,619 cells / 4.966%. These are not better scoring models until the full-area mapped-fault proxy shows evidence and (ultimately) an official eligible score confirms generalization.

**One isolated free CPU Work command, after confirming authorized GeoDAWN TIFFs are mounted**:

```bash
bash systemia/mission-bridge/gems/execute_full_area_replay.sh \
  /PRIVATE/official-geodawn-data \
  /PRIVATE/gems_001_verified_submission.zip \
  /PRIVATE/new-output/gems-002-full-area-20261119
```

The runner executes regression tests and **one full-area model/scoring run by default** to conserve Work quota. Set `GEMS_REPEAT=1` before invocation only when a second independent replay is justified; then its JSON fold ledgers must agree apart from elapsed time. Either mode writes `full-area-replay-summary.json` with the explicit repeat status. If original organizer files aren't accessible, stop. It does not upload data or contact DrivenData. Preserve original GEMS-001 and verified GEMS-002 candidate unchanged. Keep the one-per-UTC-day scored submission slot untouched unless the founder explicitly decides what exact file to submit.

## GEMS-004 training research: hard negatives with strict geographic isolation

The single actual-GeoDAWN full-area replay (archive SHA `68e1eea1bf6d4c565bee61e161f23dcd902e9711dee4a0e64322095b3ef04bc9`) found the prior 1000m-only exclusion method to be worse on the **full northern mapped-fault DTI proxy**, despite its corridor-only gain. Exact pooled north proxy: 0m baseline 0.071047 vs 1000m 0.066535. The 1000m gain in TP (+21%) cost ~46% additional FP. Retain GEMS-001's recorded public DTI 0.0552 as the scored incumbent; the GEMS-002 official public score of 0.0461 is participant-reported and not inferred from proxy scores. No further scored entry is authorized by this research note.

**New experiment `gems/gems_004_hard_negative_ablation.py`:** Keep the same pinned 34-feature archived `run.py`, HGB settings, three held-out 8-connected mapped-fault groups, 3 km training buffer, full northern known-fault-pixel-masked region, 0.20 threshold, ridge rendering, **and 5 unlabeled negatives per positive**. Within each fold:
1. Fit the unchanged baseline on all train-known positives and five random eligible negatives per positive, using seed 306.
2. Compute baseline probabilities ONLY for *additional unlabeled candidates within this fold's training mask*. Exclude all pilot-used pixels; restrict mined negatives to pixels more than 10 grid cells (1 km) away from *training-known* faults.
3. Rank these previously unseen-by-pilot negatives by predicted probability with deterministic pixel-index tie-breaking. Keep exactly two hard negatives per mapped positive.
4. Retrain with the **same** positive training cells, the first three random pilot negatives per positive, and the two mined hard negatives per positive (3:2 split, still 5:1 negatives overall).
5. Score the baseline and hard-mined models on identical **entire northern scoreable regions** plus the old 1.5 km corridors only as a secondary diagnostic. Preserve weighted TP/FP/FN, per-fold scores, sampling and isolation receipts.

This is a *hypothesis test*, not an improved candidate. Hidden newly mapped faults are not labelled. Unlabelled **hard negatives could be real faults**, so improved known-fault proxy is insufficient alone. The 8-neighbor components can be fragments of physical faults; the folds are not wholly independent geologic traces. All three folds are re-used for the earlier science; any positive result needs additional confirmation, not direct leaderboard promotion.

`gems/test_gems_004_hard_negative_ablation.py` covers exact 5:1 sample counts, deterministic highest-scoring fresh selection, prohibition of test/south/pilot overlap, fail-closed invalid input, real HGB fitting and a double synthetic replay with pooled full-area scoring. GitHub run `44673528846`, job `136079938507` passed these four tests and the existing scientific suite. The offline shell entrypoint is `gems/execute_hard_negative_ablation.sh` (syntax checked by CI). No production runtime, network fetch, DrivenData submission, or new candidate GeoTIFF.

To run one bounded **real-data scientific execution** when the original authorized three TIFFs are accessible in isolated Work or owned compute:

```bash
bash systemia/mission-bridge/gems/execute_hard_negative_ablation.sh \
  /PATH/TO/AUTHORIZED/GeoDAWN \
  /PATH/TO/PRESERVED/gems_001_verified_submission.zip \
  /NEW/PRIVATE/GEMS-004-EVIDENCE-DIR
```

The runner extracts only the hash-pinned original model from the preserved ZIP if absent, runs the four scientific tests, checks all organizer raster SHA-256 hashes, trains/scorers both fixed schemes on identical folds, and writes `run-a/hard-negative-full-area.json` and `hard-negative-decision-gate.json`. It performs **one run** unless `GEMS_REPEAT=1` is explicitly set. It never submits or promotes a model. Stop if the original authorized TIFFs are unavailable. Do not spend Work on rebuilding infra or re-downloading files for this test. Review the full-area DTI and per-fold FP/TP/FN before deciding whether stronger evidence exists; do not use the corridor score to justify a candidate.

### GEMS-004 confound-control amendment: distance-matched random negatives

**Do not interpret a hard-mined gain against the five-random-negatives baseline alone as proof that mining helps.** The hard variant takes two fresh negatives per positive from the >1km pool, so that treatment changes both distance distribution and ranking difficulty.

In the amended `gems_004_hard_negative_ablation.py`, each fold now trains **three** otherwise identical HGB models using exactly the same positive training pixels and 5 negative samples per positive:

| Name | Negative examples per positive | What it isolates |
| --- | --- | --- |
| baseline | Five seed-fixed random negatives, eligible at >0 pixels from training faults | Historical full-area reference |
| distance-matched random control | First three of those pilot negatives + two **randomly selected fresh** negatives from >10px training-only mining pool | Effect of distant-fresh sampling without hard ranking |
| hard-mined | Identical first three pilot negatives + two **top pilot-predicted fresh** negatives from that SAME >10px training-only pool | Additional effect of hard ranking, above matching the distance pool |

The pilot scores **only unlabeled pixels in the current training mask**. Neither evaluation labels, southern test pixels, nor previously pilot-trained samples are eligible. The random control uses a distinct deterministic seed `SEED+1009+fold`; both controls record SHA-256 digests of selected fresh flattened pixel indices. New leakage, determinism, equal-training-size and double synthetic full-fit tests in `test_gems_004_hard_negative_ablation.py` verify the contract. The offline runner's `hard-negative-decision-gate.json` now reports all three full-area pooled DTI proxy scores and weighted components, hard-minus-baseline, hard-minus-distance-control, and distance-control-minus-baseline, plus per-fold comparisons.

**Interpretation gate:** Any future claim that hard-example mining adds value needs a positive hard-minus-distance-control full-area difference, preferably across all three folds, with defensible TP/FP/FN tradeoffs. A positive hard-minus-baseline alone is not sufficient. This still does **not** establish hidden newly mapped fault performance, and it must not automatically generate a GeoTIFF or submit to DrivenData. Run once in authorized isolated Work CPU only when original hash-pinned GeoDAWN rasters are accessible. The amended suite has synthetic-model CI tests, not a real-data result.

### GEMS-004 distance stratification correction (Nov 20 UTC)

The first GEMS-004 random control was eligible-pool-matched, **not distance-distribution-matched**. It sampled randomly from all train-region pixels >10 grid cells from training-known faults, while hard mining ranked the entire same pool. Differences in proximity to known faults could therefore contaminate hard-vs-control conclusions.

The control in `gems/gems_004_hard_negative_ablation.py` now matches **exactly the fixed distance-to-training-known-fault BIN HISTOGRAM** of the selected hard examples, using predeclared `DISTANCE_BIN_EDGES=(15,20,30,50,80,130,200,320,500,800)` grid cells (100m/cell). Within each bin, it randomly samples the same count from the SAME eligible training-only pool without pilot pixels, with a distinct, fixed `SEED+1009+fold` seed. It never uses pilot probability ranking to pick the control, nor touches hidden/scored labels. The exact per-bin hard/control population counts and SHA256s of the selected flattened pixel indices are retained in private JSON evidence.

**This is coarse distance-bin matching, not exact real-valued distance matching**. If mining still appears helpful, examine per-bin score/training frequencies and independent fold outcomes; unseen true faults may be mislabeled in all negative samples. The revised `test_gems_004_hard_negative_ablation.py` directly tests equal per-bin populations, duplicate/fold exclusion guards, deterministic selection, and end-to-end three-model HGB replay on synthetic data.

This methodological fix invalidates a purported hard-mining gain from any prior, unmatched-control GEMS-004 execution; compare only results from the updated code, pinned in the evidence receipt. It does not establish any new real-data result, and no new candidate or DrivenData submission is authorized by this update.

### GEMS-004 / GEMS-005 cross-experiment baseline equivalence gate (Nov 21)

**Do not compare an apparent GEMS-004 hard-negative gain with GEMS-005 directional-feature gain until their independently recorded 34-feature baseline is demonstrably the same experiment.** Their scripts should use the same exact GeoDAWN SHA-pinned files, archived GEMS-001 code, grid, connected-fault folds, seed, training sample counts, scoreable geography and 300m padded DTI proxy scoring. The GEMS-005 southern crop was corrected to match GEMS-004's zero-padded proximity-kernel evaluation, with synthetic regression coverage. A difference in baselines makes direct cross-experiment ranking invalid.

`gems/gems_cross_experiment_gate.py` consumes the existing **private** GEMS-004 and GEMS-005 complete run-a JSON receipts, recomputes each weighted full-area and corridor proxy from all three fold TP/FP/FN components, matches per-fold baseline weighted terms and northern positive footprint, verifies common source/geometry, and rejects altered deltas, mismatched inputs, differing folds, hidden-score claims or submission/promotion flags. It does not retrain, infer new labels, download rasters, create a GeoTIFF, or contact DrivenData.

After both isolated authorized original-data replays have actually completed:

```bash
cd systemia/mission-bridge/gems
python3 -m unittest -v test_gems_cross_experiment_gate.py
python3 gems_cross_experiment_gate.py \
  --gems004 /PRIVATE/gems004/run-a/hard-negative-full-area.json \
  --gems005 /PRIVATE/gems005/run-a/directional-full-area-ablation.json \
  --receipt /PRIVATE/NEW/gems-cross-experiment-verification.json
```

The report is write-once. It includes the exact input-receipt SHA256 hashes, shared original-model digest, baseline and alternative mapped-fault proxy DTI, per-fold improvement counts and explicit `independent_new_fault_confirmation=false` / `automatic_selection_or_submission_allowed=false`. Matching baselines is necessary for fair comparison, **not** sufficient evidence of improved official score or generalization. Both experiments currently use reused *mapped-fault development* folds, not unseen hidden newly mapped faults. Refuse to generate a promotional claim or use another competition submission slot on that basis alone. Keep GEMS-001 selected.

The CI regression suite uses entirely fabricated receipt terms and tests happy path, tampering, unsafe state flags, score arithmetic, fold geometry, source digests, and write-once behavior. A green test suite is **not** a real-data GEMS-004 or GEMS-005 result.

### GEMS one-command authorized offline research handoff (Nov 21 PT)

`gems/execute_gems_research_bundle.sh` now offers one consistent operational entrypoint to the already existing GEMS-004, GEMS-005 and cross-experiment parity gates. This is a convenience for an **already authorized, isolated free/owned local CPU workspace**, not a ChatGPT connector or automatic Saban dispatch. Source data must already be accessible in that workspace. It does **not** download data, use a paid provider, create a candidate GeoTIFF, invoke DrivenData, choose a final prize entry, or touch Fabric/Penguin production.

The launcher preflights all three original SHA-pinned organizer rasters, their exact grid/19-band semantics and the preserved original `run.py` SHA256 **before** creating the write-once private output folder. It refuses missing/linked/modified inputs, invalid mode, output collisions, output inside source/repo, and repeated GEMS runs. Each scientific runner still performs its own input and model checks; a failure prevents the final summary. No unattended execution is scheduled.

Start with the **single hypothesis** intended to address the observed false-positive excess:

```bash
bash systemia/mission-bridge/gems/execute_gems_research_bundle.sh \
  hard \
  /PRIVATE/official-geodawn/data \
  /PRIVATE/gems_001_verified_submission.zip \
  /PRIVATE/new-gems004-evidence
```

Only if a second experiment is justified and the workspace has adequate free RAM/CPU, use `directional` in a separate new directory; `both` is an **explicit opt-in** to run *both* scientific experiments sequentially and then the cross-experiment parity gate, also into a fresh output directory:

```bash
bash systemia/mission-bridge/gems/execute_gems_research_bundle.sh \
  both \
  /PRIVATE/official-geodawn/data \
  /PRIVATE/gems_001_verified_submission.zip \
  /PRIVATE/new-gems004-gems005-comparison
```

A completed `both` run writes `cross-experiment-verification.json` and a private `handoff-summary.json` with explicit `scored_submission_made=false` and `automatic_promotion_allowed=false`. The GEMS-004 and GEMS-005 full fold ledgers remain private. A partial or failed output is **not** a completed study and must not be silently resumed or overwritten. CI exercises the launcher against fake inputs to prove fail-closed behavior; it never runs real organizer rasters.

**New Nov 21 organizer science clarification:** the expert panel may add *verified* fault candidates not present in the unchanged USGS/INGENIOUS set, including those on other published maps; probabilities feed the published scoring metric, while panel selection methodology remains undisclosed. Source: https://community.drivendata.org/t/final-prize-round-how-will-the-expert-panel-use-submitted-predictions/11611 . This does **not** provide hidden new-fault truth or license any external geological map for training. If validation shows only known-map proxy improvement, do not infer final-round uplift or spend an official submission slot. The established GEMS-001 official 0.0552 scored entry remains selected.

### GEMS 004↔005 exact training-pixel identity amendment (Nov 21/22)

The first cross-ablation audit proved matching data hashes, geometry, training **counts**, baseline footprints and weighted score terms, but matching counts does **not** prove that the two baseline HGBs fitted on identical pixels. This is a potentially serious attribution gap when choosing between hard-negative sampling and directional features.

Both `gems_004_hard_negative_ablation.py` and `gems_005_directional_ablation.py` now record `baseline_training_indices_sha256` per geographic fold, computed from the **ordered flattened positive+negative indices**, serialized as canonical little-endian signed int64 bytes. No raw training locations are exposed in the digest. The audit `gems_cross_experiment_gate.py` **fails closed** if either fingerprint is missing, malformed, or differs, even when fold counts and baseline DTI happen to match. The report adds `all_three_folds_exact_ordered_training_pixels_sha256_matched=true` only after those checks.

The synthetic CI suite tests equal-count/identical-score **different-pixel** rejection, absent/invalid digests, and both experiment scripts' ability to emit stable digests across independently executed synthetic HGB replay. **Older GEMS-004/GEMS-005 receipts without the index digests are ineligible for cross-experiment claims**. Do not fill those hashes in by hand or infer them from aggregate metrics; rerun once with the amended code in the authorized isolated dataset workspace if comparison is necessary. This is a stronger reproducibility guard, not a proof of better official DTI, and does not alter GEMS-001.

### GEMS false-positive geography and fault-truth conservation (Nov 21/22)

The DTI proxy rewards proximity to the held-out *mapped* fault pixels while penalizing predicted confidence elsewhere. GEMS-002 demonstrated that a corridor-only gain can hide a worse full-area result. A fair ablation must keep its **held-out truth population fixed** while recording the false-positive budget in the much larger outside-corridor region.

The cross-experiment evidence gate now checks, for **each fold, variant and both regions**, that weighted `TP + FN` equals the known held-out fault pixel count; the same prediction's `TP` and `FN` are unchanged between full northern area and 1.5km corridor; and the weighted full-area FP cannot be smaller than corridor FP. It independently recomputes pooled DTI from terms and records `weighted_fp_outside_heldout_1_5km_corridors` for baseline, distance-matched control, hard-mined and directional alternatives. Its synthetic tests deliberately alter TP without changing FN, shift TP/FN only in corridor, and inflate corridor FP; all must fail even where their **own DTI arithmetic still balances**.

Both existing isolated scientific runners (`execute_hard_negative_ablation.sh` and `execute_directional_ablation.sh`) now run those **same single-experiment checks before writing a decision summary**, including when the owner runs only `hard` (the lowest-cost recommended first execution). A mismatch is a hard stop and preserves existing evidence for investigation, **not** a result to reinterpret, suppress or auto-promote. The diagnostics measure **known-fault proxy FP geography**, not proof that an off-corridor prediction is geologically false; undiscovered true faults might exist there. Do not import outside labels or assume the official hidden DTI increased.

No competition candidate or scored upload is performed by this gate, and GEMS-001 remains the selected official scored entry.
