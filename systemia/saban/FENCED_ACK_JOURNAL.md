# Saban Fenced Acknowledgment Journal (candidate)

This is a **non-executing, private local-state recovery component** for the Evercraft OS `events_jobs` and `autonomous_execution` workstreams, coordinated by #1546.

Existing Saban dispatch, NodeSeed jobs, Systemia mission admission and payment flows are **unchanged**.

## What it proves

- Work is addressed by an idempotent logical key plus an immutable workload and payload digest. A conflicting payload for the same key fails closed.
- Each attempted local lease gets a fresh 256-bit random capability. **Only its SHA-256 digest** is recorded in the private append-only event journal.
- A successful acknowledgment must supply the active worker, matching capability, a result digest and an opaque local evidence reference. A repeated identical acknowledgment does not create another event.
- An expired lease is classified as **ambiguous**, not automatically replayed. A separately recorded review reference plus evidence reference is needed to reopen the job; the previous worker's capability can never acknowledge the subsequent attempt.
- Event history is hash-chained, HMAC-bound when an application secret is provided, appended with fsync, and guarded by a bounded single-host exclusive lock. Any truncated or tampered journal prevents new operations. A crash between durable append and acknowledgement response can be reconciled by replay.
- Two actual Node processes submitting the same logical job under the same state directory produce one durable submission event.

## What it emphatically does not prove

A recorded result digest or evidence reference is not validation of a physical worker result or a customer's delivered product. This module never calls a worker, creates a remote NodeSeed lease, submits a real mission, authorizes Passport actions, sends email, settles a payment or changes production state. The review references are **recorded**, not independently authenticated; no automatic permission is derived from them.

The current implementation assumes a single local filesystem with atomic directory creation and append semantics. It is not a multi-host consensus engine, a database transaction coordinator, or a general solution to exactly-once external effects. No crash-time write repair is automated, and no claim of safe reuse of a stale lock is made. Future integration must couple Systemia's actual authorizations, canonical job receipt verifiers and distributed fencing.

## Tests

```bash
node --test systemia/saban/fenced-ack-journal.test.mjs
```

Test coverage includes interrupted-response replay, same-worker stale-token rejection after reviewed retry, no implicit retries on expired leases, mismatched digest conflicts, HMAC mismatch, journal truncation/tampering, and independent-process duplicate submission. CI executes the tests without enabling any real deployment.

**Promotion gate:** security review, scoped runtime integration, independent external side-effect evidence, multi-node failure proof, and explicit release authorization.