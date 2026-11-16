# EO-001 Gate 1 | consolidated supervisor source-review tree

**Status: SOURCE REVIEW ONLY / NOT FROZEN / NO FIELD OR MODEL ADMISSION**

This branch is based on previously green Forge research PR #2065 at
`ed5d81410fdde96071883a611d5e7cdfd756d780`, which includes the
whole-decision gateway/guard fixtures and its review-only admission holds,
the pre-stop independent supervisor *parser*, a two-phase held-FD read-only
collector, stable boot/PID-starttime and scoped identity refusal logic,
explicit 0-swap *synthetic-only* request, and optional private negative
receipt archiving. The base recorded dedicated CI and full Forge CI success.

It ports **exact source and test bytes unchanged** for the independent
subtree observer from PR #2122 at
`3bdb581b9c5273e5a8a090dcfc1cf83274d58fb5`:
- `eo001-cgroup-subtree-cleanup.mjs` blob
  `d0a49414568d16220d579bf1180d212def6b6ef5`
- `eo001-cgroup-subtree-cleanup.test.mjs` blob
  `ccb7ead64be039c9710110e2e2e226ad8118a943`

The earlier #2122 source/negative-control workflow reported 62/62
focused tests passed. Its full Forge CI failed two historical unrelated
MicroSeed authorization timestamp tests; the selected #2065 base already
carries the upstream correction and passed the general Forge suite.
**This new combined source tree requires fresh head-specific CI.**

## Important: two views, not yet one field runner

1. `eo001-readonly-supervisor-capture.mjs` is a two-phase, read-only,
   held-cgroup-FD observer that checks its own `/proc/self/cgroup` is outside
   the worker's scope, reads exact resources, tracks boot/PID-starttime
   and retains a private **negative** receipt when post-stop observation fails.
2. `eo001-cgroup-subtree-cleanup.mjs` is an independent, bounded
   read-only subtree traversal and two-snapshot *consistency check*.
   It rejects missing/replaced directories, changed node identities,
   unbounded resources, nonempty descendants and excessive elapsed time.
3. Both methods are tested on injected or synthetic filesystem evidence.
   Neither causes an exact systemd stop, creates a model worker, signs
   origin evidence, or proves a real detached child was safely killed.
   Their distinct verdicts are **not interchangeable** and cannot be
   aggregated as if they were two independent physical witnesses.
4. This remains **a coherent source-review tree**, not yet an approved
   *single executable* adapter + supervisor/stop runner. Do not merge or
   deploy to a node based on a CI result alone.

## Lab v0.2 outstanding review gates

The Lab's existing [PR #51](https://github.com/kaulastudies/ai-evaluation-lab/pull/51)
is the **single experimental contract**, and its unchanged
`run_plan.proposed.json` and `freeze_packet.proposed.json` remain the
authoritative proposal. Do not invent a competing run plan or local
approvals.

- Review a bounded, safe, **exact-unit** systemd scope-stop mechanism
  against a still-live detached new-session synthetic descendant.
  Numeric orphan PID/group signaling is not an acceptable shortcut.
- The approved owner-run physical gate on NextGen must show observer
  independence, stable host/process and cgroup identities, the effective
  memory/swap/process/CPU controls and *post-stop whole subtree empty*
  within an independently bounded cleanup deadline. If the kernel scope
  disappears before observation, verdict is **UNKNOWN**, not success.
- Retain **all** negative/timeout/partial artifacts in a private,
  auditable record with explicit provenance; only privacy-reviewed hashes
  and bounded findings are eligible for external sharing.
- Jointly select model-appropriate Qwen resource limits, actual
  runtime/model SHA-256 and effective generation settings, prompt renderer
  and context byte semantics, one warmup and separate startup/cleanup
  budgets. Keep **15 seconds per complete warmed decision** and
  **six decisions per scenario** unless both parties approve a new
  version *before* execution.
- Only after an identical digest-bound Lab/Forge review and **distinct**
  explicit host-owner approval may any new Gate 1 Qwen attempt run.

## Prior evidence is preserved, not promoted

Operator supplied a physical NextGen read-only cgroup preflight at
`03de0fcf1fedd2d9848c4d3ce22a47a068359cb0` and a
one-shot synthetic worker-reported scope readback at
`1e89a0c914fd2d59d789e91a32ed475ace720973`.
Neither proves independent scope-wide cleanup or hardware attestation.
Lab Gate 0 30/30 checks apply to documentary consistency with physical
provenance `UNVERIFIED_EXTERNAL`; they do not establish Gate 1 results.

## Commercial product boundary

Black Box PR #2098 may consume privately archived **negative**
EO-001 observations only as unsigned, unknown-result candidates to
the existing Black Box incident system, with an unverified Spider
Society persistence path. This source review does not constitute a
Chandra/AI Evaluation Lab certification, nor a commercial agreement.
Preserve both parties' independent code ownership and licensing rights.
