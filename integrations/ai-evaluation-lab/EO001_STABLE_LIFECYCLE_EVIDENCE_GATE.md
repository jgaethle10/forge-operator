# EO-001 Gate 1 | Stable identity and post-stop subtree evidence gate

**Research-only, NOT FROZEN, not a physical field execution authorization.**
This document accompanies the source-only verifier added in draft PR #2055.
The prior integrated test branch PR #2054 remains a separate historical pin.

## What is already established
- An operator-supplied NextGen read-only capability check on 03de0fc.
- An operator-approved **one-shot** NextGen transient synthetic canary on
  1e89a0c: the child reported its cgroup's CPU/memory/task settings, and the
  caller's exact-unit cleanup status check returned collected.
- A Linux CI negative control showed that a separately detached process
  session can remain alive after a *parent process-group* kill.
- Source-only cgroup observation logic and deterministic CI fixtures.

None of those receipts independently proves that user-systemd killed a
**still-live, independently witnessed detached descendant**, nor that the
full cgroup subtree was empty afterward.

## The new offline code
`eo001-stable-scope-lifecycle.mjs` accepts *injected* evidence. It refuses
unbound scope identities, unsupported/missing swap control, stale or missing
observations, changed boot/cgroup inode, surviving/unknown PIDs and unbounded
stop metadata. Its positive verdict is explicitly
`OFFLINE_LIFECYCLE_METADATA_CONSISTENT_REVIEW_REQUIRED`, with:
- `observer_provenance_authenticated=false`
- `field_observer_executed_by_this_module=false`
- `actual_process_death_independently_proven=false`
- `race_free_process_signaling_implemented=false`
- `execution_authorized=false`

A fixture that **claims** to be a supervisor is not an authenticated
supervisor. `source_revision` and `raw_capture_sha256` fields are required
placeholders for a separate verifier that must actually recompute the hash
over independently supplied raw bytes. No private host logs are published.

## Field gates to implement / independently review next
1. Use one exact, fresh generated synthetic user scope ID and pin **one**
   completely integrated supervisor/adapter source revision. The future
   runner must be a supervisor outside the tested worker's cgroup. Confirm
   that from actual kernel cgroup membership, not a child JSON response.
2. Pin the **open scope directory file descriptor** across observations
   wherever supported, and bind unit name, systemd identity, cgroup path,
   kernel device/inode, boot identity and monotonic capture times. A matching
   path string or inode number **alone** cannot rule out filesystem inode
   recycling. If the original directory disappears before independently
   reading post-stop events, report `UNKNOWN` and retain the negative
   receipt. Do not infer subtree emptiness from absent files.
3. Observe a still-live new-session descendant **before** stop, including
   `/proc/PID/stat` field 22 starttime as decimal string, boot ID, PID,
   parent, process group, session ID and exact `/proc/PID/cgroup` readback.
   An external observer must retain raw bytes and capture hashes.
4. Before any individual-process signal, retain a race-safe process handle
   (such as pidfd) that binds the process identity across the signal, or
   refuse. `stat` rechecking alone leaves a check-to-signal race. Do
   **not** use `kill(-pid)` or any broad process-name cleanup as the claimed
   proof. Prefer a separately approved exact-unit `systemctl --user stop`
   with independently reviewed unit-replacement defenses. A systemd unit
   name by itself is not a stable identity handle.
5. Record `memory.max`, `memory.swap.max` when supported, `pids.max`,
   `cpu.max` with both **requested and effective values**. Swap is
   explicitly disabled (`memory.swap.max=0`) for the proposed next fixed
   *synthetic* test. If unsupported, report a blocking capability finding
   until the two parties explicitly revise the contract. The earlier
   256 MiB synthetic limit is **not a Qwen resource budget**.
6. Stop only the owned exact unit inside a distinct finite cleanup budget;
   independently observe the original descendant identity gone and the
   **same still-readable root cgroup** reporting
   `cgroup.events populated=0`, recursively covering descendant cgroups.
   Enumerate any still-existing children and verify their files/procs.
   Missing, altered, replaced, too-late or incomplete observations remain
   negative/unknown, not success.
7. Retain **all** receipts, including errors, timeouts, refused cleanup,
   provenance mismatches and unobserved/unsupported controls. Keep the
   Systemia worker lane held whenever cleanup is uncertain.

## Separate Gate 1 model contract
Lab PR #51 proposal v0.2 is NOT FROZEN. None of this admits Qwen scenarios.
Before a model decision, jointly freeze exact source/runner hashes,
model/runtime binary hashes, prompt renderer/context byte semantics,
effective generation settings, warmup + cold startup + cleanup budgets,
a 15-second complete warmed decision deadline and at most six decisions per
case. Both parties independently review the identical configuration
digest, followed by a **separate explicit host-owner admission**.
No synthetic provider effects, production permissions, OS services, agent
permissions or external side effects can be promoted by CI.

## Product reuse boundary
Black Box PR #1291 already defines canonical incident IDs and separates
UNKNOWN external outcomes from independently verified effects. A later
read-only EO-001 evidence adapter may feed those existing incident IDs and
Spider Society's *possible* persistence topology. This PR does not create a
new incident store or claim live Black Box/Spider integration.

References:
- Lab PR #51, Experimental Contract v0.2.
- Linux kernel cgroup v2 documentation: `cgroup.events populated` is
  recursive over the subtree.
- Linux proc_pid_stat(5): starttime is field 22, in clock ticks since boot.
