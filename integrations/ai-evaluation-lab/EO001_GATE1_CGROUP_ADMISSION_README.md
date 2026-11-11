# EO-001 Gate 1: cgroup-v2 admission and fixed synthetic systemd scope

**State:** draft source, offline CI only; no physical NextGen scope test, no real Qwen execution. This work stacks on [hard-stop supervisor PR #2035](https://github.com/jgaethle10/forge-operator/pull/2035) and [protocol measurement PR #2033](https://github.com/jgaethle10/forge-operator/pull/2033).

## Why this differs from a process-group kill

The earlier synthetic supervisor creates a POSIX process group and exercises termination of children in that group. A child that starts a separate process session is not guaranteed to remain in the original process group. systemd transient scopes are an appropriate next **candidate** for cgroup ownership and resource limits on the existing NextGen Ubuntu user-systemd installation, but they require actual field validation, and user-level delegated controllers may be missing or insufficient.

Official guidance: [systemd-run](https://www.freedesktop.org/software/systemd/man/latest/systemd-run.html) and [systemd transient resource properties](https://github.com/systemd/systemd/blob/main/docs/TRANSIENT-SETTINGS.md).

## Two deliberately distinct operations

### 1. Default: read-only admission preflight

`eo001-cgroup-admission.mjs` requires an exact 40-character source SHA, clean tracked checkout, non-root Linux, a unified cgroup v2 mount with *visible* cpu/memory/pids controllers, access to the existing user-level systemd manager, and the fixed synthetic child source.

No scope is created. The most positive result it can return is `CANDIDATE_NEEDS_EXPLICIT_SYNTHETIC_FIELD_CANARY`, with all model and provider authorities **false**. Controller *visibility* is not proof the user's systemd manager can enforce every requested setting.

### 2. Separately owner-approved one-shot synthetic canary

The separate `--synthetic-canary --owner-approves-synthetic-scope` mode (not run on NextGen) requests one unique, short-lived user-systemd scope through `systemd-run --user --scope --collect`, with requested MemoryMax (256 MiB), TasksMax (12), CPUQuota (75%), KillMode=control-group and RunTimeMaxSec (4s). The **only executable** is the checked-in procfs-only Node.js synthetic child, which validates its own cgroup path component and returns a nonce-bound, strict JSON report.

The caller supplies **no arbitrary command, script path, model request or external host**. A hidden token is not needed or forwarded. Unsupported systemd properties cause a failure; they cannot be silently removed to make the experiment pass. After the scope command returns or fails, the driver attempts to stop the unique transient scope and checks the user systemd manager for `LoadState=not-found` plus `ActiveState=inactive`. A lingering active scope prevents a PASS; it attempts an exact-unit SIGKILL and records failure if final cleanup cannot be verified.

That canary would at most prove *one synthetic child reported membership in a user-systemd cgroup and the unit was collected*. It cannot prove actual controller enforcement (not read back), that escaped descendants were killed (not tested), the exact underlying Qwen/llama.cpp processes, gateway isolation, cold-boot persistence, or a full warmed decision under the Lab's 15-second cap.

## Next safe acceptance milestones

1. Joint Lab/Forge review of what exact model/context/prompt SHA-256 values mean and which source SHAs and generation settings are frozen for Gate 1. The Lab's Gate 0 30/30 result is documentary only and retains `UNVERIFIED_EXTERNAL`.
2. Run **read-only preflight** from a reviewed detached source pin on physical NextGen, if/when requested. Do not modify or replace the previously admitted `evercraft-eo001-owned-qa` timer or Node002's narrow outbound hash-only worker.
3. Explicitly approve a one-shot synthetic scope test **after** verifying the systemd property support and rollback on the real NextGen WSL installation. Inspect only a safe machine status, not raw private evidence.
4. Independently verify delegated memory/pids/cpu property application and a cgroup-contained test in which a child enters a separate process session, and prove kill/cgroup emptiness. Source code and CI fixtures do not establish this.
5. Only then design an immutable, non-production Qwen process runner with private prompt/guard/receipt data, resource limits and the Lab's versioned approval. Do not skip physical admission, change Qwen timeout until approved, or auto-retry failed case decisions.

## Verification performed so far

Dedicated GitHub CI executes the source and child syntax checks, **11 synthetic/mocked cgroup admission and refusal tests**, default-no-pin failure, and **nine prior real Linux subprocess hard-stop regression tests**. The systemd manager itself is **mocked** for the cgroup-admission tests. No GitHub Actions worker creates a user scope.

No external provider message, payment, Base44, live Systemia deployment, original commissioned role, signed hardware attestation or Qwen evaluation results are claimed.
