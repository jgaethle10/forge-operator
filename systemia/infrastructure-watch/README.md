# American Infrastructure Watch → Systemia → Kaidance evidence connection

## Actual scope
This lane plugs **American Infrastructure Watch (AIW)** into the existing five-minute company heartbeat as a **review-only, source-bound discovery lane**. The public beta at `https://fabric.systemiacommandcenters.com/infrastructure-watch/` remains the existing immutable, dated static release. No DNS, Caddy or production content is changed by this integration.

### Connected contract
1. `systemia/infrastructure-watch/source-registry.v1.json` pins three official public FHWA bridge inventory/catalogue pages and their source-year/scope distinctions. The list has a strict hostname/path allowlist and no runtime secrets.
2. `systemia/infrastructure-watch/aiw-evidence-watch.mjs` runs on the existing five-minute coordination clock but contacts official pages **no more than once per 24 hours** unless the previous receipt is missing or the allowlisted source registry changes. It enforces small response budgets, bounded timeouts and first-run baseline behavior.
3. On each actual scan it emits private `latest.json`, `state.json`, `queue.json`, and a Kaidance-compatible `mission-snapshot.json`. Source page fingerprints are **change candidates**, not newly inspected bridges or safe/unsafe route conclusions.
4. The existing `kaidance-company-heartbeat-runner.mjs` receives an optional dated, zero-mutation receipt using `--aiw-receipt` or `SYSTEMIA_AIW_EVIDENCE_RECEIPT_FILE`, and adds verified AIW source-change/failure reviews to the existing private company queue and mission snapshot.
5. `kaidance-next-action.mjs` may nominate an allowlisted AIW review when a real source receipt exists. Its action always has `dispatch_authorized:false` and never updates production.
6. The `kaidance-frontier-field.yml` job adds offline contract tests and a bounded public read-only scan before its existing company heartbeat, caches daily source state, and uploads private evidence receipts. GitHub cron is **best effort**, not a guaranteed wall-clock runtime.
7. `systemia/core/resident-services.json` also names an optional owned resident `aiw-evidence-watch` cycle. It remains **unproven in production** until the owner configures the private output path and observes real Systemia supervisor receipts.

## To admit the owned resident lane
An authorized owner/Systemia operator must validate `systemia/core/resident-services.json` against the current owned Compute supervisor deployment, configure a durable private path for `SYSTEMIA_AIW_EVIDENCE_OUT_DIR` outside the source checkout, and set `SYSTEMIA_AIW_EVIDENCE_RECEIPT_FILE` to the **same directory's** `latest.json` in the existing Kaidance company heartbeat process environment. Deploy only through the existing Systemia process and record the deployment/heartbeat readback receipts. Do not assume those environment bindings or the resident service are already running.

For a manually authorized read-only canary on an owned node:

```bash
node systemia/infrastructure-watch/aiw-evidence-watch.mjs --out /path/to/owned-private/aiw-evidence-watch
node systemia/organism/kaidance-company-heartbeat-runner.mjs \
  --out /path/to/owned-private/kaidance-company-heartbeat \
  --aiw-receipt /path/to/owned-private/aiw-evidence-watch/latest.json
```

Use operator-approved real paths; do not copy a generic path literal into a production unit. These commands **do not** change live public content. The source-watcher is idempotent within the daily window, and company heartbeat is deduplicated per five-minute tick.

## Still a separate, gated next phase
**Not connected or claimed here:** automatic federal inventory downloads, schema reconciliation, QA of bridge records, owner-approved publication, Caddy static release cutover, or real-time infrastructure hazards. These require source/rights/record-year validation, an immutable release, QA receipts, rollback and an authorized promotion process. No current AIW source metadata fingerprint qualifies as such approval. The initial public beta's 2025 state summary vs Washington 2026 deep detail distinction must remain visible.

## What constitutes proof of a running connection
- Passing integration tests on the PR and a successful `KAIDANCE frontier field cycle` run showing AIW's `latest.json`/queue and company heartbeat `infrastructure_watch.status="verified_receipt"`.
- Then, separately, a resident Systemia deployment/heartbeat receipt plus Kaidance's receipt readback on owned Compute. Source-file registration alone is **not** proof of resident execution.
- Public site remains the same until a separately authorized, independently validated release.
