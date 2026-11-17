# EO-001 Gate 1 | offline exact-unit stop simulation and host stop hold

**DRAFT, REVIEW ONLY. NOT A PHYSICAL TEST AUTHORIZATION.**

This document accompanies the source-only `eo001-native-scope-stop.mjs` on
[Forge PR #2149](https://github.com/jgaethle10/forge-operator/pull/2149).
The Lab's [contract v0.2 PR #51](https://github.com/kaulastudies/ai-evaluation-lab/pull/51)
remains **NOT FROZEN**.

## What was built and what was tested

The opt-in exported `attemptApprovedExactSyntheticScopeStop` function now
accepts **only explicitly labeled offline synthetic I/O**, and invokes the
injected fake `stopExact()` method with a fixed synthetic scope and bounded
budget. The earlier built-in `/usr/bin/systemctl --user stop` subprocess
route was **removed** because stop-by-name is not atomically bound to the
original cgroup identity. Without injected offline I/O the function returns
`NATIVE_STOP_MANAGER_ATOMIC_BINDING_UNAVAILABLE` before reserving a permit.
It does **not** expose a CLI, register a service, run a worker, execute a
model, or automatically call the function. No host systemd stop exists in
this source tree. Passing CI cannot authorize a physical stop.

The **offline simulated** path refuses its fake stop event unless the caller supplies:

1. An exact source-pinned, **review-only** scope proposal derived from a live
   pre-stop supervisor snapshot, with fixed synthetic scope unit and
   zero-swap policy.
2. A strict, nonce-bearing, 5-minute-or-shorter, exact unit/source/boot/cgroup
   device+inode/time-limited **permit** signed by *two distinct Ed25519
   private keys*, owner and independent reviewer, against the
   `evercraft.eo001.synthetic-scope-stop-permit.v1\n` domain.
3. A **simulated** clean source checkout at the permitted exact commit and
   injected readbacks of the manager unit/cgroup, boot identity, original
   worker/descendant starttime, session, group and membership. These are
   checked as supplied I/O, **not independently obtained host evidence**.
   Any future production checkout and manager access must be separately
   implemented and source-reviewed.
4. An owner-controlled external `reserve` + `record` sink that claims a
   durable **one-use** permit reservation and persists a pre-stop audit record
   **before** actuation. The controller revalidates the manager/unit/process
   **again after** this recording, immediately before the call.
5. A held-cgroup-FD read-only supervisor witness with separate
   `before`, `finish` and `close` operations. It must attempt
   post-stop evidence observation even if systemd stop fails or times out,
   and retain failure/unknown evidence. A missing, removed or recreated
   cgroup is **UNKNOWN**, never independently proven empty.

This is **not a field implementation**. An opt-in local
`eo001-one-use-stop-ledger.mjs` prototype now supports a dedicated 0700
owner-only directory, 0600 exclusive one-use permit reservation, fsync of
file and parent directory, and bounded ordered private receipts. Its CI tests
exercise duplicate permits across reopened instances and actual local files.
It is **not a deployed or independently approved trust service**; an owner
or root user can edit/delete/rollback its directory, and disk failures can
leave a burned permit requiring manual investigation. The controller does not
automatically instantiate this ledger. No actual owner or reviewer keys have
been independently provisioned, and no approved host runner or production
stop adapter wires the pieces together. Passing ephemeral test signatures only proves signature checking
against injected public keys. A caller can inject keys they control: cryptographic
verification **does not establish human identity, approval provenance,
independent Lab approval, or real authorization**. A test IO can fake the
hardware. The source and source build themselves still need independent
review.

## Explicit unknowns and stop authority boundaries

- Exact systemd **unit names can be recycled between a unit recheck and a
  stop**. Fresh procfs metadata and a 200 ms recheck interval reduce
  staleness but **do not remove the race**. The previously coded by-name
  host stop adapter was removed at this review checkpoint. Before any
  new physical runner, the owner and Lab must approve a verifiable binding
  from the original held scope to the actual stop target, or explicitly
  assess a narrower alternative under independent observation.
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

Do **not** use this source as a physical stop runner on HP NextGen. First
independently review and implement a manager-safe scope stop strategy,
provision and verify separate trust roots, independently review the
owner-controlled one-use sink, freeze a **specific synthetic scope** and
bounded observation window, and obtain **explicit, separate host-owner
permission** for that exact proposed run. The earlier one-shot
synthetic canary approval cannot be reused.

Only after an independently observed still-live separate-session descendant,
the reviewed stop, and verified post-stop *recursive* cgroup emptiness can
Lab assess the external evidence. The Lab v0.2 contract and all model
execution permissions remain on hold.
