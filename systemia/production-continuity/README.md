# Systemia Production Continuity: non-actuating recovery canary

Tracks the gap between one agent job and the **whole life of a production**.

This initial slice is a pure local inspector. It **does not** enroll a mission in Systemia, schedule a heartbeat, dispatch agents, rewrite canon, publish a report, or certify production readiness. It supplies a testable continuity contract for [recovery issue #1922](https://github.com/jgaethle10/forge-operator/issues/1922).

## Run the owned local proof

```bash
node --test tests/production-continuity.test.mjs
```

Import `auditProductionLedger` from `./ledger.mjs` in an owned **private** worker. Pass a ledger shaped like:

```json
{
  "schema": "evercraft.production.continuity.v1",
  "projects": [{
    "project_id": "synthetic-episode-001",
    "current_stage": "ACTIVE",
    "next_action": {"kind": "editorial_qa", "owner": "little-red-studio"},
    "last_verified_receipt": {
      "verified": true,
      "receipt_id": "synthetic-receipt-001",
      "artifact_ref": "local://synthetic-test-only",
      "source": "fixture",
      "verified_at": "2026-11-09T21:00:00.000Z"
    },
    "review_due": "2026-11-10T21:00:00.000Z"
  }]
}
```

Use **real owned private storage** for actual artifact pointers, manuscript titles, source claims, reviewer names and plot details. Do not commit them to this public repository or log them to public CI.

## Policy

- One durable project ID across Little Red Studio, Fallen, TOWI, Journal and Clip.
- An actual verified artifact receipt, not an agent plan, resets the liveness clock.
- No owned next action means the item is orphaned; no valid fresh receipt means stalled.
- `WAITING_ON_EVIDENCE` may propose source review, never invent or publish a conclusion.
- `FOUNDER_DECISION`, canon, rights, publishing, outreach or spending gates always go to an authorized human.
- `RELEASED_VERIFIED` requires verifiable release evidence. `PARKED_INTENTIONALLY` requires an explicit approved hold.
- Scanner output consists of IDs, reason codes and proposed work, not unpublished source content.

## Next engineering gates

1. Map real private Systemia missions/agent receipts and authenticated artifact sources to this schema.
2. Store ledger in owned private infrastructure with audit/version provenance.
3. Connect owned Saban lease retries and specialist routing, with bounded per-lane permissions.
4. Run resident liveness checks and retain private receipts across machine restarts.
5. Build a mobile Systemia view: **Moving / Blocked / Needs Decision**, and test one full story and one evidence-led report.

This is the **canary and detector**, not the still-missing resident worker.


## Owned private Saban bridge: second engineering slice

The `receipt-bridge.mjs` module prepares **read-only, deduplicated recovery plans** in the existing Saban assignment shape. It also imports a completed Saban job as a production-evidence receipt **only** if the intended project, responsible agent, action kind, completed-state record, local artifact bytes, and SHA-256 all agree. Old jobs retain their historical timestamp; rereading an old artifact does not make it fresh.

Neither planning nor reconciliation dispatches workers, changes canon, removes draft versions, approves a research claim, or publishes a deliverable. A Saban worker still has to be separately admitted by authenticated owned infrastructure.

Run the synthetic proof without any real manuscript or report data:

```bash
node --test tests/production-continuity.test.mjs tests/production-receipt-bridge.test.mjs
```

Private reconstruction-only audit on an owned machine, **with input and output outside the public source repository**:

```bash
node systemia/production-continuity/run-private.mjs \
  --ledger "$HOME/.local/share/evercraft/production-continuity/ledger.json" \
  --out "$HOME/.local/share/evercraft/production-continuity/sweep.json"
```

When an **actual** locally owned Saban work-state and its private artifact directory exist, optional digest reconciliation can be added:

```bash
node systemia/production-continuity/run-private.mjs \
  --ledger "$HOME/.local/share/evercraft/production-continuity/ledger.json" \
  --saban "$HOME/.local/share/evercraft/production-continuity/saban-work-state.json" \
  --artifacts "$HOME/.local/share/evercraft/production-continuity/artifacts" \
  --out "$HOME/.local/share/evercraft/production-continuity/reconciled.json"
```

Saban completed result contract (synthetic example; real private files never belong in GitHub):

```json
{
  "schema": "evercraft.production.artifact-result.v1",
  "project_id": "synthetic-episode-001",
  "action_kind": "editorial_qa",
  "artifact_relpath": "synthetic-review.txt",
  "artifact_sha256": "<actual SHA-256 of local bytes>"
}
```

The completed Saban job must also carry a matching `job_id`, `updated_at`, `agent_id`, `work.key` and `work.kind`; it is not sufficient to write `state: completed`. No standalone private artifact hash establishes editorial quality, canon approval, or published status.

**Still pending:** trusted private mission intake, owned worker authorization, actual reviewer work, resident restart/lease proof, end-to-end agent receipts, mobile dashboard and release QA. **Do not claim unattended production is live on the basis of this source-stage bridge.**


## Offline mobile viewer

Open `systemia/production-continuity/private-view.html` locally on an owned phone or computer. Choose the private JSON produced by `run-private.mjs` (or the original private ledger). It renders three lanes: **Evidence current**, **Needs recovery / evidence**, and **Founder decisions**. A search, status filter and opt-in private-blocker reveal are provided. The file uses no network, cookies, analytics, browser storage, publishing APIs, or agent dispatch.

Only the generic viewer code belongs in this public repository. Keep loaded JSON and all unpublished story/research materials on a private device.
 

## Durable single-cycle checkpoint (source-stage)

`resident.mjs` runs one bounded continuity cycle against a **private, owner-only directory**. It refuses state located inside a Git checkout, takes an exclusive process lock, imports only byte-verified Saban artifacts, audits all ledger entries, and atomically persists an integrity-chained `resident-state.json`. A restarted cycle verifies the preceding state digest and keeps the prior ledger authoritative; an overwritten seed file cannot reset the production history. A crashed process deliberately leaves its lock for operator inspection rather than silently stealing an execution lease. This is **not yet a continually running service**.

On an owned node with this branch checked out, place the previously recovered private `ledger.json` into `~/.local/share/evercraft/production-continuity/` outside the Git checkout; ensure the directory has mode `0700` and ledger file mode `0600`. Then run:

```bash
node systemia/production-continuity/resident-once.mjs
```

The command prints only a sanitized cycle receipt and stores the full private state at `~/.local/share/evercraft/production-continuity/resident-state.json`. If a real `saban-work-state.json` and `artifacts/` are present in that same private directory, the cycle attempts byte/owner/action reconciliation. Otherwise it only plans recovery, not execution. No network access, publishing, payment, manuscript rewriting, or agent dispatch occurs.

**Continuous unattended execution is still blocked** until the actual owned Systemia/Saban worker, private mission authorization, timer or resident service, and restart/lease proof are installed and verified on a controlled device. The code and a passing synthetic CI test do not establish that these host-side steps happened.

The GitHub Actions `production-continuity-contract.yml` checks the three synthetic test suites on relevant pull requests. It deliberately never reads the private ledger or research/manuscript files.


## Parallel production slate: all living projects

`parallel-slate.mjs` now builds a **distinct, idempotent Saban work assignment for every authorized live project**, not only the 10 oldest continuity alerts. The logic does **not** impose a one-project-at-a-time franchise bottleneck. It is designed for multiple specialist departments to advance in parallel, while an owned worker pool controls actual heavy computation by node capacity.

It can prepare up to 12 simultaneous adapter slots for testing. Use a conservative capacity like 4-6 on constrained machines; that is **concurrency**, not a rule limiting the number of projects in the slate. A failure in one project must never kill the other jobs. The suite includes a 12-project / six-concurrent-worker canary with isolated failure handling, protected publication/canon holds and no untrusted manuscript text in the queue.

Prepare the whole private slate on an owned node **after** the 12-project private `ledger.json` has been placed outside this source checkout, with directory mode `0700` and file mode `0600`:

```bash
node systemia/production-continuity/prepare-parallel.mjs --max-in-flight 6
```

This creates the private `parallel-slate.json` once, refusing to overwrite existing work. It contains Saban-shaped **queued, unleased** jobs. It does not launch them and does not prove that department owner labels are registered Saban worker identities. Before real execution the resident must reconcile those identities with authenticated Saban capacity, persist job leases/checkpoints, and require verified byte-level artifacts from each specialist. Re-running the preparation command cannot silently reset work.

**Safety gates**: canon, rights, external outreach, spending, or publishing actions are explicitly held. Any verified byte-level artifact from a department remains *internal work evidence*, not a finished book, research conclusion, approved film, or public release. Private source files, recovered manuscripts, and the full production ledger remain outside the public repository.

The **production continuity contract** GitHub workflow now runs **39 synthetic tests across four suites**, including parallel fan-out. Passing CI is not proof of on-device installation or autonomous worker dispatch.


## Actual owned-node parallel source-audit worker (bounded first integration)

A new read-only **source worker** provides the first artifact-producing path for the 12-lane queue:

- `private-source-worker.mjs`: validates a leased private Saban job against an owner-only per-project source manifest, reads actual source bytes from a private directory, computes SHA-256 and file classification, and writes a separate immutable internal source-audit JSON artifact per job.
- `run-parallel-owned.mjs`: runs up to six asynchronous local audits concurrently by default. Every job lease is persisted to private `saban-work-state.json` **before** source work; each completion or failure is persisted independently. An interrupted run retains remaining queued/leased work; expired leases can be retried only under the existing Saban attempt limits. The entire wave cannot be silently reset by rebuilding its original queue.
- The worker re-reads the private ledger (or checks the integrity-bound resident checkpoint, if present) before any lease. Newly protected canon, rights, or publication gates cause the entire stale admission to refuse, requiring a fresh approved private queue.
- The artifact reconciliation bridge accepts this particular internal source-audit receipt as progress evidence **only** with `SOURCE_EVIDENCE_VERIFIED`, accurate bytes and correct owner/action linkage. Empty/missing-source reports are legitimate completed *audits* but NOT proof that those sources were recovered.
- No external model generation, public website posting, contacts, canon changes or money movement is performed by this worker.

This is not yet a resident agent service; **run on an owned Linux/WSL node only after** inspecting the private assets and confirming current Saban admission. It is not attached to Node001/Node002 by committing the files.

Private folder tree (all below directory mode 0700; individual files mode 0600):

```text
~/.local/share/evercraft/production-continuity/
  ledger.json              # true 12-project private ledger
  parallel-slate.json      # queued unleased work-state
  manifests/<project-id>.json
  sources/<private-file-name>
  artifacts/               # worker-created source receipts, not releases
  saban-work-state.json    # created by worker; never reset while live
  resident-state.json      # optional integrity-bound checkpoint
```

Required per-project input manifest format (synthetic placeholder):

```json
{
  "schema": "evercraft.production.source-input.v1",
  "project_id": "synthetic-story-001",
  "source_files": ["private-original.txt"]
}
```

After owned private files have been staged and verified, from this branch:

```bash
node --test tests/production-continuity.test.mjs tests/production-receipt-bridge.test.mjs tests/production-parallel-slate.test.mjs tests/production-resident.test.mjs tests/production-owned-worker.test.mjs

node systemia/production-continuity/run-parallel-owned.mjs \
  --private-dir "$HOME/.local/share/evercraft/production-continuity"

node systemia/production-continuity/resident-once.mjs \
  --private-dir "$HOME/.local/share/evercraft/production-continuity"
```

The owner should see individual **source-audit** receipts, 12 persisted job dispositions, a recovery/blocked distinction and no publication claims. A full autonomous literary/editorial/research system still needs authenticated resident deployment, specialized writing/review providers, ongoing intake/requeue and independent delivered manuscript/report QA.
