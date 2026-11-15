# EO-001 Gate 1: supervisor-owned subtree observations

**Status:** draft PR #2122; source review and synthetic local-filesystem tests only. No physical execution or systemd scope stop is authorized by this code.

## Why this work is not a new startup test

Physical NextGen field evidence already exists:

- Read-only capability preflight at source `03de0fcf1fedd2d9848c4d3ce22a47a068359cb0` returned `CANDIDATE_NEEDS_EXPLICIT_SYNTHETIC_FIELD_CANARY`, as recorded in [Forge PR #2042](https://github.com/jgaethle10/forge-operator/pull/2042).
- A separately approved synthetic `systemd-run --user --scope` canary at the then-reviewed code reported `ONE_SHOT_SYNTHETIC_CGROUP_RESOURCE_READBACK_REPORTED`, per [Forge PR #2045](https://github.com/jgaethle10/forge-operator/pull/2045). This is a report from the worker's perspective, not independently verified physical subtree cleanup.
- The Lab's proposed [EO-001 Gate 1 v0.2 contract](https://github.com/kaulastudies/ai-evaluation-lab/blob/0ace9a564f5a2049174750e16fdfefa3cf211e0a/research/eo001_coordination/EXPERIMENT_CONTRACT_v0.2.md) remains **NOT FROZEN** and requires a supervisor outside the worker cgroup to verify the actual resource controls, a still-live new-session descendant, and post-stop empty-subtree evidence within its own cleanup deadline.

Do not repeat or confuse the earlier scoped resource canary with the pending independent cleanup proof.

## Source composition

This stacked draft combines the exact existing **pre-stop, injected-observation parser** `eo001-cgroup-supervisor-observer.mjs` and its tests from [PR #2045](https://github.com/jgaethle10/forge-operator/pull/2045) with the new `eo001-cgroup-subtree-cleanup.mjs` and tests. It also carries forward the **boot ID / field-22 process-starttime negative controls** from [PR #2058](https://github.com/jgaethle10/forge-operator/pull/2058).

This is better integration for **review**, but the model adapter, final runner, supervisor source, effective Qwen generation settings and Lab freeze packet have **not** been approved as a single physical execution revision.

## Read-only subtree algorithm

`readSyntheticScopeSubtree()` accepts an exact `ControlGroup` path ending at a generated `eo001-g1-synthetic-<32 hex>.scope`, under the cgroup v2 mount. It refuses relative paths, traversal, extra path components, symlinks, unexpected mount identities, missing boot ID or unavailable resource readbacks.

A bounded traversal reads each descendant cgroup directory's `cgroup.events`, with an exact single `populated` key and device/inode identity, and stores the relative node identity. The snapshot includes the actual read-only values of `memory.max`, `memory.swap.max`, `pids.max` and `cpu.max`. These values are **observations**, not evidence that a model-appropriate resource budget has been agreed.

`assessSyntheticSubtreeCleanup()` evaluates two captures with a supplied explicit resource plan. A consistent outcome requires:

1. A populated **pre-stop** subtree.
2. Same generated unit, boot ID, ControlGroup hash, and root device/inode before and after.
3. Same full relative descendant directory set and each directory's device/inode across captures. Any disappearance/recreation is **unknown or blocked**, not success.
4. Every **post-stop** subtree `cgroup.events populated=0`. An empty `cgroup.procs` file is deliberately not a substitute.
5. Identical frozen resource values before/after, including explicit swap policy; any unapproved drift blocks.
6. A monotonic elapsed observation interval no greater than its separately specified cleanup limit.

On structural consistency it returns only `TWO_SNAPSHOT_KERNEL_READBACK_CONSISTENT` with `actual_systemd_stop_independently_observed=false` and `execution_authorized=false`. A snapshot hash, CI run, or owner's copied host output is not physical hardware attestation. No process is spawned, no systemd unit is created/stopped, and no live model called.

## Deliberate refusal cases

- Post-stop scope no longer exists or is unreadable: **BLOCK**, not `clean`.
- A descendant remains populated (even if the top-level snapshot is falsely empty): **BLOCK**.
- Recreated inode or new/missing subtree: **BLOCK**.
- Missing `memory.swap.max` or incompatible resource-plan policy: **BLOCK**, unless a new jointly reviewed contract explicitly resolves the limitation.
- Wrong boot, expired cleanup observation, symlink or malformed events: **BLOCK**.

Tests exercise these cases using **real read-only filesystem operations on local fake cgroup directories**, not real systemd-managed hardware. The existing earlier supervisor parser is tested with synthetic injected data; the real Linux detached-process/PID tests remain separate.

## What next

Design a **separately approved, physical one-shot supervisor** that does all of the following without borrowing Qwen authority: observes an exact live detached descendant (with boot ID and starttime), captures resources and subtree identity, invokes an exact owned **systemd unit/cgroup stop** through a race-safe manager-scoped mechanism, polls bounded kernel `populated=0` for that original subtree, and retains a failure receipt if observations are unavailable or cleanup cannot be established.

A post-stop scope can be removed quickly by systemd; this validator intentionally will **not** treat a vanished scope as success. Field feasibility of that observation window is an open engineering question, not permission to weaken the test.

Only after the physical supervisor evidence is independently reviewed can Lab/Forge consider one exact shared configuration digest and separate owner authorization for the bounded four-case Qwen experiment. No NextGen resident QA, Yard remote worker, commissioned agents, payments, production provider or Base44 runtime was touched by this draft.
