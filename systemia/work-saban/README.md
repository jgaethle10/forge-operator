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
