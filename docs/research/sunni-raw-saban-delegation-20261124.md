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
