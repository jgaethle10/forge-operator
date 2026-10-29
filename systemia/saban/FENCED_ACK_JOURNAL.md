# Saban Fenced Acknowledgment Journal (candidate)

This is a **non-executing, private local-state recovery component** for the Evercraft OS `events_jobs` and `autonomous_execution` workstreams, coordinated by #1546.

Existing Saban dispatch, NodeSeed jobs, Systemia mission admission and payment flows are **unchanged**.

## What it proves

- Work is addressed by an idempotent logical key plus an immutable workload and payload digest. A conflicting payload for the same key fails closed.
- Each attempted local lease gets a fresh 256-bit random capability. **Only its SHA-256 digest** is recorded in the private append-only event journal.
- A successful acknowledgment must supply the active worker, matching capability, a result digest and an opaque local evidence reference. A repeated identical acknowledgment does not create another event.
- An expired lease is classified as **ambiguous**, not automatically replayed. Reopening requires a registered review authorizer. The first-party adapter independently rereads a **consumed, unexpired, non-revoked Passport action permit** bound to the precise job, immutable work digest, attempt number, and inspection evidence. No arbitrary approval string suffices; the previous worker's capability can never acknowledge the subsequent attempt.
- Event history is hash-chained, HMAC-bound when an application secret is provided, appended with fsync, and guarded by a bounded single-host exclusive lock. Any truncated or tampered journal prevents new operations. A crash between durable append and acknowledgement response can be reconciled by replay.
- Two actual Node processes submitting the same logical job under the same state directory produce one durable submission event.

## What it emphatically does not prove

A recorded result digest or evidence reference is not validation of a physical worker result or a customer's delivered product. This module never calls a worker, creates a remote NodeSeed lease, submits a real mission, authorizes Passport actions, sends email, settles a payment or changes production state. The Passport authorizer independently checks consumed local permits, but no external founder identity proof or physical-device job receipt is produced here. No automatic permission is derived from a software proof.

### Passport authorizer integration

The raw journal defaults to **no retry authority configured**. Callers must explicitly install `makePassportRetryAuthorizer({passportStateDir})` from `fenced-passport-review.mjs`, pointing to the **trusted local Passport store**, before an ambiguous retry is even eligible for review.

A trusted operator process separately mints and consumes a single-use Passport permit with product `saban`, scope `job.retry.review`, resource equal to the precise job key, and `request_fingerprint` computed by `fingerprintFencedRetry({jobKey,workDigest,attemptNumber,evidenceRef})`. The journal calls `getActionPermitState` and rejects missing, unconsumed, revoked, expired or mismatched permits. The permit's receipt digest is recorded in the journal, not any bearer secret.

**This is a trust boundary only when the Passport store and its mint/consume endpoints are separately protected.** Test fixtures use synthetic manual grants, not actual founder approvals. No real device or commercial action is authorized by these tests.

The current implementation assumes a single local filesystem with atomic directory creation and append semantics. It is not a multi-host consensus engine, a database transaction coordinator, or a general solution to exactly-once external effects. No crash-time write repair is automated, and no claim of safe reuse of a stale lock is made. Future integration must couple Systemia's actual authorizations, canonical job receipt verifiers and distributed fencing.

## Tests

```bash
node --test systemia/saban/fenced-ack-journal.test.mjs
```

Test coverage includes interrupted-response replay, same-worker stale-token rejection after reviewed retry, no implicit retries on expired leases, mismatched digest conflicts, HMAC mismatch, journal truncation/tampering, and independent-process duplicate submission. CI executes the tests without enabling any real deployment.

**Promotion gate:** security review, scoped runtime integration, independent external side-effect evidence, multi-node failure proof, and explicit release authorization.

## Opt-in Saban scheduler integration canary (2026-10-28)

The **existing** `runScheduler` now accepts an optional `fencedJournal` object, defaulting to `null`. Unless explicitly passed, the original scheduling and retry behavior remains intact. Passing a journal branches into `fenced-local-scheduler.mjs`, which only permits a named `saban-fenced-readonly-canary` contract that declares `fenced_local_candidate: read_only_no_external_effects`, no external network/commerce/outreach/public file updates, **one local physical worker**, and exactly one attempt per job.

The fenced path uses the existing Saban `leaseNext`, `complete`, `fail`, and persisted `work-state.mjs` contract. It requires a state path, single-run exclusive filesystem lock, crash-safe journaling, pre-dispatch reconciliation of Saban and journal state, and result-digest comparison for already completed work. It persists the Saban lease **before** obtaining a separate journal lease. A crash in either gap leaves an ambiguous state that fails closed on restart. An adapter exception or missing acknowledgment is marked dead-letter, never automatically reissued. Only local source-check receipts are accepted, not real external-provider acknowledgments.

The test `fenced-local-scheduler.test.mjs` executes the **actual scheduler entrypoint** with two read-only assignments, checks idempotent replay with no repeated adapter call, a deliberate adapter exception, both crash windows, stale state, unapproved contracts, duplicate runner locks, two-worker rejection, and forged completed-result digest rejection. Tests use temporary local state only and cannot contact Node001, Node002, the network, customers or payment providers.

**Unresolved:** this is not yet a live product execution or a distributed NodeSeed integration. The read-only contract is a **test-only candidate**, not an approved Saban commercial worker. Synchronization is local filesystem based and does not provide cross-host consensus, verified customer delivery or authenticated execution authorization. The API must not be promoted to live dispatch until independently authorized result verification, permitted side effects, and an operator-controlled release canary are separately proved.
