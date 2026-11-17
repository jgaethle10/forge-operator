# EO-001 Gate 1 | systemd stop target identity, review blocker

**Source-review only | no NextGen or Lab field run approved**

This note addresses the remaining exact-unit **check-to-stop replacement
race** in [draft Forge PR #2149](https://github.com/jgaethle10/forge-operator/pull/2149).
Chandra's [Lab v0.2 PR #51](https://github.com/kaulastudies/ai-evaluation-lab/pull/51)
remains **NOT FROZEN**.

## Protocol semantics actually checked

The systemd D-Bus Manager interface exposes `GetUnit(name)`,
`GetUnitByControlGroup(cgroup)`, and on newer versions
`GetUnitByPIDFD(fd)`. Its documented `StopUnit(name, mode)` operation
addresses the **named unit**; a unit object path or a held cgroup directory
FD is not accepted as the stop target by that documented signature.

Primary references:
- https://www.freedesktop.org/software/systemd/man/262/org.freedesktop.systemd1.html
- https://github.com/systemd/systemd/blob/main/src/systemctl/systemctl-start-unit.c

**Do not infer** that a successful unit-name lookup, D-Bus job completion,
PIDFD or cgroup FD implicitly makes the *following* stop call atomic with
respect to the original scope incarnation.

## Source behavior today

`eo001-native-scope-stop.mjs` currently:

1. Requires a pinned, exactly named 32-hex synthetic user scope plus
   two separate valid Ed25519 keys on one fresh permit.
2. Checks the observer's original boot ID, worker and detached-child
   kernel starttimes and cgroup membership and the original cgroup
   device+inode. The observer is outside the target.
3. Before and **after** a burned, privately persisted one-use permit,
   re-queries `systemctl --user show` and kernel/procfs identity. It
   rejects discovered replacements or stale manager observations.
4. **The by-name `/usr/bin/systemctl --user stop` host route is now disabled**.
   Only an explicitly labeled offline synthetic I/O adapter can simulate
   a fixed stop request. Without one, the controller blocks before permit
   reservation with `NATIVE_STOP_MANAGER_ATOMIC_BINDING_UNAVAILABLE`.
5. The synthetic sequence tests post-stop observer readback even if a fake
   stop fails or times out; unresolved evidence stays **UNKNOWN**, never
   independently attested hardware cleanup.

**Still unproven:** another principal able to change user manager units
could replace the named scope *between* the final recheck and the stop.
No atomic compare-and-stop operation based on the held original cgroup
identity is implemented, and **no live stop is currently reachable in the
provided source**. A future `systemctl` exit status would not prove
which cgroup instance was affected or that the old detached child died.
A local replay ledger or source digest does not fix this race.

## Candidate alternative: held-original-scope `cgroup.kill` (NOT approved)

A new source-only, **pure** assessment module,
`eo001-held-cgroup-kill-alternative.mjs`, evaluates supplied metadata for
the Linux cgroup v2 `cgroup.kill` interface. Per the kernel specification,
writing `1` would **SIGKILL all processes in the cgroup and descendants**,
with fork/migration semantics handled by the kernel. This is materially
different from a graceful systemd StopUnit, may fail for threaded cgroups,
and requires actual permission and ownership validation on NextGen.
See: https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html#cgroup-kill

The module **never opens or writes a kernel file**, never stops a scope, and
treats every supplied held-FD, cgroup-type and permission observation as
**unauthenticated metadata**. Its proposed target rule is explicitly
*relative to a held original cgroup directory FD*, never a freshly resolved
name or absolute filesystem path. This is a research hypothesis about
target binding, **not evidence** that Linux delegated the necessary write
permission or that an approved user-manager unit would be cleaned up.

The existing owner/reviewer stop permit is **not valid for this changed
method**. A separate Lab/owner-reviewed protocol amendment, live read-only
capability check, kernel-version and cgroup-delegation assessment, explicit
scoped authority, and independent post-stop observation are necessary.
The native host stop route remains disabled.

## Read-only capability survey now available (NOT run on NextGen)

The opt-in `eo001-cgroup-kill-readonly-capability.mjs` function checks
an **already-existing** exact synthetic scope using a root-to-leaf chain
of `O_DIRECTORY|O_NOFOLLOW` directory opens, retaining the final cgroup
directory FD. It checks that the mount and held leaf report cgroup v2,
reads bounded `cgroup.type` and `cgroup.events`, verifies the observer
is outside the scope, and uses `lstat` to inspect `cgroup.kill`
**without opening the write-only control file**. All returned metadata
remains local and explicitly *unattested*, with permission, manager unit
incarnation, live detached worker, and resource-limit gates **false**.

The adapter has **no CLI, no shell, no systemd command, no file writes and
no stop/kill operation**. The new CI tests use temporary fake control
files and an injected fake cgroup2 statfs response, NOT an actual HP
NextGen cgroup. A control file showing owner-write bits does **not**
establish an effective write permission or safe authorization, and
mere availability does not guarantee kernel support for the operation.

Any future invocation on NextGen is a distinct **read-only inspection**
subject to owner scope and privacy review. It cannot replace an
independent, digest-bound host observation or approve a physical test.

## Mandatory pre-field decisions

| Requirement | Current state | Physical-test gate |
|---|---|---|
| Exact-unit/source/boot/process checks | Offline CI source tested | Reverify with an independent read-only host observer |
| Manager stop identity binding | **Not established** | Review manager semantics, unit instance identity and a safe alternative or accepted residual risk for one self-owned synthetic scope |
| Distinct real human approval | Not provisioned | Independently provision owner and reviewer credentials, then approve exact source+unit+window |
| Burn-once local receipt store | Local prototype with offline tests | Inspect private owner directory and provenance/rollback limits; require separate audit review |
| Whole subtree post-stop | Synthetic parser/collector tested | Independently observe original cgroup handle, all descendants, and stable process identities |
| Lab v0.2 experiment contract | Draft / NOT FROZEN | Joint digest-bound protocol review and explicit two-party freeze before any model run |

A uniquely random synthetic unit name is a useful collision reduction
measure, **not** proof of an atomic stop. Any proposed new manager API
binding must be verified against the actual installed systemd version
and tested under adverse unit-replacement conditions; a method's
availability cannot be assumed from newer upstream documentation.

## Evidence review for the first field candidate

Present a separate physical-run review package containing the specific
pinned source digest, exact synthetic unit, host-owner consent, independent
reviewer's signed approval, effective systemd/cgroup limits and memory/swap,
live detached PID identity with boot/start ticks, independent observer
process location, bounded pre/stop/post timing, and a pre-agreed private
negative evidence destination. **No tokens, private procfs or signing
secrets should go into public GitHub review comments.**

Until the manager identity/replacement risk is addressed or jointly
explicitly accepted within a strictly self-owned synthetic scope, this
research tree **must not be used as a live stop runner**.

No physical test, external model, live Spider/Black Box action,
production permission change, or resident NextGen service modification
is authorized by this document.
