# Penguin physical shadow broker: release gate and rollback contract

**Status:** PREPARED / NOT AUTHORIZED / NOT EXECUTED  
**Date:** 2026-11-19 (America/Los_Angeles)  
**Scope:** Existing Evercraft-owned Penguin NodeSeed only. Never changes historical broker, Edge DNS, Saban dispatcher, public ingress, or NextGen authorization.

## User-observed evidence

1. **43/43 checks passed** across the previous isolated, ingress-inventory, provenance, and read-only physical-window runs (the count summarizes distinct successful reported tests, not a single continuous execution).
2. Actual on-disk Penguin historical source hashes: Compute `1d85a3bf25f9db02fee8f817e2fe337e32306447`; outbound broker `6a44cc2a6aca90693ba034100a9da6b75f29eee4`; Yard `f36a121e8c872ca7d1f72990a2320266adda640b`. They match known GitHub blob contents and predate process startup, but **the exact JS bytes loaded into memory remain unproven**.
3. Live NodeSeed API at loopback port `42420`; one existing resident, authenticated by its runtime health as authoritative, non-recursive Evercraft Edge DNS, using DNS TCP/UDP `1053` and HTTP health `44677`. There are no unexplained PID-owned TCP listening ports in the observed inventory.
4. Protected units: `evercraft-nodeseed.service` active/enabled; `evercraft-remote-broker-resident.service` inactive/disabled; `evercraft-saban-dispatch.timer` active/enabled.
5. Installed-historical-source disposable NodeSeed test **3/3 PASS**: temporary Edge DNS remained healthy and answered an authoritative UDP query before and after a temporary broker started and released; lost broker job response cleanup passed.
6. Latest combined live read-only physical window: `baseline_pass:true`, `hold_reasons:[]`, **`broker_activation_authorized:false`**. The baseline read no authority/credentials and changed no services.

## Critical distinction

**The green baseline is NOT physical launch authorization.** The existing
`systemia/yard/shadow-broker-one-shot.mjs --run` remains deliberately HARD DISABLED.
`runRehearsalShadowBrokerTransaction` refuses `/var/lib/evercraft` physical
roots and MUST NOT be weakened to bypass this safety boundary.

## Implementation preconditions for a future opt-in canary

All of the following must be proven from a new, immutable, reviewed GitHub commit
and an operator-specific, one-time approval. They are **requirements, not completed work**.

- Re-run live identity, exact Edge DNS ownership, prior shadow state, and source
  provenance immediately **before** creating any lease. Stop on changed baseline.
- Execute only as the dedicated `evercraft` service principal with private
  `0700` journal directory nested under the NodeSeed's admitted root.
- Obtain allocator authorization from a private file or other protected source,
  never command-line arguments, printed environment, logs or PR comments.
- Restrict transport to the verified local NodeSeed at `127.0.0.1:42420`.
  Strictly do not create a route or map ports to the network.
- Create only a **fresh**, zero-device-authority broker: `authorized_devices:{}`,
  no imported grants and no old broker service state, random private state path,
  random loopback broker port. Do not attach `YardOperator.deployRelease`
  until its late-failure cleanup semantics are independently proven.
- Create a lease with no more than 60 seconds of TTL. Save the lease ID, expiry
  and private token in a durable fsynced journal **before any POST /v1/jobs**.
  Persist submission intent before the POST. **Never automatically retry a
  submitted job when the outcome is uncertain.**
- Require new broker health with `authorized_devices=0`,
  `registered_nodes=0`, `pending_enrollment_requests=0`,
  `deployment_receipt_bound=false`, a matching broker instance and no
  externally routed endpoint. No remote devices, Saban tasks or public HTTP route.
- Verify the original Edge DNS resident remains healthy **and responds to an
  authoritative nonrecursive UDP TXT query** before, during and after the canary.
  Its DNS instance ID must not change.
- Immediately release the canary's **own** lease using its recorded private
  token. Verify the resulting receipt matches NodeSeed, lease ID, workload,
  receipt type and checksum; then independently recheck NodeSeed resident
  count **1 → 2 → 1**, original DNS still responding, no broker listener,
  and protected systemd states unchanged.
- Treat any missing/ambiguous release receipt, unexpected listener, DNS failure,
  auth-state drift, or source drift as **HOLD**. Preserve the journal and
  evidence, explicitly prohibit job replay, and require manual reconciliation.
  Do not report teardown successful on timeout or an unauthenticated 200.
- Preserve a strict one-shot window. No timer, restart policy, unattended launch,
  persistent authorization or public routing is included.

## Recovery risk register

| Risk | Present mitigation | Residual work |
| --- | --- | --- |
| Lost job response | Pre-submission durable lease journal; authenticated release by lease | Couple to reviewed physical runner; verify live NodeSeed's response semantics |
| Submitting process killed | SIGKILL synthetic test passed | Verify recovery and operator reconciliation policy for physical session |
| Lost release acknowledgment | Manual hold, no automatic replay, 60-second lease expiry | Need independent post-expiry resident inventory; do not claim successful cleanup on expiry alone |
| Existing DNS disruption | Installed old Compute coexistence test passed | Live before/during/after UDP query and resident-count proof |
| Old grants imported | Zero-authority body and fresh state root | Explicit filesystem isolation and config review |
| Loaded source vs disk | Launch path, hashes, file age observed | Cannot fully attest in-memory bytes from disk inspection; mitigate via measured live behavior |
| Power loss | Files and journal use private atomic/fsync writes | Validate storage and replay semantics; never blindly relaunch |
| Installed service changed | Protected baseline gate | Re-run gate immediately before and after the one-shot |

