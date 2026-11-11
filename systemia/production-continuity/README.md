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
