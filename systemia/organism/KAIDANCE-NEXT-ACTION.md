# KAIDANCE: one-company next best action

The existing five-minute `kaidance-company-heartbeat` service now includes a
**read-only evidence reconciler**. The reconciler runs as a call inside the
existing heartbeat, not as another scheduler, resident, provider client, or
privileged dispatcher.

It reads only five known sibling receipt paths beneath the same configured
owner-private state parent:

- `kaidance-worlds-saban-review/latest.json`
- `kaidance-source-candidate/latest.json`
- `kaidance-source-candidate/candidate.json`
- `kaidance-offer-checkout/latest.json`
- `kaidance-offer-checkout/actions.json`

The current company report and previously computed company queue are passed in
memory, so the reconciler never invents a source report. Missing optional
sources remain visibly `missing`. Stale reports (over 15 minutes), schema
mismatches, public-readable files, symlinks and malformed receipts can **never**
supply a verified sale or code action.

## Decision contract

A high-priority operator reconciliation HOLD wins over ordinary work. Otherwise,
verified checkout-placement review is prioritized over Clip promotion/merchant
readback gaps, which are prioritized over independently proven source-repair
draft-PR proposals. The unbound product lane is a final fallback.

The output is deliberately one **next handoff** at a time, plus up to ten
ranked candidates. Every entry declares its existing Systemia or merchant/Clip
authority boundary and `dispatch_authorized:false`.

A previously observed handoff has the same stable `decision_ref`; repeated
beats report `counts.changed:0` and `counts.admitted:0`, not "work done."
A new unresolved handoff may yield `counts.changed:1` but is still not
execution. The reconciliation receipt does **not** claim provider refetch,
sales, accepted payment, new PR, social publication, or production deployment.

## Outputs

The same private output directory as the company heartbeat receives:

- `next-action.json`: rank and rationale by controlled action key
- `next-action-state.json`: private, stable decision watermark
- `next-action-mission-snapshot.json`: existing Collider schema

A new **optional** `kaidance-company-next-action` source reads the latter.
The existing GitHub Actions `*/5` job and owned `kaidance-company-heartbeat`
resident service are unchanged. GitHub Actions cache preserves the watermark as
best-effort CI continuity; it is **not** evidence of continuous owned runtime.
On an owned node, the checkout, source-candidate and Worlds outputs must truly
be under the declared sibling state root or will remain missing. Do not copy
private merchant credentials to that root or put any runtime state in GitHub.

The owner-host resident and mission publisher must independently verify their
private paths and ingested snapshot. Nothing here activates Penguin or NextGen,
provisions credentials, merges code, creates Stripe links or grants Harbor/Clip
publishing authority.

## Tests

```bash
node --test tests/kaidance-next-action.test.mjs tests/kaidance-company-heartbeat.test.mjs
```

These run in the existing KAIDANCE field-cycle CI, before the company heartbeat
and the existing Saban/offer lanes. On that first CI cycle a newly produced Saban
or offer receipt is typically observed on the **next** company heartbeat,
because this reconciler does not reorder or duplicate the existing workers.
