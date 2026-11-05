# Systemia Timewalk | isolated prototype (v0)

This is a **read-only** historical projection over the existing Evercraft Context Fabric. It is not a new operational database, is not an integration with Utopia, and does not enable agent action. It uses existing Passport checks through `fabric.getRecord`, preserving the rule that historical access **never** revives an expired permission.

## What it reconstructs

- `known_at`: when the information had entered Context Fabric (`created_at`)
- `valid_at`: when the fact was effective (`valid_from`/`valid_to` where provided, otherwise the earliest observation)
- signed sources, evidence states, knowledge corrections, retractions and unresolved conflicts

Because the fallback `observed_at` is **not** proof of when a fact became true, every returned fact states its effective-time basis. This avoids presenting backdated evidence as confirmed historical knowledge.

## Example

```js
import { EvercraftContextFabric } from '../fabric.mjs';
import { queryTimewalk } from './timewalk.mjs';
const fabric = new EvercraftContextFabric({ stateDir, passportStateDir });
const snapshot = queryTimewalk(fabric, {
  actor_ref: 'agent:approved-auditor',
  known_at: '2026-10-15T00:00:00Z',
  valid_at: '2026-10-15T00:00:00Z',
  namespaces: ['systemia'],
});
```

The historical read is only allowed if the actor has present-time read authorization for each record. The result includes no document text or hidden metadata for records denied by Passport.

## Verification

`node --test systemia/context-fabric/timewalk/timewalk.test.mjs`

Synthetic fixtures cover knowledge-time cutoff, validity windows, supersession, retraction, conflict provenance, present-day authorization, integrity failure, and incomplete result indication.

## Deliberate limits

- Pure read projection; no migrations, background ingestion, or production switch
- No full decision replay or semantic inference
- No historical snapshots of revoked grants
- No public API; the kernel should remain private until access hardening, performance review, and on-machine integration tests
- Prototype consumes the existing Context Fabric `records` map and `getRecord` API; a stable iterator API should replace this before production
- Utopia may inspire the time model, but no Utopia code, binaries, licenses, or data are embedded
