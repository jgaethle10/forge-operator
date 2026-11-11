# EO-001 Gate 1: self-contained synthetic cgroup resource readback

**Status:** Draft PR #2038, offline GitHub CI passed. **Not run on NextGen**, not a real Qwen worker and not an independently attested cgroup.

## Problem this addresses

A systemd request that contains `MemoryMax=268435456`, `TasksMax=12` and `CPUQuota=75%` is *not* evidence that those constraints were applied to the process. Under user-systemd, delegated cgroup controllers may not be available on a particular machine, including WSL2. A preflight that merely sees the controller names is insufficient.

## Current bounded design

The existing original-source-pinned admission tool in `eo001-cgroup-admission.mjs` stays **read-only by default**. A separate, explicit user-approved synthetic canary would run exactly one fixed first-party Node worker in a unique transient user-systemd scope, **not Qwen**.

The fixed synthetic child uses `/proc/self/cgroup` to require that its cgroup path ends in the exact generated scope unit, with no parent/substring/directory-traversal substitutions. It derives only the fixed cgroup-v2 filesystem leaf under `/sys/fs/cgroup` and reads:

| Kernel resource file | Required value | Meaning |
| --- | --- | --- |
| `memory.max` | `268435456` | 256 MiB ceiling requested for this **synthetic** canary |
| `pids.max` | `12` | Maximum number of tasks requested |
| `cpu.max` | ratio `3/4` | 75% CPU quota, independent of cgroup period |

`max`, absent/unreadable files, wrong control values, malformed CPU quotas, mismatched cgroup leafs and extra or missing child-report fields fail closed. The child returns **booleans only**, a generated unit ID and ephemeral nonce. No private path, token, model prompt, raw output, or source host details are copied into the report.

The parent verifies all flags and the nonce against the generated unit, then requires `systemctl --user` to confirm the transient scope has been collected, attempting bounded stop and exact-unit kill on failure. A cleanup failure blocks success even when the child reports the proper cgroup values.

## What is proven versus still missing

**Proven in offline CI:**
- Pure cgroup leaf parsing and exact expected numeric resource settings with synthetic file providers.
- Refusal on incorrect, unbounded, missing, or inaccessible resources.
- Strict synthetic child report and parent verification using mocked systemd commands.
- Default-no-source-pin refusal.
- Previous Linux process-group stop and negative evidence tests using **real synthetic subprocesses**, but not user-systemd scopes.

**Not yet proven:**
- That physical NextGen has the required delegated user cgroup controllers and accepts those properties.
- That a physical child can read the actual resource files and return a true report. This is the first field canary requiring separate, explicit approval.
- That the supervisor independently read back the resource values. The current evidence is **the child's own bounded report**, not independent attestation or a tamper-resistant signature.
- That a child which starts an entirely new POSIX session remains in the same systemd cgroup and dies when the transient scope is terminated. This requires a separate, controlled containment test.
- That any real Qwen/llama.cpp process, gateway, guard or private receipt can meet a warmed whole-decision 15-second wall-clock cap.
- That Lab PR #51's source commits, context/prompt hashes, warm-up and generation settings are frozen and approved.

The original next step remains a **read-only preflight** on a reviewed, pinned NextGen checkout. The fixed synthetic scope canary is a separate owner-approved operation. Neither changes the existing `evercraft-eo001-owned-qa` service, Yard/NodeSeed, original commissioned workers, production payments or Chandra's completed Gate 0 handoff.

Reference: [draft PR #2038](https://github.com/jgaethle10/forge-operator/pull/2038), [EO-001 #1705](https://github.com/jgaethle10/forge-operator/issues/1705).
