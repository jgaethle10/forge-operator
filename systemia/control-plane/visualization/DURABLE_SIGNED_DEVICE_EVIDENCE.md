# Durable MicroSeed Signed Evidence to Systemia v0.1

This development layer joins the existing MicroSeed native agent, its local idempotency store, Systemia Goal Store, Passport, and Living Graph. It runs only on Evercraft-controlled runtime code. No external host, third-party runtime, public API, new execution authority, or production deployment is introduced.

## Concrete gap closed

Previously, the MicroSeed native agent returned an Ed25519-signed execution receipt, but the local idempotency cache recorded the **unsigned** execution receipt. Consequently, an offline Systemia visual reader could not reconstruct an authentic signer statement from local history.

Now the native agent records the **signed** receipt in a separate private journal *before* responding to the caller. The unsigned executor idempotency cache is unchanged. The new journal uses hashed device ID / attempt-key filenames, a new-file-only write, private 0700 directories and 0600 receipt file, an fsync of the receipt file, bounds on serialized content, and refusal to follow redirected journal directories or symlink receipt records. Existing journal entries cannot be overwritten. If persistence fails, the native agent does not acknowledge HTTP 200, and the operator must reconcile actual execution before any unsafe retry.

**Exactly-once caveat:** some workloads are sensitive and do not use the existing replay cache. A persistence failure after actual execution does not guarantee that execution did not occur; no automatic retry or recovery authorization is added here.

## Internal read path

`readPassportScopedGoalFromSignedStore()` in `systemia/control-plane/visualization/passport-goal-read.mjs` performs the exact mission-resource Passport authorization *before* opening the goal or receipt journal. It reads the persisted goal state, uses a **trusted server-side** attempt-to-device binding to locate the specific local signed receipt by device and attempt, then validates it through the existing pinned-key Ed25519 correlator. It checks Passport authorization again before returning.

Caller-supplied maps `attemptDeviceMap`, `receiptStateDirsByDevice`, and `trustedDeviceKeys` MUST be supplied from trusted Evercraft-owned runtime configuration. Never make them ordinary public API parameters or infer the pinned key from the receipt being inspected. No network collection, remote node probing or delivery proof happens in this library.

Missing local receipt files remain explicit `signed_receipt_sources_missing` counts and do not promote tasks. Corrupt, symlinked, tampered, mismatched, unsigned or untrusted present receipts fail the read rather than being silently ignored. The JSON output excludes original device IDs, task keys, receipt hashes, customer identities and raw results.

## Evidence boundary

- Valid signature = this pinned device key signed these receipt bytes.
- Exact attempt match = the signed receipt identifier matches the persisted Systemia attempt and receipt reference.
- **Not established:** whether actual execution happened as claimed; whether work was useful; whether a customer received anything; whether payment settled; or whether Node001/NextGen is currently healthy.
- `verified_receipts` remains zero and `independent_effect_verified` remains false. No mission status becomes authoritative from signature correlation.

## Isolated verification

`node --test tests/saban-microseed-signed-receipt-store.test.mjs tests/saban-microseed-e2e.test.mjs systemia/control-plane/visualization/passport-signed-device-read.test.mjs`

The test suite checks local signed journal persistence from the existing native agent, private file behavior, retry conflict and replay rules, Passport denial and revocation, actual journal read, missing receipt gaps, tampered evidence, and UI truth labels. All CI identities, mission states, keys and workloads are synthetic.

## Remaining on-device work

1. Deploy only after stacked PR reviews and the existing Identity/Passport service contract are approved.
2. Provision trusted, server-pinned device key registries and attempt-to-device binding receipts. Maintain key rotation and revocation history.
3. Run physical Node001/NextGen end-to-end signed workload and inspect the private journal on the node; confirm no sensitive output is logged or published.
4. Mount or synchronously ingest signed receipts into a trusted, access-controlled owned store without bypassing Identity/Passport.
5. Independently reconcile concrete workload output and customer delivery before ever representing task success, fulfillment or revenue as verified.

Nothing in this draft should be treated as a live deployment or actual node observation.
