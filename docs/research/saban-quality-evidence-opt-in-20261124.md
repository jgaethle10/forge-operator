# Saban canonical quality gate: optional shadow sales evidence

**2026-11-24 / Source-only integration.** No customer task, remote worker, payment, deployment, or production authorization executed.

This follow-on to merged PR #2555 extends the **existing** Saban quality evaluator; it does **not** create another agent dispatcher.

## Opt-in contract

An existing Saban contract may explicitly set \`quality.require_shadow_sales_evidence=true\` in a reviewed experiment. The evaluator then requires a caller-origin \`shadowSalesEvidence\` object with:
- a mission ID and source CSV whose SHA-256 matches the declared source;
- two *distinct* analyst/auditor assignments, bound role/task/agent/idempotency keys;
- independently expected output hashes and byte counts frozen by a trusted coordinator before worker execution;
- two bounded local artifact files in a coordinator-controlled private workspace;
- worker reports that match the mission and source.

The existing \`shadow-delegated-sales-reconciliation.mjs\` reads both artifacts, rejects tampering and missing outputs, reruns the existing Work Saban CSV arithmetic validator, and checks that the auditor's document is bound to the analyst digest and source. Without this evidence, the quality status is \`fail\` and enforcement is forced to \`fail_execution\`, even if the contract attempts to declare \`receipt_only\`. Existing contracts not explicitly opted in retain their old behavior.

The module is threaded through \`executeMultiplicationPlan\` as an **optional private caller argument**. The public Saban CLI, standing product registry and automated runtime integrations do not provide this argument and are unchanged. Adding an opt-in requirement before wiring a real coordinator therefore fails closed rather than minting fictional verified work.

## Why this remains a shadow proof

- This is a source-level deterministic artifact and arithmetic test. It does not authenticate worker identity, prove a signed NodeSeed lease, replace the mission/Passport admission, or execute live language models.
- The trusted caller must establish predeclared expected artifact hashes independently. A model cannot provide the expected hash after it wrote its output.
- The private local scratch directory must be controlled by the coordinator. The existing path checks and re-read are **not** a hardened adversarial concurrent filesystem sandbox.
- Do not persist the original CSV in public receipts or GitHub. Quality receipt includes only status, source digest, counts and reason.
- No unrestricted shell, arbitrary sudo, customer-data export, paid inference, outreach or release has been enabled.

## Proof

\`node --test systemia/saban/quality-evidence-opt-in.test.mjs\` contains 12 cases for opt-in/legacy behavior, valid evidence, missing/tampered evidence, false overrides, ordinary scheduler failure, role errors and privacy. The Saban CI workflow executes this suite alongside the existing shadow evidence and NodeSeed tests. Check **the exact PR head** before merge.

## Next real-work gate

Extend the *existing* Work Saban CSV pilot (#1630), not a second platform: authorized owner-private CSV source, immutable coordinator mission manifest, registered analyst + auditor adapter assignments, Passport/NodeSeed scoped leases, durable receipts and independent domain review. First show a real permissioned local worker task with redacted trace and a read-only deliverable; only then make production execution or customer claims.
