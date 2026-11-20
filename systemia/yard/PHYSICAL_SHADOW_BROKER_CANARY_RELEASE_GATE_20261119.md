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
