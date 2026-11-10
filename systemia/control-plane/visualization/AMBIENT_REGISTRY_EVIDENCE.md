# Systemia Ambient Registry Bound Signed Evidence v0.1

This development layer attaches the **existing** Saban Ambient Device Registry to the private MicroSeed signed-receipt journal and Passport-gated Systemia Living Graph. No network endpoint, new device authority, scheduling, production deployment, third-party host or remote action is introduced.

## Trust problem addressed

The earlier signed-journal reader accepted a caller-provided key registry. In production this is too easy to misconfigure or leave stale after a device authorization is revoked. The new `readPassportScopedGoalFromActiveAmbientRegistry()` is the recommended internal integration path.

This function:

1. Authorizes one current, exact mission-resource read with Passport before opening the local mission record or any device registry file.
2. Uses a **trusted, fixed** server-side goal-attempt-to-device binding to determine which native MicroSeed devices may be relevant.
3. Uses the **existing** Ambient Device Registry root to load the currently approved device trust record and the matching native-device manifest.
4. Refuses revoked, unapproved, expired, stale heartbeat, future-dated heartbeat, non-device attestation, wrong attestation identity, changed manifest hash, group-/world-writable registry authority, unapproved workload or mismatched pinned Ed25519 key.
5. Verifies current Ambient Registry trust **before opening signed journals**, then reads the signed receipts from the existing private native-agent journal. The signed device statement must match the approved manifest's public key **and manifest hash**, plus the persisted task attempt and receipt reference.
6. Rechecks the Ambient Registry's current authorization and signer key, then Passport, immediately before disclosing the redacted Living Graph.

The returned graph does not expose the registry's root, raw device identifiers, trust record, manifest keys, private goals, receipt references, or original execution result content.

## What this does NOT prove

- An Ambient Registry heartbeat is a **local registered claim** with freshness constraints; this step does not cryptographically authenticate every heartbeat or establish physical node liveness.
- An approved signer and valid Ed25519 signature prove the device key signed a specific statement, not that the statement's claimed work happened.
- A signed record still does not prove independent effect, paid order, customer delivery, fulfillment, revenue or current production readiness.
- The Ambient Registry consists of local state files. An operator must secure those files and the host against unauthorized writes. The manifest hash protects against accidental or isolated file edits, not against a privileged actor who can rewrite both the manifest and its trust record.
- Current key rotation/revocation causes old receipts to be ineligible for *current* trust presentation; historical attestation requires a separate approved audit policy.

**There is no promotion of task status**. The output continues to use `reported_complete_unverified`, `verified_receipts: 0`, `independent_effect_verified: false`, `execution_authority_granted: false`.

## Trusted-server usage

Only an owned, authenticated Systemia service should call:

    readPassportScopedGoalFromActiveAmbientRegistry({
      passportStateDir, goalStateDir, verifiedSubjectRef, goalKey,
      ambientRegistryRoot, receiptStateDirsByDevice, attemptDeviceMap, now,
    })

The identity comes from an authoritative verified session, not client headers. All directory roots, device bindings and trust policies come from trusted server configuration, never user-selected files or untrusted JSON. Grant issue/revoke, registry candidate/approve/revoke, worker dispatch, checkout, receipt signing and execution remain at their existing authorities.

CI covers active approval and exact manifest binding, stale or future heartbeat, expiry, revocation, unauthorized candidate, tampered registry manifest, unauthorized Passport read, and the existing signed-journal/native-agent integration suites. Tests use generated keys and synthetic node identities.

## Remaining on-device proof

Run a controlled signed workload on physical Node001/NextGen only through the existing authorized operator process, inspect the signed journal, verify the actual paired device's current Ambient Registry state, and reconcile the workload result to an independent downstream effect. Confirm filesystem ownership, key rotation policy, crash recovery and log redaction before production rollout.
