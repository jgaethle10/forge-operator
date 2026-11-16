# EO-001 Gate 1 | native exact-unit synthetic stop controller

**DRAFT, REVIEW ONLY. NOT A PHYSICAL TEST AUTHORIZATION.**

This document accompanies the source-only `eo001-native-scope-stop.mjs` on
[Forge PR #2149](https://github.com/jgaethle10/forge-operator/pull/2149).
The Lab's [contract v0.2 PR #51](https://github.com/kaulastudies/ai-evaluation-lab/pull/51)
remains **NOT FROZEN**.

## What was built and what was tested

The opt-in exported `attemptApprovedExactSyntheticScopeStop` function can
construct an exact `/usr/bin/systemctl --user stop
eo001-g1-synthetic-<32-hex>.scope` call with a finite timeout. It does
**not** expose a CLI, register a service, run a worker, execute a model, or
call this function automatically. All CI tests use **in-memory fake systemd
and kernel responses**; no real systemd stop occurs in CI.

The native path refuses actuation unless the caller separately supplies:

1. An exact source-pinned, **review-only** scope proposal derived from a live
   pre-stop supervisor snapshot, with fixed synthetic scope unit and
   zero-swap policy.
2. A strict, nonce-bearing, 5-minute-or-shorter, exact unit/source/boot/cgroup
   device+inode/time-limited **permit** signed by *two distinct Ed25519
   private keys*, owner and independent reviewer, against the
   `evercraft.eo001.synthetic-scope-stop-permit.v1\n` domain.
3. A clean Git checkout at the **permitted exact source commit** (checked
   immediately before execution), a running user systemd manager and fresh
   readback of the exact active unit/cgroup, host boot identity, pre-recorded
   worker/descendant kernel starttime, session, group and membership.
4. An owner-controlled external `reserve` + `record` sink that claims a
   durable **one-use** permit reservation and persists a pre-stop audit record
   **before** actuation. The controller revalidates the manager/unit/process
   **again after** this recording, immediately before the call.
5. A held-cgroup-FD read-only supervisor witness with separate
   `before`, `finish` and `close` operations. It must attempt
   post-stop evidence observation even if systemd stop fails or times out,
   and retain failure/unknown evidence. A missing, removed or recreated
   cgroup is **UNKNOWN**, never independently proven empty.

This is **still not a complete field implementation**. No actual owner or
reviewer keys have been independently provisioned, no trusted private audit
sink or one-use replay store has been implemented or independently tested,
and no approved host runner wires these dependencies together. Passing
ephemeral test signatures only proves signature checking against injected
public keys. A caller can inject keys they control: cryptographic
verification **does not establish human identity, approval provenance,
independent Lab approval, or real authorization**. A test IO can fake the
hardware. The source and source build themselves still need independent
review.

## Explicit unknowns and stop authority boundaries

- Exact systemd **unit names can be recycled between a unit recheck and a
  stop**. Fresh procfs metadata and a 200 ms recheck interval limit
  staleness but **do not remove the race**. Before physical testing,
  the reviewing owner/Lab must settle a manager-backed identity strategy
  and how to bind a stop to the original held cgroup when systemd removes
  transient units quickly.
- A successful `systemctl --user stop` exit code is only a **request
  acknowledgment**, not proof that an independently observed detached
  descendant was killed.
- The held-FD witness can lose access to post-stop kernel files after
  systemd removes the scope. A missing post-stop observation remains
  `UNKNOWN`. No broad numeric-PID/PGID, process-name killing or
  emergency retried `systemctl kill` exists in this controller.
- Resource values in the fixed **256 MiB / 12 tasks / 75% CPU / zero swap**
  synthetic scope are NOT Qwen model budgets. The next four-case model
  run still requires its own effective settings and new Lab joint freeze.
- Local receipt hashes are not independent host signatures, and a local
  file-owner can still tamper with their own files. Persistence and
  audit source authentication need independent review. Failed receipt
  persistence **holds** the result and prevents a success claim.
- A review-only source can never prove clean host shutdown,
  production readiness, Systemia resume permission, or external effects.
  The user-systemd scope stop must never be used to stop existing
  resident NextGen/Node002 services.

## Exact next decision, not standing permission

Before using this on HP NextGen, independently review the source and
systemd unit-replacement risk, provision and verify separate trust roots,
implement a durable owner-controlled one-use sink, freeze a **specific
synthetic scope** and bounded observation window, and obtain **explicit,
separate host-owner permission** for that exact run. The earlier one-shot
synthetic canary approval cannot be reused.

Only after an independently observed still-live separate-session descendant,
the reviewed stop, and verified post-stop *recursive* cgroup emptiness can
Lab assess the external evidence. The Lab v0.2 contract and all model
execution permissions remain on hold.
