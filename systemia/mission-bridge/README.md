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
