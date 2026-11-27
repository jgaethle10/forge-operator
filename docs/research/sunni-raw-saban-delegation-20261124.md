# Sunni RAW → Evercraft Saban: safe delegation evidence probe

Date: 2026-11-24. Stage: SOURCE-ONLY SHADOW RESEARCH / NOT DEPLOYED.

## Source review

Statically inspected the user-provided Sunni RAW 0.1.3 source archive and DarkMatter Development Genome 1.0.0 process guide. The raw archive contains a native Ollama model/tool loop, JSONL event logging, persistent CLI objectives/model selection, filesystem tools, and a run_shell tool. The archive explicitly warns that the shell is not sandboxed and model completion is not independent objective verification.

Adapt the pattern; do not copy the code or import the privileges. This contribution contains no original Lux source files, no model, no environment from RAW, no live network calls and no automatic sudo.

## Existing Evercraft capabilities

Systemia retains admission and authority. Saban already has registered workers, formation, recursive admission, bounded leases, state, and receipt verification. Raven already provides local-model routing. Reuse these instead of building a competing agent framework.

Related tickets: #1630 (Work Saban audited CSV task), #1856 (isolated subagent harness), #1860 (governed multi-model routing), #2416 (one-body company integration).

## This proof

The new shadow-only module systemia/saban/declared-artifact-evidence.mjs checks one local deterministic artifact against an expected SHA-256 digest and byte length independently specified by the coordinator before dispatch. Worker text, success flags, and exit status cannot satisfy the contract.

It returns declared_artifact_match only when coordinator-visible file bytes match the predeclared contract. Missing files, altered bytes, invalid paths, symlink traversal and oversized files hold.

Important limitations: it proves only an exact match to an expected artifact, NOT semantic correctness of open-ended tasks, independent runtime identity, or a signed chain of custody. The caller must establish expectations independently and keep the root private. It is not yet wired into Saban quality gates or live dispatch.

## Local reproduction

Run the test suite:

    node --test systemia/saban/declared-artifact-evidence.test.mjs

Run a purely synthetic local demonstration:

    ROOT="$(mktemp -d)"
    printf '2\n' > "$ROOT/result.txt"
    SHA="sha256:$(printf '2\n' | sha256sum | cut -d' ' -f1)"
    node systemia/saban/declared-artifact-evidence.mjs --root "$ROOT" --artifact result.txt --sha256 "$SHA" --bytes 2 --agent example-raw --key synthetic-204
    rm -rf "$ROOT"

Local Node 22 source preparation test result: eight scenarios PASS. CI must be independently verified on this PR head. No runtime deployment is claimed.

## Next engineering gates

1. Coordinator-origin independent objective assertions for the existing CSV reporting pilot, including separate calculation and auditor roles with source file hashes.
2. Local synthetic parent-to-two-registered-worker delegation with bounded workspace, trace IDs, checkpoint/replay/idempotency receipts; explicit process and model limits.
3. Compare with existing Saban (quality, traceability, resource use, latency, replay reliability). Add an opt-in quality gate only after verified trust and integrity boundaries.
4. Real local inference on owned Penguin / NextGen only after Systemia admission, Passport permissions, NodeSeed leases, reviewer approval, and independent receipts.

Never import RAW's unrestricted shell or infinite autonomous loop into privileged services. Keep its source outside the repo unless Lux grants distribution rights.


## 2026-11-24 follow-on: two-role sales reconciliation (shadow only)

