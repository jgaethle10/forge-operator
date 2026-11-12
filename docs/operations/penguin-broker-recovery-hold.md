# Penguin resident broker restart recovery hold

**State: HOLD. This document does not authorize a restart, replacement, or
cutover.** The running broker process (last observed as PID 407) must not be
stopped simply to clear the missing-file incident.

## Evidence baseline (November 10–11, 2026)

- `evercraft-remote-broker-resident.service` is configured for
  `/opt/evercraft/forge-operator/systemia/yard/remote-broker-resident.mjs --run`.
- That source entrypoint was absent from both the installed runtime and the
  user checkout at last physical inspection. An active Node.js process does not
  prove the installed service can restart.
- NodeSeed on Penguin and Node002 capacity discovery previously responded.
- The ten-job physical acceptance receipt predates the Node002 reboot and
  must not be presented as fresh post-reboot acceptance.
- Signal intake provisioner passed with `key_state:preserved`, and the Fabric
  updater subsequently completed successfully with exit code zero.
- No source restoration or broker cutover has been verified.

## Read-only inspection

Use the existing specialized inspector on Penguin **only if it exists**:
`sudo node <checkout>/scripts/inspect-penguin-broker-restart-safety.mjs`.
It intentionally exits with code 3 for a diagnostic hold. It never
authorizes a restart.

The supplemental fleet scanner is
`python3 <checkout>/scripts/check-evercraft-service-integrity.py`;
an existing source path only means `entrypoint_exists_only`, not safe restart.
Do not treat `not_assessed` as healthy.

Do **not** print the broker's process environment, private Yard deployment
secrets, device authorizations, allocator tokens, or control grant JSON.

## Required before any proposed cutover

1. Recover original source with traceable provenance **or** build a new,
   independently tested, reviewed resident supervisor. A dummy entrypoint or
   a source copy with an unverified hash does not qualify.
2. Independently reproduce fail-closed broker behavior using an isolated
   temporary state root and loopback-only resources, with **no** physical
   device credentials or live broker ports.
3. Verify systemd service account, working directory, source artifact,
   runtime dependencies, and rollback artifact together.
4. Reconcile existing jobs, leases, and receipts. Preserve evidence and
   avoid silent replays or duplicate execution.
5. Explicitly plan for a **new broker instance identity** following cold
   start. Existing tests prove that the old Yard deployment receipt cannot
   simply be rebound to a new instance.
6. Require operator-approved separate cutover, new Yard deployment receipt,
   route re-verification, and device attestation/trust review. Keep the old
   process in place until the replacement has passed independent tests.
7. Conduct fresh physical bounded Node002 content-hash acceptance only after
   authorization and cutover. The existing acceptance script is opt-in and
   must never run automatically from CI or a resident timer.

## Existing source contracts

- `scripts/inspect-penguin-broker-restart-safety.mjs`
- `systemia/yard/broker-recovery-admission.mjs`
- `tests/penguin-broker-restart-safety.test.mjs`
- `tests/broker-cold-restart-identity.test.mjs`
- `scripts/evercraft-physical-ten-job-acceptance.mjs`

**No installation, activation, service lifecycle, credential rotation,
authority mutation, or physical job execution is performed by this guide.**
