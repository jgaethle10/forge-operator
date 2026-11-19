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

The first three geographically buffered folds determine the selected candidate; the southern fourth fold is reported independently and must never control candidate selection. Output: `evidence/gems-002-negative-buffer-ablation.json`, with all fold results, per-file organizer digests, fixed settings, and no submission. It does not modify GEMS-001, write a candidate GeoTIFF, submit to DrivenData, or auto-promote a new model. The score is the **archived local mapped-fault proxy**, not the organizer's official public DTI for newly mapped faults.

Run only in an isolated authorized environment with the official data and locally installed Python, NumPy, Rasterio, SciPy, scikit-learn:

```sh
# Copy the preserved GEMS-001 run.py into this directory before invoking.
python gems_002_negative_ablation.py --data-dir /private/official-data --evidence-dir /private/research-evidence
python -m unittest -v test_gems_002_negative_ablation.py
```

ChatGPT's current execution container does **not** have the three organizer rasters. The deterministic sampling and leakage test cases passed locally with synthetic small arrays; GitHub CI syntax-checks the script but cannot run the real-data training or dependency-heavy test suite. No actual GEMS-002 proxy scores have been produced by this new experiment yet. A separate gate is required before scored submission and daily UTC quota compliance.
