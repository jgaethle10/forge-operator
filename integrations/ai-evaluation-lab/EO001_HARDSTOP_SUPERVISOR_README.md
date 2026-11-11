# EO-001 Gate 1: Linux hard-stop lifecycle proof (synthetic only)

**Status:** Independent offline subprocess evidence only. Draft PR #2035. Not a real Qwen case, not an accepted Lab contract, and not permission to run a model.

## What is now proven in GitHub CI

The supervisor runs **only one named, checked-in synthetic fixture worker**. No arbitrary `--command`, executable, model weight, prompt, payment endpoint, or remote provider input is accepted.

On Linux, including the intended Ubuntu WSL2 family, it spawns a new process group, starts the deadline before launching the worker, and bounds collected stdout and stderr. A deadline first sends `SIGTERM` to the group and then attempts `SIGKILL` after a short grace period. A late output is never promoted into a successful result. On worker close it writes a private `0600` owner-only JSON receipt with status, source digest, exit code/signal, timings, limited output **hashes only**, and explicit `model_inference_executed=false`, `physical_run_authorized=false`, `external_actions_authorized=false`. The result filename is immutable for each fixture mode, so a failed outcome cannot be overwritten by another attempt.

The dedicated [GitHub Actions offline workflow](https://github.com/jgaethle10/forge-operator/actions/workflows/eo001-gate1-hardstop-offline.yml) tests: successful fixture, crashing child, ordinary hang, `SIGTERM`-resistant hang, late-result suppression, partially emitted output, oversized output, hanging descendant process sharing the private process group, refusal of unsafe modes/paths/time limits, plus the previous prompt/manifest refusal, AbortSignal and guard/recorder timing regression suites.

This uses a **short test-only deadline** to validate the Linux kill path quickly. The public module's default is 15,000 ms, but that fact alone does not prove a production 15-second wall-time SLA on NextGen.

## Where the 15-second research boundary actually lies

The agreed proposed *warmed decision* limit is the elapsed time including request/context serialization, local gateway checks, Qwen inference, deterministic safety guard, and the actual decision receipt write. The companion `measureGuardedResearchDecision()` is a source-level implementation of that measurement boundary, but is not yet a protected full-run execution harness.

**The supervisor in this draft is not wired to that worker.** It counts child process startup through worker close, and its own *post-timeout supervisor failure receipt* may be written after the deadline. The latter is for preserving negative evidence, **not** a retroactively valid within-budget model decision. This distinction is required for honest timing reports.

## Security limits that must be addressed before a physical test

1. **No live worker entrypoint yet.** An approved child must be fixed to immutable source and weights, accept only synthetic, scenario-specific input, write its own private decision receipt, never communicate with a production provider, and never trust the model's proposed action as authority.
2. **Process group is not a complete sandbox.** A malicious or badly configured descendant could create a new session or escape the group; a model server launched separately will not automatically be killed by this script. Use a separately reviewed **per-decision systemd scope/cgroup or equivalent descendant containment** for the real host, with explicit ownership of any gateway/model child processes.
3. **Not real-time.** Node scheduling and the Linux host may delay timer callbacks or OS process termination. Record monotonic overshoot and the attempted signals, and stop on overrun. Preserve the entire incomplete scenario; don't silently rerun until a pass.
4. **Resource/access restrictions.** Freeze read-only source and model paths, private output directory and permissions, token lifetime, loopback-only networking, and CPU/memory/process limits. A model process that shares or escapes into existing production services is inadmissible.
5. **Freeze the scientific contract.** Lab #35/PR #51 still require exact Lab/Forge source pins, per-decision prompt/context hashes, model/runtime checks, generation settings, warm-up policy and duration, output naming, cleanup and separately authorized human review. The Gate 0 independent 30/30 documentary result remains `UNVERIFIED_EXTERNAL` for original hardware execution.

## Integration decision

The approved next step is an **offline** executable prototype of a fixed synthetic scenario worker under cgroup or equivalent containment, with source pinning and machine-readable evidence semantics jointly agreed with the Lab. Actual Qwen execution remains held until that admission is separately verified on NextGen and the owner authorizes the bounded scientific experiment.

No existing Evercraft resident Systemia service, Node002 remote worker, Base44 infrastructure, signed agent roster, provider account, or payment route is changed by this draft.
