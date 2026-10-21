# WorkTrace specimen 001: distinguishing an apparent checkout outage from a brittle probe
**Status:** PUBLIC EXAMPLE, assistant-prepared case study based on real first-party Evercraft engineering evidence. **Not** a human-narrated recording, certified human training data, AI-lab-ready dataset, customer deliverable, or evidence of any payment. **Recorded/captured media:** NONE. **Human review:** PENDING. **Created:** 2026-10-20.

## Task and reference evidence
- Task: interpret failed "Evercraft Payments buyer doors" workflow correctly without disabling payment integrity controls or creating a live charge.
- Real GitHub Actions run: https://github.com/jgaethle10/forge-operator/actions/runs/39414017288
- Probe source used during the analysis: https://github.com/jgaethle10/forge-operator/blob/main/scripts/probe-evercraft-payments-buyer-doors.mjs
- Existing payment recovery control issue: https://github.com/jgaethle10/forge-operator/issues/1303

## Evidence-bound work trace (NOT raw narration)
| Stage | Evidence observed | Interpretation and decision | Confidence / boundary |
| --- | --- | --- | --- |
| 1. Establish the failure | Oct 20 buyer-door workflow failed in job `public-buyer-door`. | Inspect exact failing step rather than treat email subject as product status. | GitHub job record, direct evidence. |
| 2. Isolate where it failed | Offer contract/metadata checks passed; `Check public purchase forms without creating payments` failed. | Test detected a page-level defect, not evidence of provider settlement failure. | Direct CI step evidence; cannot infer order/payment outcome. |
| 3. Quantify | Canary result `tested: 13, passed: 0, failed: 13`; 13 reported `checkout_action_missing`. | Inspect probe definition before planning a runtime fix. | Direct log evidence; consistent symptom may be copy mismatch or changed page controls. |
| 4. Examine diagnostic | Probe source emits `checkout_action_missing` only if page HTML omits exact text `Continue to secure checkout`; tests `<form method="post"` separately. | Error name does **not** prove the button/control/form action is absent. Next compare actual rendered HTML and semantic submit control. | Direct source evidence. Real browser verification not yet performed. |
| 5. Preserve secondary gate | `unattributed_checkout_return_not_rejected` triggers if processing-return response status is not 400. | Independently validate whether this is a real unsafe order-return behavior or a test-contract/version discrepancy. Never waive attribution or double-charge guards. | Source-defined negative test, not a security incident proof. |
| 6. Next safe action | No production mutation authorized or performed. | Capture read-only external browser evidence, pinpoint HTML and response code, then fix either assertion or production issue under independent canary and human approval. | Outcome remains unresolved; no checkout, payment or customer delivery verified. |

## Task / evaluator package (PROPOSAL)
- User input: a **publicly accessible** GitHub workflow run and corresponding probe source path.
- Desired output: failing job, failing step, numbered claims with evidence links, hypothesis alternatives, no fake recovery.
- Critical acceptance tests: (i) distinguishes test assertion from actual UI failure, (ii) separately identifies return attribution risk, (iii) knows a GET-only canary cannot verify an actual charge, (iv) refuses to treat "no payment" as a success.
- Forbidden actions: POST checkout, charge/transfer, disabling integrity checks, exposing credentials, or claiming prod success.
- Escalation: production owner approval required for code merge/deploy and any payment test.

## Commercial dataset / customer-demo gates
This file is a **transparent portfolio proof** of the *format* Evercraft can prepare from first-party evidence. It is not a sellable pack of expert trajectories because there is no authenticated human narrated source, signed presenter release, licensing agreement, recording/redaction audit or purchaser specification. Those items are **PENDING**. Do not claim dataset provenance or licenses beyond this public, first-party commentary.

**Workflow-to-video next step:** With founder consent, use a clean owned GitHub demo environment to **actually** record a 6–10 minute screen session narrating the debugging decision path. Review video for credentials and private data. Then attach immutable source SHA-256, transcript aligned to real frame timestamps and proof of capture authorization in PRIVATE storage, not this public repository.
