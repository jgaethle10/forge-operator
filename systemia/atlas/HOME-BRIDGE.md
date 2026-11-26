# Systemia Atlas × Evercraft Home private HTTP bridge

**State: source-staged opt-in integration; default DISABLED.** This extends the merged Atlas private ledger without broadening the public Pages fallback or enabling booking/dispatch. No customer data is created or connected by a GitHub merge.

## What changes

Evercraft Home optionally mounts two *authenticated* endpoints under its existing private API:

- `GET /api/atlas/private/:tenant` returns the tenant's private, operator-entered snapshot
- `POST /api/atlas/private/:tenant/events` records exactly one allowed private-ledger event with a revision and idempotency key

Both require a valid **Evercraft Home Passport session**, plus a **separate** active Passport authorization for product `systemia-atlas` and explicit resource `tenant:<id>`. Home's `home.read` grant does not grant any Atlas scope. No admin wildcard or silent Atlas tenant bootstrap. Login is existing Evercraft Home login; the Bridge issues no sessions, accounts or grants. Evercraft Identity revocation and Atlas grant revocation are both enforced by the ledger on requests, including writes.

Allowed events are intentionally limited to:
- `shipper.created`
- `carrier.registered` (unverified, not approved)
- `load.opened` (intake only)
- `load.quoted` (draft proposal only, not sent)
- `exception.opened`, `exception.resolved`

No carrier vetting, ELD, real routing, customer communications, financial settlement, dispatch, vehicle actuation or checkout. Operator-supplied data and examples are unverified, not live logistics.

## Fail-closed deployment configuration

```bash
# Keep passport authentication and Home's existing settings intact.
EVERCRAFT_HOME_AUTH=passport
EVERCRAFT_ATLAS_PRIVATE_ENABLED=false
# ONLY change to true after a private state directory, backups, encryption,
# restricted ingress, CSRF and authentic tenant authority have been reviewed.
EVERCRAFT_ATLAS_STATE_DIR=/var/lib/evercraft/atlas
```

**Disabled is the default.** When disabled, any `/api/atlas` path responds 404; it cannot fall through to a static SPA. When enabled, Home boot refuses local-only auth, missing state configuration, relative state paths and source-repository state roots. The Atlas state root must remain outside Git and public web assets, in a private 0700 parent and owner-controlled filesystem, with 0600 event logs. Home must be served through the *existing authenticated owned TLS edge*. Never set `EVERCRAFT_HOME_COOKIE_SECURE=false` on a real public edge.

The bridge is separate from `public/apps/systemia-atlas/`. This **does not turn the public synthetic demo into a private authenticated app**. Customer data must not be entered into the public demo. A new internal Atlas UI, encrypted at-rest storage, verified role-scoped workflows and secure backup/restore remain future release gates.

## Request safety

- GET: valid Home session with `home.read` and Atlas `atlas.read` for exact `tenant:<id>`, no cross-site fetch.
- POST: valid Home session plus Atlas `atlas.write`, strictly same-origin `Origin`/Host matching, `Sec-Fetch-Site` cross-site rejection, custom `X-Evercraft-Atlas-Intent: mutation-v1`, JSON-only, max 8192 bytes, no extra top-level keys, exact `expected_revision` and `idempotency_key`.
- All responses use Home's security headers, `no-store`, no CORS allowance, no raw session signing materials or state file paths.
- Bad/stale revisions: HTTP 409; missing permissions: HTTP 403; unauthenticated: HTTP 401; malformed payload: HTTP 400; ledger integrity failure: generic hold; unsupported dispatch: rejected.
- Private ledger continuously re-verifies Passport and Identity; no caller-supplied actor identity, role or authorization grant is trusted.
- No automatic external communications or paid transaction flows.

Example request (illustrative code only):

```js
const r=await fetch('/api/atlas/private/example-tenant/events',{
  method:'POST',
  credentials:'same-origin',
  headers:{
    'Content-Type':'application/json',
    'X-Evercraft-Atlas-Intent':'mutation-v1'
  },
  body:JSON.stringify({
    type:'shipper.created',
    payload:{name:'Example synthetic shipper',region:'Washington'},
    idempotency_key:'fresh-intent-id',
    expected_revision:0
  })
});
```

The browser automatically sets the Origin header. Do **not** embed session cookies or keys in source, JS or example commands. On production, the whole app must remain in the authenticated Home perimeter.

## Security and platform limitations

1. Filesystem permission bits and hash chains do NOT provide encryption at rest, tamper-proof external witnesses, backups, multi-host locking or crash-proof transactional recovery. The current ledger is a bounded single-host prototype. Real customer data still requires the remaining security gates.
2. Exact-tenant Passport grants are intended to be issued *only* by a verified authority, via existing Identity/Passport onboarding with evidence receipts. This bridge issues no grants.
3. CSRF security depends on Home's existing HttpOnly SameSite=Strict cookie, the browser's Origin and fetch metadata, the extra non-simple header, and the authenticated same-site TLS edge. The client cannot supply broader role or tenant claims.
4. Do not add this route to public Pages, CHUM static discovery or open unauthenticated workspaces.
5. No persistent rate-limiting or customer lifecycle has been built. The route remains default OFF until traffic quotas, secure storage and operational readiness are added.

## Test and next gate

Run:
```bash
node --test systemia/evercraft-home/atlas-private-http.test.mjs
node --test systemia/atlas/private-freight-ledger.test.mjs
```

Dedicated CI: `.github/workflows/atlas-home-private-api.yml`, plus existing full Forge checks. Tests start a **loopback-only Home server**, create test-only sessions and mock data in temporary directories, and perform actual HTTP requests with intended and blocked credentials. No real customers or providers are contacted.

**Next release**: encryption + backup/restore + file/dir race review; canonical private Atlas UI served behind Home, current-scope onboarding, independent external denial QA and owner-approved pilot. Keep the default OFF until those are complete.
