# EO-001: Process-group escape negative control

**Status:** draft, offline Linux synthetic experiment only. No NextGen execution, user-systemd transient scope, Qwen inference, Lab Gate 1 approval or commissioned agent authority.

## Why this control exists

Our earlier supervised synthetic worker could terminate its own POSIX process group with SIGTERM/SIGKILL. That does **not** establish that a child which starts a new session is stopped. A detached child belongs to another process group and may outlive its original parent. A close receipt on the parent therefore cannot be promoted to proof that all descendants were terminated.

## Fixed bounded negative control

The source file eo001-process-group-escape-negative.mjs starts one first-party synthetic driver with a private process group. The driver starts one **detached** synthetic survivor, which has a fixed four-second lifetime and no model, tool, shell, network or user-selected command.

The parent independently verifies the survivor's procfs stat **before sending any signal**, requiring that the reported survivor PID belongs to a direct child of the driver, has its own session/group, and stays in the same observed cgroup. A zombie or exited process cannot count as surviving.

The observer then sends SIGTERM to the original driver's group, waits for its termination and independently verifies via procfs that the detached child remains alive in a different process group but in the same cgroup.

In the finally block it attempts identity-checked cleanup of the survivor's group and the original driver group. The bounded survivor self-exits after a short fixed lifetime. Because the parent is not the survivor's reaping parent after driver termination, no survivor-reaping claim is made.

A successful result deliberately has these flags **false**:
- group_kill_sufficient_for_descendant_cleanup
- systemd_scope_forced_kill_proven
- model_execution_authorized

Negative tests reject forged PID, wrong parent, mismatched cgroup, missing procfs, zombie status and wrong session/group before a reported survivor PID may be used as a cleanup target.

## Evidence boundary

This negative control establishes why process-group-only kill must not be conflated with cgroup containment. It does not test actual user-systemd transient scopes, cgroup.kill, delegated resource enforcement or full forced cleanup of a still-running detached descendant.

Field acceptance still requires a read-only exact-source-pin NextGen preflight, separately owner-approved synthetic scope with real resource readback, a reviewed scope-kill plus empty-cgroup witness, and a joint Lab/Forge freeze of Gate 1 source/prompt/context/generation/15-second complete warmed-decision evidence rules.

Do not alter existing NextGen resident Systemia QA or run Qwen based on this PR.
