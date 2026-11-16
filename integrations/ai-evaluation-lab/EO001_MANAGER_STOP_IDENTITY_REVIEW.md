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
