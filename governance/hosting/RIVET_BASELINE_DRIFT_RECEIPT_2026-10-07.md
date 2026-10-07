# RIVET Locked-Baseline Drift Receipt

Status: **DIAGNOSTIC ONLY - NO REPAIR AUTHORIZED**

Observed: 2026-10-07 during PR #1144 hosting-readiness CI.

## What happened

The hosting-planning PR changed zero protected RIVET product paths. Its protected-path diff gate passed.

The existing locked-baseline test then failed on the PR merge result because the base branch already contains a mismatch in:

`systemia/rivet/report-runtime.mjs`

Expected git-blob SHA from `tests/rivet-change-control.test.mjs`:

`b1f410305111f61f6dc132b696215676710955fb`

Observed git-blob SHA on current main/PR base:

`86b66a17fd45c1ce6f7834ae88038658f438fe3d`

GitHub Actions run:

`37694140395`

Job:

`113041423398`

## Governance interpretation

This receipt does **not** determine whether the later file content is valid, desirable, or approved. It only records that the repository's current protected baseline test and current main branch disagree.

Because RIVET is partner-controlled, this package will not:
- edit the protected runtime;
- repin the expected hash;
- bless the newer hash;
- revert the newer hash;
- infer approval from unrelated merges.

Any resolution requires explicit RIVET owner review outside this hosting-planning PR.

## CI behavior

The hosting-readiness workflow is therefore designed to:
1. fail if this PR changes any protected RIVET product/governance path;
2. compare the locked-baseline test on the base branch and PR head;
3. fail if this PR introduces a new baseline failure;
4. emit a warning, rather than mutate RIVET, when the same baseline failure already exists on the base branch;
5. continue to execute the isolated brand-fidelity proof.
