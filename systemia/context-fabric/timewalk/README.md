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

## Performance and security boundaries

The Context Fabric method `authorizedTimewalkSnapshot` filters by **current** Passport grants before returning internal records, then performs an in-memory read-only projection. The snapshot has a hard cap of **5000 authorized matching records** and fails closed if exceeded. Timewalk output has a separate `limit` of 1 to 1000, and reports truncation as `complete: false`.

**Do not merge or deploy** without native integration tests, resource-scoped actor authentication, transactional snapshot consistency, tenant/privacy review, benchmarks, and a verified release/deployment receipt. This prototype uses no external system, third-party Utopia code, or customer production data.

## Verification

```bash
node --test systemia/context-fabric/timewalk/timewalk.test.mjs
node --test systemia/context-fabric/fabric.test.mjs
```

The first is synthetic; neither suite alone proves production historical accuracy. The PR remains draft pending native integration and CI evidence.
