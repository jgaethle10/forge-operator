# Systemia Signed Device Evidence v0.1

This work is an **internal, read-only signature evidence lane**, layered onto the existing Systemia Goal Store, Passport-scoped Visual Read and Living Graph. It does not create another mission authority, model, device agent, server, deployment, or payment pipeline.

## What it actually verifies

- Calls the existing MicroSeed Ed25519 verifier from `systemia/saban/microseed-receipt-signature.mjs`.
- Requires a caller-trusted, server-pinned public key, exact device identity, and allowlisted workload class.
- Requires an exact match between the signed receipt's idempotency key and an existing Systemia goal attempt key, and between its receipt hash and the goal's persisted receipt reference.
- Rejects non-complete task state, wrong attempt identity, mismatched reference, duplicate/replayed receipts, implausible timestamps, arbitrary-code-execution claims, and nonzero external cash spending.
- Emits ordinal task evidence without device IDs, key IDs, raw receipt hashes, mission keys, work keys, prompts, customer content, or private paths.

**Important:** valid Ed25519 signatures authenticate the signed device statement, not its real-world correctness. The persisted Systemia state could also be wrong. This adapter does not independently verify execution effects, success, delivery, customer satisfaction, paid state, or revenue. `verified_receipts` remains zero and the mission's completion status stays `reported_complete_unverified`.

## Trusted internal API

`correlateSignedDeviceEvidence(goalState, { signedReceipts, trustedDeviceKeys, now })` is a pure read-only correlator. It accepts already-loaded goal state and receipt objects, but must never be exposed as a client-authorized endpoint.

`readPassportScopedGoalWithDeviceEvidence({ passportStateDir, goalStateDir, verifiedSubjectRef, goalKey, signedReceipts, trustedDeviceKeys, now })` is the gated wrapper. It checks an exact current `systemia / mission.visual.read / goal:<goalKey>` Passport grant before accessing goal state and again before disclosing its result. Only the existing Identity boundary may supply `verifiedSubjectRef`, and only a trusted runtime operator may set state directories, pinned key registry or receipt sources.

A trust anchor is configured server-side by key ID, with `device_id`, `public_key_pem` and a bounded `allowed_workload_classes` array. **Never accept that anchor from an uploaded JSON file, client header or the same receipt you are attempting to validate.**

The public browser remains a display-only viewer. An imported JSON file is never trusted by the browser. It can show a count claimed to have had signatures verified by an upstream adapter, but cannot independently authenticate that source.

## Test the development code

    node --test systemia/control-plane/visualization/signed-device-evidence.test.mjs
    node --test systemia/control-plane/visualization/passport-signed-device-read.test.mjs
    node --test systemia/control-plane/visualization/signed-device-ui.test.mjs

CI also runs the prior Passport and goal-bridge regression suites. All local test receipt keys and grant records are synthetic.

## Still required before calling this live

1. Authenticate the operator through Evercraft's existing Identity boundary, with server-pinned state and trust configuration.
2. Source actual Node001/NextGen signed receipts from an authorized owned receipt store, not arbitrary JSON uploads.
3. Confirm signed receipt provenance, key rotation and revocations against an owned approved device registry.
4. Independently reconcile signed workload output to real mission effects and downstream delivery receipts. Only then may a distinct verification state be added.
5. Host the Living Graph behind the approved owned access controls, and verify physical node reads, stale/offline behavior, logs, and permission revocation.

**No production host, permission, payment, worker, external service or mission was mutated by this development PR.**
