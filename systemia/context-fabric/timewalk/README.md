# Systemia Timewalk | bitemporal read-only prototype (v0.1)

**Source audit:** [AUDIT.md](./AUDIT.md) connects this work to the existing documented Evercraft memory, authorization, receipts and version-history architecture.

This is an **internal-only, read-only** historical projection over Evercraft Context Fabric. It is **not** a new operational database, not Utopia deployment, and not an agent execution interface. Historical records are visible **only if the actor is authorized by Passport now**.

## Two independent questions

- `known_at`: what had actually been **ingested into Context Fabric** by that timestamp, using `record.created_at`. It is not a claim about what any human or system outside Context Fabric knew.
- `valid_at`: when a claim asserted that it was effective, using `valid_from` / `valid_to` when present. Otherwise `observed_at` is a conservative fallback and **not historical proof**.
- `authorization_checked_at`: server-clock Passport authorization time. The caller cannot choose it. This is separate from both historical clocks.

Example: a fact observed Oct 10 but entered Oct 20 does **not** appear in an answer about what was known Oct 15, even if its effective date is Oct 10.

## API (private code only)

```js
import { EvercraftContextFabric } from '../fabric.mjs';
import { queryTimewalk } from './timewalk.mjs';

const fabric = new EvercraftContextFabric({ stateDir, passportStateDir });
const snapshot = queryTimewalk(fabric, {
  actor_ref: 'agent:approved-auditor', // must come from authenticated identity
  known_at: '2026-10-15T00:00:00Z',
  valid_at: '2026-10-15T00:00:00Z',
  namespaces: ['systemia'],
  entity_ref: 'service:payments', // optional exact-match bound
  predicate: 'health',           // optional exact-match bound
  limit: 100,
});
```

**Never expose this raw `actor_ref` parameter in a public endpoint.** Identity must bind it to an authenticated actor before Passport authorization. Never pass a historical timestamp into an authorization check. Passing `authorization_at` to Timewalk fails.

## Recorded knowledge and uncertainty

A result preserves source refs, Context Fabric receipt hashes, evidence states, conflicts, corrections, explicit retractions and citations. Record hashes are SHA-256 **tamper indicators**, not cryptographic signatures or validation of external claims.

- Supersession only applies when the replacement was itself already known, effective and not retracted.
- New Context Fabric retractions record both `retracted_at` (event time) and `created_at` (system-recorded knowledge time).
- Existing legacy retractions with no system creation clock are labeled `retraction_time_unverified`, and set `historical_status_complete: false`; the query does not fabricate the missing timestamp.
- Retractions are never removed or silently overwritten. A retraction can invalidate a newer correction without erasing the earlier observation.
- Unresolved conflicting active claims remain side-by-side with source refs.
- Data from retrieved content never becomes execution instructions or action authority.

## Evidence coverage inventory (v0.2 research slice)

The read-only `inspectTimewalkEvidenceCoverage(fabric, { actor_ref, namespaces })`
function in `coverage.mjs` checks **currently Passport-visible Context Fabric
records**, not the completeness of every Evercraft ledger.

It inventories the three receipt schemas explicitly handled today by
`context-fabric/receipt-bridge.mjs`: completed Execution Gate leases,
accepted Intake Fabric admission packets, and Systemia mission admissions.

For each family, the result reports counts of currently visible Context
records, how many declare an upstream source-receipt hash, evidence states,
the observation and ingestion date range, and whether no matching records are
visible. It also lists source contracts with **no implemented Context Receipt
Bridge handler**: Payments, Shipping, Lineage, Interaction Ledger, and
Notification Fabric. This is a mapping of source contracts, **not** a statement
that those domains have no events or no other history implementation.

The summary records an SHA-256 fingerprint of the **authorized snapshot**
and checks each Context record and retraction's own unkeyed receipt integrity.
It **does not** fetch original source receipts or independently confirm them.
Neither a valid Context hash nor a source hash field proves that a real payment,
customer shipment, deployment or human approval happened.

```js
import { inspectTimewalkEvidenceCoverage } from './coverage.mjs';

const coverage = inspectTimewalkEvidenceCoverage(fabric, {
  actor_ref: 'agent:approved-auditor', // verified internal actor only
  namespaces: ['systemia'],           // optional limited scope
});
```

Every output is explicitly labeled `currently_visible_context_records_only`.
A missing row means **not visible or not ingested to Context Fabric**, never
"no event happened." The function is not exposed to the web and must not
accept unauthenticated actor claims. More than 5000 visible records fails
closed under the snapshot's existing hard cap.

