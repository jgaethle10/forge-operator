# Systemia Atlas private freight ledger | Phase 1 owned backend

**Status:** private development-stage backend, not a live customer TMS. The existing Atlas public cockpit at `/apps/systemia-atlas/` remains synthetic and disconnected from these records. No HTTP API or external integration is enabled by this change.

## What this is

A durable **event-ledger foundation for Atlas**, not a parallel trucking company or separate product. Source: `systemia/atlas/private-freight-ledger.mjs`. It builds on existing **Evercraft Identity** for verified HMAC-signed sessions and revocation, and **Evercraft Passport** for explicit per-tenant `atlas.read` and `atlas.write` grants. State remains resident on the Evercraft-owned server, outside `public/` and outside GitHub.

Use a distinct permissioned `stateDir`, `identityStateDir`, `passportStateDir`, and private `sessionKeyring` sourced from resident environment/secret manager, **never user/browser data**. Do not include signing keys, authentic tokens, customer names or documents in public source or automated logs. This module has no HTTP listener, no static frontend wiring and no commands that send email or contact carriers.

## Capabilities shipped in this phase

- Authenticated read/write backed by signed Evercraft sessions **and** Identity's revocation ledger, checked against Passport on each request
- Every Atlas tenant needs an **explicit resource-bound Passport grant** `tenant:<id>`; Passport's general unscoped grants deliberately do not satisfy Atlas tenant membership
- SHA-256-named tenant directories; only the resident caller selects trusted state roots; all generated directories are private (mode 0700) and event files are private (mode 0600)
- Durable event journal: per-tenant append-only JSONL, fsync before acknowledgement, strict sequential revisions, per-record SHA-256 hash chain, independent replay/verification
- Idempotency key bound to exact actor/type/input, including after restart; conflicting retry refused; stale `expectedRevision` rejected; per-tenant lock serializes local writers; **no lock auto-steal**
- Supported source-entered events: `shipper.created`, `carrier.registered`, `load.opened`, `load.quoted`, `exception.opened`, `exception.resolved`
- **Authority ceiling:** intake and *draft quote proposals*. `load.dispatched`, booking, carrier authority verification, insurance confirmation, billing and public execution are intentionally unsupported
- Carrier state is always `not_checked`, quote `draft_not_sent`, dispatch `false`, external action `false`, numbers are unverified operator inputs

## First programmatic invocation (illustrative, not a server)

```js
import {AtlasPrivateFreightLedger} from './systemia/atlas/private-freight-ledger.mjs';

const ledger=new AtlasPrivateFreightLedger({
  stateDir: '/private/evercraft/atlas',
  identityStateDir: '/private/evercraft/identity',
  passportStateDir: '/private/evercraft/passport',
  sessionKeyring: { 'rotation-key-id': process.env.EVERCRAFT_IDENTITY_SECRET }
});

// The session token MUST come from the authenticated Evercraft session server.
// Identity must have validated revocation; Atlas repeats that check.
// Passport must have an explicit resource-bound grant:
// product: 'systemia-atlas'; scope: 'atlas.read' or 'atlas.write';
// resource_refs: ['tenant:example-freight-tenant']
// First inspect revision using a read-granted session.
const snapshot=ledger.read({sessionToken,tenant:'example-freight-tenant'});

// Mutations require a write grant, a unique idempotencyKey and exact revision.
const result=ledger.mutate({
  sessionToken,
  tenant:'example-freight-tenant',
  type:'shipper.created',
  payload:{name:'Synthetic Example Shipper',region:'Washington'},
  idempotencyKey:'unique-intent-0001',
  expectedRevision:snapshot.revision
});
```

**Do not paste this example into a shell directly; it is JavaScript source requiring an authorized runtime/session.** No automatic tenant bootstrap or Passport grant issuance is performed by Atlas. That remains owned by Evercraft Identity/Passport with separate authenticated authority receipts.

## Threat model / limits

1. No public HTTP transport, no customer user interface, no reverse proxy and no remote write API yet. Any future HTTP adapter must pass verified cookies through the same secure session and CSRF protections used by Evercraft Home. Never trust a client-supplied subject, tenant role, grant ID or `x-user` header.
2. A signed and unrevoked session is necessary but not sufficient: a valid resource-specific Passport permission is required. Separate read/write scopes; no fallback to `home.*` or wildcard tenant access.
3. Local filesystem permissions and hash chaining do **not** constitute encryption at rest, secure multi-host replication, or a tamper-proof log against a privileged host administrator. No genuine customer PII, BOL/POD contents, driver documents, credentials, carrier insurance files, or financial account data should be entered until encryption, retention, backups, threat assessment and release approval are established.
4. The lock only protects cooperative writers on one host and refuses a stale lock rather than overriding another writer. The current 10 MB log limit and replay model are bounded prototype choices. Implement migration to a transactional database or atomic spool/WAL policy before multi-worker production.
5. The module refuses malformed events, a corrupt/truncated log, permissive file modes, mismatched hashes, invalid tenant IDs, stale revisions and unsupported actions. Recovery is *manual, receipt-backed*; it never silently overwrites damaged evidence.
6. No claim of live FMCSA/insurer/route validation. A field named `authority_state` describes an internal data-state, not an official motor-carrier authority finding.
7. Shipper/customer intake, verified carrier onboarding, document ingestion, dispatch and real client billing require separate scoped gates. Quote values are cents, never payments or recognized revenue.

## Verify

```bash
node --test systemia/atlas/private-freight-ledger.test.mjs
node --test tests/systemia-atlas-rebuild.test.mjs tests/atlas-route-twin.test.mjs
```

CI: `.github/workflows/atlas-private-ledger.yml`. Tests use temporary fake tenants and fake signed sessions; no real accounts and no network API calls.

## Release ladder

1. Prove session/Passport isolation, concurrent idempotent writes, disk replay integrity and revocation in unit CI.
2. Add defense-in-depth cryptographic source receipts, secure audit export, at-rest encryption, backup/restore and independent loss/corruption test.
3. Integrate behind **existing Evercraft Home** authenticated edge with strict CSRF, tenancy, role assignment and rate limits; private pilot only.
4. Connect Atlas browser cockpit to authenticated typed API, no demo records mixed with real data.
5. Verify official carrier authority/insurance, customer permissions and the legally appropriate brokerage obligations before any production load booking/dispatch.
6. Integrate RouteTwin official road/forecast sources separately with unknown/stale holds; human signoff, never autonomous dispatch.
7. Paid customer service only after verified owned-HTTPS operation, support model, commercial settlement and actual evidence of usability.

The existing public discovery record `systemia-atlas-freight` is **not** updated by this change because its currently published discovery-only status remains the correct machine-facing truth.