## Authorization and acceptance

**Not authorized in this PR.** The operator must approve the exact reviewed
physical runner revision and a single, immediate, loopback-only, 60-second
zero-device broker canary after seeing the new plan and rollback behavior.

A successful physical canary means only: `Edge DNS preserved`,
`new zero-authority broker started and authenticated locally`,
`new broker released`, `original resident count restored`,
`no grants, routes or timers modified`. It **does not** mean NextGen is
enrolled or that the Saban distributed fleet is commercially ready.

A separate, later authorization is required for cross-machine enrollment,
device policy, Saban dispatch routing or persistent broker service.

## 2026-11-19 next engineering checkpoint: executable three-phase rehearsal

The isolated broker transaction now exposes a disposable-only
`onBrokerVerified` observation callback while the temporary broker is
running. Its `finally` path releases the already-journaled broker lease
even if that observation fails. The installed historical NodeSeed test now
requires all of the following **during** the temporary broker, in addition
to the previously verified before/after observations:

- Resident service count increases from 1 (synthetic Edge DNS) to 2
  (synthetic Edge DNS + temporary broker), then returns to 1.
- Edge DNS health returns the same instance ID throughout.
- A real loopback UDP TXT query remains authoritative and nonrecursive
  with one synthetic answer before, during and after broker operation.
- No grants, devices, public routes or production NodeSeed roots are used.

A second fault-injection test throws from inside the observation callback
and asserts that the synthetic broker is still released and zero temporary
services remain. The rehearsal transaction now also rejects the known live
Penguin NodeSeed port `42420`, non-temporary state roots, and nonfixture
NodeSeed identities before requesting capacity or a lease.

**These latest tests are staged but not yet user-run.** They strengthen
the synthetic rollback proof; they do **not** change the physical
`--run` hard-disable or create production authorization.

## 2026-11-23: verified release evidence and next source-backed phase probe

The founder ran the pinned permanent-home-directory source archive at
`56d98add3ea44e167f238e8dd041761c1ee06560`; all **22/22 release,
journal, crash recovery, broker isolation and installed historical Compute
coexistence tests PASS**. This adds seven previously unverified tests;
**63/63 cumulative distinct tests** are now user-verified across separate
runs. The protected systemd states were unchanged.

The new read-only `penguin-physical-shadow-phase-observer.mjs` is designed
to collect real NodeSeed identity, PID-owned TCP ports, source/UDP provenance,
authoritative Edge DNS TXT response, stable DNS health, and the known
historical systemd states, with optional health for exactly one zero-authority
temporary broker. The CLI accepts only `--before` and prints sanitized
read-only status; no physical broker is created or authorized. Its additional
five tests and the live `--before` observation remain **NOT YET RUN**.

**Still missing:** a separate trusted proof that no new public route was
created and no historical grant was imported. The observer deliberately
sets both fields to null rather than falsely reporting `false`.
Its observations can therefore never themselves satisfy the existing
full physical acceptance validator. The exact JS bytes loaded in memory
also remain unproven. Do not weaken either boundary for a green result.


## 2026-11-23: 73 verified checks; new OS loopback witness staged

The founder ran pinned commit `16a4e03d0b125485cf5fedcb67fe9fd7c235fd6b`:
**7/7 PASS** across four fresh broker private-state tests and three
installed historical Compute/DNS coexistence regressions. The fresh
broker directory remained empty during and after synthetic broker activity,
with no legacy authority files read. Protected Penguin systemd unit
states remained unchanged. This establishes **73/73 cumulative distinct
verified checks** across separate sessions.

A new read-only socket witness is staged at
`systemia/yard/penguin-shadow-broker-socket-witness.mjs`. For an
observed zero-authority broker, it requires precisely one OS TCP listening
socket on **127.0.0.1** at the broker port, owned by the
`evercraft-nodeseed.service` MainPID. It rejects wildcard, LAN, IPv6,
unowned, duplicated, mismatched, or missing sockets. A new pure test suite
covers the witness; the physical phase observer and final structural
acceptance validator now require this evidence.

The installed-historical-Compute rehearsal also compares PID-owned
listeners before, during and after broker operation to prove the extra
socket is a single loopback-only broker listener and disappears after
lease release.

**All new tests and changed regressions above are staged but not yet
founder-run.** Green results must not be added to the verified count.

**Critical limit:** A loopback-only bind does not prove that Caddy,
an outbound tunnel, another local proxy, a router, or a provider route
cannot expose that broker externally. The code explicitly reports
`public_route_absence_proven:false` and retains `public_route_created:null`
in the observed phase snapshot. Likewise it does not inspect historical
device grants, which remain unproven absent globally.

A future physical canary still requires a separate, independently
trusted route/grant evidence source, reviewed rollback and one-time
operator authorization. The physical `--run` mode stays HARD DISABLED.