See [AUDIT.md](./AUDIT.md) for the complete source-to-projection gap inventory.

## Source receipt reconciliation (v0.3 research slice)

The new `source-reconciliation.mjs` uses a **caller-supplied, synchronous,
read-only source receipt adapter** to compare the currently Passport-visible
Context Fabric records against receipt bytes provided by an existing source
ledger. The module itself never contacts a provider or writes to any ledger.

```js
import { reconcileTimewalkSourceReceipts } from './source-reconciliation.mjs';

const report = reconcileTimewalkSourceReceipts(fabric, {
  actor_ref: 'agent:approved-auditor', // bound to a real internal identity
  namespaces: ['systemia'],          // optional; controls the visible subset
  read_source_receipt: ({ source_receipt_schema, source_receipt_hash }) =>
    existingReadOnlyReceiptStore.lookup(source_receipt_schema, source_receipt_hash),
});
```

The provided adapter must return the original receipt object or `null`. Only
Context records already authorized by the existing Context Fabric snapshot
are queried, and source-lookup arguments include the receipt schema and digest
but **no raw Context text, customer identity, or historical private metadata**.
A single source digest is looked up once per invocation. Lookup failures
remain bounded status counts, not leaked exception messages.

The reconcilier checks, in order:

1. The SHA-256 integrity of **all authorized Context records/retractions**;
   any tampering fails closed *before* the source adapter is called.
2. Source receipt schema and the producer's expected digest algorithm
   (full SHA-256 for execution and intake, 12-character SHA-256 prefix for
   Systemia mission admission).
3. The stored Context source hash against that recomputed digest.
4. Expected projected fields such as entity reference, predicate, claim value,
   source reference, evidence label, and observation timestamp.
5. The **exact receipt-derived title and summary text** from the existing bridge,
   so a self-consistently rehashed but rewritten narrative fails as a mismatch.

Each result is an **aggregate status count**, with no returned raw receipts,
record IDs or source references. The possible states include consistent hash
and projection, missing hash, source unavailable, source adapter failure,
schema mismatch, digest mismatch, projection mismatch, and unsupported family.

**Critical:** `consistent_digest_and_projection` means only that the bytes
provided by the read adapter are internally consistent with a Context
projection. This alone is **NOT independent source-origin authentication**,
proof of customer payment, verified shipment, released artifact, completed
mission, or the completeness of company history. A self-consistently
fabricated source receipt would still need a separate trusted-origin check.
The report explicitly says `source_origin_authenticated: false`.

No external API endpoint is exposed, no source account connection is made,
and no privacy/retention policy is bypassed. Before any private deployment,
the source adapter must be bound to authorized internal services with an
auditable origin trust chain, stable snapshots, and an independent security
review.

```bash
node --test systemia/context-fabric/timewalk/source-reconciliation.test.mjs
```

## Cryptographic origin attestation (v0.4 research slice)

Timewalk now has an **optional**, offline Ed25519 producer-attestation check.
This builds on source digest/projection reconciliation but does not silently
upgrade any old unsigned receipts. See `origin-attestation.mjs`.

Each **new, separately issued** attestation binds the producer/issuer ID,
key ID, source receipt schema, receipt hash, SHA-256 of the precisely ordered JSON.stringify receipt
object, issuance and expiration times. The signature covers a
versioned, domain-separated canonical array payload. It is verified only
against an **operator-pinned Ed25519 public key**, with explicit
producer/schema allowlist and signing-key validity/revocation checks.

No private signing keys are committed to GitHub. Unit tests generate ephemeral
keys in memory. This code **does not create attestations for historical records,
or confer retroactive authenticity on unsigned source receipts**.

A trusted internal integration may inject a separate, synchronous, read-only
attestation reader and server-owned trust registry:

```js
const report = reconcileTimewalkSourceReceipts(fabric, {
  actor_ref: verifiedSession.subject_ref,
  read_source_receipt: ({ source_receipt_schema, source_receipt_hash }) =>
    readOnlySourceLedger.get(source_receipt_schema, source_receipt_hash),
  read_source_attestation: ({ source_receipt_schema, source_receipt_hash }) =>
    readOnlyAttestationLedger.get(source_receipt_schema, source_receipt_hash),
  trusted_origin_keys: operatorOwnedPinnedKeys, // never user/source-supplied
});
```

