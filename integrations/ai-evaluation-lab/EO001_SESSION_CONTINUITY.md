# EO-001 Gate 1: new POSIX session cgroup continuity check

**Research state:** source reviewed in draft [PR #2041](https://github.com/jgaethle10/forge-operator/pull/2041); offline CI tests only. The fixed synthetic systemd scope has **NOT** run on physical NextGen. No Qwen evaluation, independent hardware attestation, production release, or executed Lab Gate 1 protocol.

## Motivation

The previous POSIX process-group hard-stop supervisor exercises `SIGTERM` then `SIGKILL` against a process group. A child that creates a new session with `setsid` can leave that group. This is an important difference between *process-group identity* and *cgroup membership*. A systemd transient scope could provide an ownership boundary that survives a session change, but this needs actual field evidence and a later **separate forced-cleanup test**.

## Implemented evidence checks

The first-party `eo001-cgroup-session-proof.mjs` invokes **only** a fixed, embedded Node.js synthetic child:

- With `detached:true` on Linux, which creates a separate process session/group.
- With a bounded 2,200ms spawn and `SIGKILL` fallback on timeout.
- With no inherited `NODE_OPTIONS`, arbitrary arguments, command, model, network, user input, or installed service.
- The fixed child reads `/proc/self/stat` and `/proc/self/cgroup`, and reports process ID, process group, session ID, and its cgroup string.
- The parent verifies that `pid = pgid = sid`, that session differs from the original parent, and that the cgroup string exactly matches the parent's.
- The child must exit with status 0 and be reaped. No open-ended process or pass-only retry exists in this helper.

The already fixed scope/resource canary now requires this check **after** verifying exact memory, PID/task, and CPU quota values. This first upgraded the synthetic child report from v2 to v3. A subsequent independent parent-witness addition upgrades the admitted report to **`evercraft.eo001.gate1.synthetic-scope-child.v4`**. Parent validation refuses v2/v3 receipts and requires the new procfs witness flags in addition to the original session/reaping evidence.

## Added parent-side procfs witness (v4)

The earlier child was self-reporting its own cgroup. We now also execute a second bounded, fixed synthetic helper `eo001-cgroup-parent-witness.mjs`, which:

- Launches a short-lived **separate POSIX session** and reads the child’s `/proc/<pid>/stat` and `/proc/<pid>/cgroup` **from the parent while the child is still alive**, rather than relying on the child’s own cgroup JSON.
- Verifies exact observed PID, process group and session fields, the new session versus parent, and unchanged parent/child cgroup.
- Attempts bounded process-group SIGTERM, escalates to SIGKILL if necessary, and requires successful child reaping before producing its evidence flag.
- Returns booleans only. The parent-side witness does not publish the procfs path or claim that systemd killed the child.
- Is required in the synthetic scope canary alongside exact controller readback. The schema changes to `synthetic-scope-child.v4`, so a v3 report cannot be accepted as stronger evidence.

This strengthens **code-level observation and cleanup of our own fixed synthetic child**, but **is not independent Lab hardware attestation** and **does not establish forced systemd termination of a still-running escaped-session process**. That requires a separate physical test with an independently checked empty cgroup.

## Independent results and limitations

**GitHub CI uses a real Linux child** to verify the separate-session and same-cgroup observation, in addition to mocked negative cases for forged session/group IDs, changed cgroup strings, malformed output, blocked child and non-v2 hosts.

This does **not** prove:

1. A privileged/malicious process cannot intentionally move itself to another cgroup.
2. A systemd scope will forcibly terminate a still-live escaped-session descendant after a timeout. The test child is well behaved and exits before scope cleanup.
3. User systemd on NextGen has delegated memory, pids and CPU controls or accepts the proposed scope flags.
4. Any actual Qwen process, gateway/guard/recorder, or entire 15-second warmed decision is isolated.
5. The independent AI Evaluation Lab has approved the final source/prompt/context/generation contract.

No physical resident service or remote worker is modified. The Lab's 30/30 independent Gate 0 documentary review remains distinct from source/model/hardware attestation.

**Remaining field gates:** reviewed source-pin read-only preflight on NextGen; separately owner-approved one-shot synthetic systemd scope with resource/cleanup readback; isolated forced-cleanup proof for a surviving new-session descendant; jointly frozen Lab Gate 1 contract and authorization before any real model run.

## Commands for offline verification only

```sh
node --test integrations/ai-evaluation-lab/eo001-cgroup-session-proof.test.mjs
node --test integrations/ai-evaluation-lab/eo001-cgroup-resource-proof.test.mjs
node --test integrations/ai-evaluation-lab/eo001-cgroup-admission.test.mjs
```

The above are synthetic tests. Do not run the `--synthetic-canary` path or physical Qwen until the already documented source pin, user-systemd permissions and explicit acceptance steps are satisfied.

## Latest CI

- [Offline CI #42981125031](https://github.com/jgaethle10/forge-operator/actions/runs/42981125031) passed real Linux detached-session tests, parent-observed live procfs tests, resource/controller refusal tests and synthetic scope admission tests.
- Tested implementation commit: `94604fcbfdfe0b576f16d2caca1b74aafc3e7be8`.
- No physical NextGen source, services, private handoff data, Qwen, or external action was changed by these GitHub tests.
