# KAIDANCE: first source-repair candidate and red/green regression

## What the heartbeat can now do

The existing Kaidance 300-second workflow runs one registered Saban World Engine architecture review through Systemia's durable goal store. **Inside the same Saban resident cycle**, after a valid persisted review receipt, the new source-repair micro-adapter checks a single known defect in the Mossmere browser world source and proposes the exact fix:

- Before: the three inhabitants had a strict ID and memory check, but their saved positions `x` and `z` were not verified as finite and bounded.
- After: both coordinates must be finite numbers between -17 and +17 before the scene is accepted and bridged into the World Engine.
- A regression checks invalid `NaN`, positive/negative infinity, positions outside the world boundary, and safe fallback for invalid saved storage.

The candidate generator is **not** an arbitrary LLM or generic patch executor. It is one allowlisted, deterministic repair recipe with exact source anchors and content hashes. The source has already been repaired in this PR. After the PR merges, the live source detector should return `no_change_required`, not fabricate another repair.

### Proof semantics

The module stages only four allowlisted owned files in a disposable copy and runs the exact World Core / bridge tests **twice**: first with the new regression against vulnerable source (expected failure), then with the repaired source (required success). It hashes the results and cleans its scratch directory.

A still-current, source-fingerprint-matched, locally completed Saban review receipt is required before proposing the repair. The resulting `candidate.json` contains fingerprints, paths, before/after file hashes, proof status and a deterministic review branch name. It does **not** include executable shell commands or the raw patch. Same source fingerprint and candidate digest reuse the prior proof instead of repeating work every heartbeat.

The existing `kaidance-worlds-saban-runner.mjs` chains this proposer immediately after the registered reviewer using the **same** owned service clock, so no second scheduled execution authority is created. Kaidance's existing mission fabric gets the optional `kaidance-source-candidate` mission snapshot, with `counts.admitted:0` because producing a proof is **not** a provider mutation or finished engineering delivery.

## Boundaries

- The repaired source and regression in this PR are human-authored/reviewed GitHub changes. Do not claim an LLM independently discovered and published them.
- Existing GitHub Actions retains `permissions: contents: read`. It **cannot** create GitHub branches or PRs via this new module.
- No GitHub writer token, model inference, autonomous code generation, merging, deployment, customer data, payments, or social publishing occurs.
- The scratch test subprocess is not an OS-enforced network sandbox. The repair inputs are pinned owner-authored sources; arbitrary agent-authored code must never be executed on an owner host without separate secure isolation.
- CI artifacts and GitHub Actions cache are not equivalent to privately durable Penguin/NextGen runtime state. Real activation still needs the current owned deployment and at least two independent resident receipts.

## Actual code acceptance

```bash
node --test tests/world-core.test.mjs tests/world-bridge.test.mjs
node --test tests/kaidance-source-patch-candidate.test.mjs
node systemia/organism/kaidance-worlds-saban-runner.mjs \
  --out artifacts/kaidance-worlds-saban-review
```

The runner outputs `artifacts/kaidance-source-candidate/\{candidate,latest,state,mission-snapshot\}.json` beside the Saban receipt. A separate CLI `kaidance-source-patch-runner.mjs` provides local operator inspection of the same candidate.

## Next admission: branch-only reviewed GitHub PR writer

A future owner-runtime PR publisher can take the **exact source-bound candidate digest** and, only with its own authenticated Systemia gate and a narrowly scoped GitHub installation identity, create a deterministic isolated branch, write two allowlisted paths, open one reviewable PR, and independently refetch its content. It must never alter `main`, claim an issue fixed before review, or use raw assistant output as an executable script.

That provider-mutating step is **not enabled by this PR**. Its authorization must be separate from read-only Saban reviewer access. Continuous project improvements need a growing catalog of vetted source detectors and code-worker adapters, rather than a single perpetual cosmetic patch.
