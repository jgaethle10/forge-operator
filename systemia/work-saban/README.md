# Evercraft Work Saban · formation preview v0.1

**Product:** Evercraft Work Saban. **Promise:** You bring the work. Saban brings the team.

This first vertical slice accepts an ordinary office request, dynamically selects specialist roles, creates dependency waves, surfaces permissions, and returns a machine-readable, non-executing mission proposal. It uses the real Saban formation DAG utility; it does **not** claim to dispatch AI models or connected tools. Team cards always say `proposed_not_running`.

## Run locally

```bash
node systemia/work-saban/mission.mjs --task "Analyze monthly sales and build presentation slides"
node systemia/work-saban/mission.proof.mjs
node systemia/work-saban/server.mjs
# browse http://127.0.0.1:8789
```

The preview binds only to loopback and stores no task submissions. The server allows only JSON POST requests to `/api/compose`, rejects cross-origin requests, and has a 16 KiB request ceiling. The UI escapes user-visible text using `textContent`. There is no paid tier or payment action.

## Next governed runtime integration

1. Authenticate an employee and bind team/task to a private workspace with retention policies.
2. Map specialist roles to approved `systemia/saban/multiplication-registry.json` software contracts. Do not turn generated role strings into executable code paths.
3. Obtain consent per connected source, per outbound action, per spend. Default to preparing drafts and analysis only.
4. Admit missions through Systemia; use existing Saban `admission.mjs`, `registered-worker.mjs`, scheduler, NodeSeed leases, and receipt checks, never shadow execution.
5. Stream actual agent/tool events to the UI. Maintain an honest distinction among proposed, queued, executing, verified, and delivered states.
6. Verify provenance/quality, durable idempotency, tenancy, redaction, retry behavior, quotas and end-to-end outcomes before a customer-facing release.

## Acceptance criteria for preview

- Arbitrary nontrivial office text yields a clear team and DAG with deterministic role selection.
- Data task includes Analyst; writing task includes Communications; slides include Designer.
- Concurrent specialists share a wave; auditor waits for specialists; coordinator waits for auditor.
- Invalid or oversized inputs are rejected.
- Formation does not authorize external side effects, account access, payments, or compute.
- No live agent execution is claimed absent independent receipts.

This is a deployable preview foundation, **not** evidence of autonomous task completion or a functioning checkout.

## Governed local execution v0.2

The local product preview now has a **Run example team** action. It runs a **clearly synthetic** six-row, three-month sales CSV fixture against a **registered Saban multiplication contract** with five independent role assignments in dependency order:

1. Analyst: validate month/revenue CSV and sum exact integer cents by month.
2. Writer: generate a fact-only written summary without invented causes.
3. Designer: package a Markdown report with source SHA-256 and monthly table.
4. Auditor: independently recompute each monthly total and the latest change, verify input provenance and report hash, and fail closed on discrepancies.
5. Coordinator: prepare the audited result for explicitly authorized local delivery.

Each specialist goes through Saban's canonical registered-worker boundary, work-state lease / scheduler, admission constraints and per-stage quality checks. This is **actual local deterministic software execution**, but not model inference, a remote enrolled HP/Chromebook worker, or end-user identity/authenticated multitenant execution. A current operator must run it locally; no background service or customer-facing checkout is implied.

Try the CLI with synthetic data:

```bash
node systemia/work-saban/execute-local.mjs --demo --out /tmp/work-saban-deliveries
node systemia/work-saban/execute-local.proof.mjs
```

For an owned CSV you authorize locally:

```bash
node systemia/work-saban/execute-local.mjs --csv /path/to/monthly-sales.csv --approve-local-read --out /path/to/approved-private-output
```

Only month and revenue columns are analyzed. Input size is bounded to 256 KiB and 2,000 rows. There is **no HTTP customer CSV upload** or third-party account access. The report is written only to an explicit local output directory, alongside a receipt with the input/report digest and worker verification timeline. The source CSV is not uploaded or bundled into the receipt. Temporary test files are removed during CI.

This proves a narrow real office-work outcome with evidence. It does **not** establish generative multi-agent quality, production autonomy, distributed compute readiness, server-side customer security, any payment, or broad office task support. Those require separate gates from Issue #1630.