Attestation checking is attempted **only after** the original Context record,
linked source receipt hash and expected projection have already passed.
Results expose aggregate counters: `signature_valid_for_pinned_key`,
`attestation_unavailable`, `attestation_lookup_failed`,
`attestation_rejected`, `source_not_consistent`, and
`not_configured`. No raw receipt, signature, or private source IDs are
returned.

**Truth boundary:** a valid signature means the bytes match an attestation
signed by a key in the supplied trust registry. It is **not automatically**
proof the key belongs to the live authoritative production service, that the
signer was uncompromised, that a customer paid, that a shipment arrived, or
that every historical event is represented. The output deliberately retains
`source_origin_authenticated: false` and
`trusted_origin_registry_independently_validated: false` because this
standalone research module cannot verify how an operator supplied those keys.
Actual source-origin assurance needs separately audited key issuance,
secure private-key custody, key rotation/revocation and authoritatively
approved source integration.

```bash
node --test systemia/context-fabric/timewalk/origin-attestation.test.mjs
node --test systemia/context-fabric/timewalk/execution-ledger-reader.test.mjs
node --test systemia/context-fabric/timewalk/source-reconciliation.test.mjs
```

## Owned Execution Gate source-ledger reader (v0.5)

The repository already persists each Execution Gate lease event to
`execution-lease-events.jsonl`. The new
`execution-ledger-reader.mjs` exposes a **private-only, synchronous,
read-only receipt adapter** for *that exact existing filename* and *only*
`evercraft.execution-gate.lease-event.v1`.

A trusted internal caller binds an absolute Execution Gate state directory.
The caller cannot choose individual files, issue URLs, edit the store,
or use this reader to scan unrelated sources:

```js
import { createExecutionGateLedgerReceiptReader } from './execution-ledger-reader.mjs';

const read_source_receipt = createExecutionGateLedgerReceiptReader({
  state_dir: '/private/operator-approved/execution-gate-state',
});
const report = reconcileTimewalkSourceReceipts(contextFabric, {
  actor_ref: verifiedInternalSession.subject_ref,
  namespaces: ['aliev'],
  read_source_receipt,
});
```

The source directory is an **operator-provisioned secret**, never supplied by
customer input or obtained from public product configuration. The adapter
requires a non-symlink private regular file, verifies every event's embedded
SHA-256 digest before serving any lookup, bounds source reads to 16 MiB and
20,000 events, rejects partially appended JSONL and duplicate hashes, and
pins the source snapshot in memory for its lifetime. Callers must construct a
**new reader for a new source snapshot** rather than reusing an old instance
across unrelated reconciliation runs.

The adapter never claims the file's ownership is independently authenticated.
A forged replacement JSONL with recalculated receipt hashes could still be
internally consistent. The output therefore stays at digest/projection
consistency, not verified origin. Existing signatures require separately
operator-pinned keys and attestation records.

**Coverage is deliberately narrow:** Intake's admission packet is synthesized
from candidate + decision records, rather than stored in the same JSONL
receipt format, while Systemia mission-admission receipts are returned from
mission planning without a unified source-receipt store in this inspected
path. We have **not** invented adapters for either of them.

No repository sample paths are live environments; this code has not read
the private production state directory, been exposed as an endpoint,
merged, or deployed.

```bash
node --test systemia/context-fabric/timewalk/execution-ledger-reader.test.mjs
```

## Performance and security boundaries

The Context Fabric method `authorizedTimewalkSnapshot` filters by **current**, entity/record-resource-scoped Passport grants before returning internal records, then performs an in-memory read-only projection. The snapshot has a hard cap of **5000 authorized matching records** and fails closed if exceeded. Timewalk output has a separate `limit` of 1 to 1000, and reports truncation as `complete: false`.

**Do not merge or deploy** without native integration tests, resource-scoped actor authentication, transactional snapshot consistency, tenant/privacy review, benchmarks, and a verified release/deployment receipt. This prototype uses no external system, third-party Utopia code, or customer production data.

## Verification

```bash
node --test systemia/context-fabric/timewalk/timewalk.test.mjs
node --test systemia/context-fabric/timewalk/timewalk.integration.test.mjs
node --test systemia/context-fabric/timewalk/coverage.test.mjs
node --test systemia/context-fabric/timewalk/source-reconciliation.test.mjs
node --test systemia/context-fabric/fabric.test.mjs
```

The first is synthetic; the second runs real Passport + Context Fabric over temporary synthetic records and tests expired/revoked/resource-limited access. Neither proves production historical accuracy. The PR remains draft pending native integration and CI evidence.