New \`systemia/saban/shadow-delegated-sales-reconciliation.mjs\` accepts a coordinator-declared mission with analyst and auditor assignments, a source CSV identity, unique bound task IDs, unique idempotency keys, worker reports and **two real local artifacts**. It runs the existing Work Saban \`checkSalesReport\` second-pass arithmetic check against the source rather than trusting either worker's \`verified\` flag. Both artifacts must agree with their own predeclared SHA-256 and byte counts, and the auditor's declared source and analyst digest must match.

The accompanying \`shadow-delegated-sales-reconciliation.test.mjs\` runs twelve synthetic and adversarial scenarios. The test fixture creates deterministic outputs in a throwaway private directory, not genuine independent model workers. The reconciler is intentionally read-only: it does not dispatch, persist state, invoke models, call shells, send data or grant credentials. Re-running the verifier is deterministic but is **not** durable NodeSeed idempotency or process-crash recovery.

The Saban multiplier workflow now runs **both** evidence test files; the exact PR-head Actions result remains the verification gate. No production runtime integration, invoice, customer deliverable, or external network claim follows from these fixtures.

Limitations: the expected hashes must be frozen by an authorized coordinator **before** work begins, distinct agent IDs in a JSON manifest do not authenticate agents, and checks against a mutable local directory are not a hardened cross-process identity/provenance transport. For real work, bind to the existing signed NodeSeed/Passport receipts and independent source-scoped authorization, then complete the Work Saban pilot's multi-tenant and customer-security review.


## 2026-11-26 follow-on: complete remote-source observations before task reconciliation

Raven #2616 rejects clipped/incomplete model outputs; NodeSeed #2618 adds opt-in, hash-bound, byte-exact file pages over the existing authorized Remote Operator. The next **shadow-only Saban** boundary is \`systemia/saban/remote-source-observation.mjs\`: given coordinator-predeclared source SHA-256 and byte length, mission and source bindings, and a captured sequence of paged replies, it refuses to call source bytes verified unless **all** pages are in order, byte-exact, page-hash valid, same whole-file identity, and terminated with the explicit final-page marker. Missing pages, invented completion, stale hashes, replayed pages, unexpected extra pages and malicious base64 hold. A worker's claimed success never overrides this check. The module does not read the remote filesystem or create a service.

The **existing** \`reconcileShadowSalesDelegation\` now has an optional source-page input. If a source observation is declared in the coordinator manifest, missing or inconsistent pages stop reconciliation **before** either worker's artifact can be accepted. Once complete source bytes are verified, the existing artifact SHA/byte checks and independent sales arithmetic check remain mandatory. The previous non-remote shadow workflow stays unchanged when no remote observation is declared. The caller is responsible for a trusted declaration; the verifier cannot establish who created it or when.

Source-observation status is deliberately **not** \`task_complete\`, \`authenticated_worker\` or \`objective_semantics_verified\`. The observed payload is caller-captured, not a signed immutable node snapshot; source page hashes do not prove the node identity or a hostile filesystem's immutable history. The synthetic test uses real local Remote Operator reads and source fixture bytes only; no network, customer information, model execution, shell, live deployment, systemd unit or duplicate heartbeat.

Reproduce:

    node --test systemia/saban/remote-source-observation.test.mjs
    node --test systemia/saban/shadow-delegated-sales-reconciliation.test.mjs

The established Saban multiplier workflow runs both suites. Do not promote this shadow proof into automatic action or claim real independent agent verification until the existing Passport / NodeSeed attestation, coordinator expectation custody and live admission are established.


## 2026-11-26 signed-session Saban source read proof (separate from field acceptance)

The next small, source-only proof is \`systemia/saban/attested-remote-source.mjs\`. It uses the **existing** Yard remote-capacity inventory and authorized control grant, requires connected/authorized/session-attested NodeSeed inventory and matching fingerprints, and issues an independently generated fresh nonce through the existing \`/v1/attest\` broker path. The preexisting device identity verifier checks the Ed25519 statement against the nonce, node ID and selected device fingerprint before any file pages are accepted. It then reads the declared source through the existing outbound-only Remote Operator paged-read API, with SHA-256 continuity between pages and the complete-source evaluator from merged #2622.

The only externally returned receipt contains immutable-looking **hash references and counters**, not source content, allocator tokens, private identity keys, raw signatures, or remote HTTP error bodies. It explicitly reports \`field_verified: false\`, \`physical_hardware_verified: false\`, \`objective_semantics_verified: false\`, \`coordinator_expectation_origin_attested: false\`, \`runtime_dispatched: false\` and \`runtime_mutated: false\`. Source digests and an attested session establish a bounded evidentiary link, **not** individually signed file pages or an immutable source snapshot. The caller must have a trusted predeclared whole-file digest/byte count and cannot trust self-reported agent success.

Proof command: \`node systemia/saban/attested-remote-source.proof.mjs\`. The test starts a real, locally scoped **synthetic** Yard + broker host + signed NodeSeed + outbound agent, exercises a fresh attestation, reads a synthetic multi-page source, and deliberately fails invalid source expectations, secret paths, wrong device fingerprints, modified signed statements, changed sources and unapproved loopback routes. It is added to the existing Saban multiplier workflow, not a scheduler or deployment.

**Still required before claiming the founder's live-hardware milestone:** a genuine authorized Yard broker deployment and actual admitted Penguin/NextGen NodeSeed, with a verified route, approved source path, trusted predeclared SHA/length, capture of the identity and page receipts, and independent verification on that live node. Neither a CI simulation nor a cryptographically signed device identity alone certifies physical field readiness or authorizes any mutation. Maintain FindMyPart revenue priority and the existing heartbeat.
