# Deep Agents ↔ Work Saban compatibility spike

Issue: https://github.com/jgaethle10/forge-operator/issues/1856

This branch is an **isolated research spike**, not a production integration. No credentials, public ingress, payment tools, or production worker admission.

## Verified upstream capabilities
Deep Agents supports isolated subagents, pluggable filesystem/sandbox backends, LangGraph checkpoints, MCP tools and local tool-calling models. Upstream README: https://github.com/langchain-ai/deepagents

## Existing Evercraft reference points
- `systemia/compute/runtime-node.mjs`: compute node runtime
- `systemia/yard/operator.mjs`: Yard execution boundary
- `systemia/yard/proof.mjs`: existing proof harness
- `scripts/findmypart-saban-benchmark.mjs`: deterministic Saban scoring pattern
- `scripts/work-saban-public-canary.mjs`: read-only public canary

These paths were found in GitHub code search; interfaces and permissions must be reviewed before any adapter is implemented.

## Proposed boundary

```
Systemia authorized mission
  -> Saban task coordinator
    -> optional Deep Agents worker adapter (disposable, no ambient authority)
      -> sandbox backend + approved tools only
      -> local model endpoint (only after tool-calling compatibility test)
    -> structured task receipt
  -> Fabric evidence verification and audit
```

## Minimal test mission
Input: two synthetic research documents stored in a scratch directory.
1. Subagent A extracts claims and cites exact source lines.
2. Subagent B independently checks claims against the second document.
3. Coordinator reconciles discrepancies into a final JSON report.
4. Kill and restart the worker during a test to evaluate checkpoint recovery.
5. Deny an attempted path traversal and a prohibited shell/network operation.

## Receipt contract (draft, not yet adopted)
```json
{
  "schema": "evercraft.saban.deepagents-spike.v0",
  "mission_id": "synthetic-001",
  "upstream_revision": "PIN_ME",
  "model": "PIN_ME",
  "sandbox_root": "EPHEMERAL_PATH",
  "subtasks": [],
  "artifacts": [],
  "checkpoint_recovered": null,
  "boundary_tests": [],
  "result": "not_run"
}
```

## Exit gate
Do not merge an execution adapter or enable production services until tests demonstrate reproducibility, failure recovery, denied unauthorized operations, and valid evidence receipts. Preserve Systemia as the sole authority for mission admission.
