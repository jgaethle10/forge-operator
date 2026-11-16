# Evercraft OS | One operating environment: Home integration slice

This is an existing-service integration, not a second operating system or an agent launcher.

## What is implemented in this slice

- `/os.html`: a responsive first-party founder screen reachable from Home's existing navigation and the native OS app catalog.
- `GET /api/os/integration`: requires the existing Evercraft Home `home.read` Passport authorization in identity mode (or explicit loopback local development mode). Combines source-only OS boot/app contract status, source Journal receipt state, and continuity archive evidence through existing Home adapters. It does not invoke any mission, pay for work, connect to a provider, publish, or install applications.
- `os-integration-adapter.mjs`: single non-mutating, sanitized state contract for the 8-stage work-to-outcome lifecycle. Missing mission, worker, settlement, and delivery joins are **unknown**, not zero and never success.
- `os-integration.test.mjs`: unit and authenticated local Home HTTP assertions. Existing `Evercraft OS proofs` workflow also runs the test.

## States and boundaries

- `source_proven`: code/contract evidence only, not resident runtime or outside HTTPS.
- `source_present`: an archive is present but not independently restored.
- `held`: local/source requirement cannot be affirmed.
- `unknown`: no authoritative linked receipt provided for the stage.

The entire readback remains `held_pending_end_to_end_field_proof` even if local OS source preflight passes. No active agents, successful transactions, product delivery, mission authority or external uptime are inferred.

**Privacy:** This `home.read` surface must never include customer orders, amounts, sensitive job payloads, provider tokens or private execution receipts. The separate payments summary is governed by `home.payments.read`, and any customer-level evidence join requires a separately authorized, private server-side projection. The browser does not fetch or correlate hidden operator secrets.

## Additional operational readbacks (read-only)

- `GET /api/os/saban-snapshot` requires **existing** `home.systemia.read`. Operator may configure `EVERCRAFT_HOME_SABAN_WORK_STATE_FILE` with an absolute, permission-restricted private `.json` file (mode 0600, parent mode 0700). Readback includes sanitized totals for queued/leased/completed/dead-letter, retries and checkpoints plus a source digest and snapshot timestamp. No job IDs, customer details, role names, lease identities, result bytes, errors, paths or credentials. No file supplied means `not_configured`, not zero jobs. A source snapshot is neither a live worker connection nor an independently authenticated execution receipt. Review use of file ownership and rotation on physical nodes before installation.
- `GET /api/os/commerce` requires **existing** `home.payments.read`. It delegates exclusively to Home's existing `createExecutivePaymentsReader` with its approved private HTTPS endpoint and token, and returns only the rolling seven-day aggregate. Incomplete, absent or otherwise unverified settlement returns UNKNOWN, not 0. Even a valid provider settlement snapshot does not close the customer-delivery stage.
- The first-party One OS page queries these scoped endpoints independently. A user lacking the scope sees Restricted, not payment or worker data. No cross-tenant customer joins, authorizations, settlements or dispatches are created.

## Verify

```sh
node --test systemia/evercraft-home/os-integration.test.mjs
node --test systemia/evercraft-home/os-status.test.mjs
node --test systemia/evercraft-home/os-operational-readbacks.test.mjs
```

Only a successful CI run on this branch proves this source-level test. It does not prove a resident OS rollout.

## Cross-lane source correlation (lab-only)

`os-outcome-source-audit.mjs` is a pure, non-mutating, synthetic-testable consistency checker for a **single** commercial-outcome chain using the existing data shapes:

- Evercraft Payments' exact paid-order row fields (amount, USD, provider boundary, synthetic/livemode, refund/dispute, provider verification, timestamp). A standalone input row is not a trusted Payments response.
- Systemia's mission-admission receipt, with its existing 12-character SHA-256 structural hash and `execution_authority_granted:false`. Admission itself does not authorize dispatch.
- Execution Gate's completed lease event, with its existing SHA-256 receipt hash and outcome evidence ref. A submitted event is not proof the canonical execution ledger contains it or that a worker physically ran.
- Shipping's v2 verified-delivery receipt and v3 proof bundle, checked for structural hashes, matching package/message/receipt fields, completed sent-copy flags, and temporal ordering. The bundle is not independently refetched from the shipping provider.

Required cross-system links are the same order key in Payments and Shipping, same mission key in Systemia and Shipping, and the Execution Gate's `outcome_evidence_ref` in Shipping's recorded evidence references. Shipping's own control-tower order key is a separate namespace and must **not** be forced to match the Payments order key.

Any missing, inconsistent, tampered, sandbox, refunded, disputed, unjoined or out-of-order source evidence returns `held` with sanitized reason codes. Even all-consistent inputs return only `source_consistent_unattested`; result flags for independently authenticated payment, trusted mission/execution ledgers, shipping provider delivery, worker attestation, customer acceptance, profit and release authority remain **false**.

This audit intentionally has **no HTTP route, no browser upload, no resident file ingestion, no source authorization, and no customer-specific data in CI**. Operator-owned, authenticated, independent backend retrieval and a separately permissioned private join are the next gate before a live status screen can claim a customer outcome.

Run its tests: `node --test systemia/evercraft-home/os-outcome-source-audit.test.mjs`.

## Private owned outcome bridge (source-only readback)

`os-private-outcome-readback.mjs` adds a server-to-server private **read-only** bridge; `GET /api/os/outcome-readback` is available inside Home only after **both** existing Passport scopes, `home.payments.read` **and** `home.systemia.read`, pass, **and** the logged-in subject is the configured Evercraft owner. The local development mode is loopback-only. It does not accept a browser order ID, upload, user-selected URL, or arbitrary private job.

Configuration (no defaults; missing means `not_connected`):
- `EVERCRAFT_OS_OUTCOME_READBACK_URL`: owned HTTPS URL on the **exact** pinned `fabric.systemiacommandcenters.com` origin, under `/internal/os/outcomes/<service>`; no redirects, custom ports, query parameters or credentials.
- `EVERCRAFT_OS_OUTCOME_READBACK_TOKEN_FILE`: absolute private bearer token file.
- `EVERCRAFT_OS_OUTCOME_READBACK_SIGNING_KEY_FILE`: **separate** absolute private signing key file. Both must be regular, non-symlink files (0600), immediate parent privately owned/permissioned (0700), with bounded secret sizes. Rotate credentials through the existing private owner operations process, not source control or browser.

On each permitted GET, Home sends a single `POST` with a freshly generated 192-bit nonce, request timestamp and `max_outcomes:1` to the pinned private endpoint. The owned service is **not yet implemented or configured by this source PR**. Its expected `evercraft.os.private-outcome-source-envelope.v1` response must contain matching nonce, complete non-synthetic declaration, fresh observation (within 120 seconds), and a `hmac-sha256:` authentication tag over the unsigned serialized body using the private signing key. Home rejects HTTP errors, redirects, content types other than JSON, oversized responses (>256 KiB), HMAC tampering, stale/replayed nonce, invalid output, and untrusted credentials.

Successful HMAC verifies only possession of the configured **bridge secret**, *not* the issuer authority of any contained receipt. Home passes the bounded private source records into the existing pure structural `reconcileEvercraftOutcomeSource` checker and emits **only** sanitized `authenticated_source_consistent_unattested` or `authenticated_source_held` plus hold reason codes. It never sends customer order identifiers, raw receipts, keys, shipment data, provider IDs or personal information to the browser. Even the consistent state does not prove real payment, a true completed Saban job, verified Shipping provider readback, net margin, replay safety, or customer acceptance. Home's overall status must remain held. **No merchant, systemia, worker, shipping, or deployment action takes place.**

Source proof command: `node --test systemia/evercraft-home/os-private-outcome-readback.test.mjs`. It exercises synthetic owned-origin HTTP, valid and invalid HMAC, nonce mismatch, oversized/stale/unconfigured data, no identifier disclosure, and local scoped HTTP projection. Deployment of any actual resident upstream remains a separately authorized source/field project.

## Owned Fabric endpoint: server-side half of the bridge

`systemia/mcp/fabric-private-outcome-readback.mjs` is now loaded by the existing `startFabricLocalRuntime` (not a separate host or product). Its precise private route is `POST /internal/os/outcomes/latest`, handled **ahead of public OPTIONS and MCP**. The runtime has no explicit CORS allow-origin for this route and rejects browser Origin/Fetch Metadata, GET, OPTIONS, bad authorization, malformed request, stale timestamp, and duplicate recent nonce. It uses a constant-time bearer token comparison, separate private signing key, and request-/response-size limits.

Fabric configuration:
- `EVERCRAFT_FABRIC_OUTCOME_READBACK_TOKEN_FILE`: server-owned 0600 private bearer token.
- `EVERCRAFT_FABRIC_OUTCOME_READBACK_SIGNING_KEY_FILE`: *different* server-owned 0600 HMAC key.
- `outcomeReadbackRecordLoader` is intentionally **NOT** supplied by the default runtime; a trusted, authoritatively scoped loader must be integrated by existing Payments/Systemia/Saban/Shipping owners after verifying their ledgers and provider evidence. No generic browser upload, generated test fixture, configuration-only JSON file, or unauthenticated "paid" flag may count as such a loader.

Without an actual canonical source loader, the private route returns **503**, even if credentials exist. When an approved loader is injected in local tests, the runtime source-checks the exact receipt shapes before signing an HMAC envelope, including a nonce and fresh server timestamp. It is deliberately **source-only**, not trusted supplier verification. The Home client independently recomputes the source correlation and refuses any independent customer-fulfillment claim.

Run `node --test tests/fabric-private-outcome-readback.test.mjs` to prove the actual Fabric HTTP server and Home HTTP server can exchange an authenticated signed, redacted result in one local integration test. All order, payment, mission and Shipping records in this test are synthetic. **CI passing does not mean the real source loader exists, a paying buyer was observed, or either resident runtime was deployed.**

## Local Execution Gate + Shipping ledger witness

Fabric's private endpoint now additionally requires `fabric-outcome-ledger-witness.mjs` to match **two persisted private stores** before it signs even an *unattested* source bundle:

- `EVERCRAFT_FABRIC_OUTCOME_EXECUTION_EVENTS_FILE`: the **actual** Execution Gate `execution-lease-events.jsonl`, with a current, hash-consistent completed event matching the supplied lease/receipt/outcome reference; a later canceled/failed/altered event holds the outcome
- `EVERCRAFT_FABRIC_OUTCOME_SHIPPING_LEDGER_FILE`: the **actual** Shipping `shipping-ledger.json`, with a uniquely matched verified-delivered shipment, original send authorization, accepted provider message, verified sent-copy recipient/subject/attachments, exact package digest, exact shipment idempotency key, and matching delivery receipt/proof fields

Both are absolute, non-symlinked, privately permissioned regular files (0600) under private immediate directories (0700), limited to 8 MiB. Missing, truncated, world-readable, structurally contradictory, duplicate or updated-to-noncompleted records return **503** with no private IDs. The witness performs no writes or provider calls. It is **not** an independent issuer signature and does not establish source authenticity outside the local owner's machine. Real Payments provider settlement, canonical Systemia mission persistence, Saban worker attestation, QA, and external Shipping provider confirmation remain unconnected and unverified. These two local ledgers are deliberately necessary but insufficient gates.

CI tests simulate *private persisted* Execution Gate and Shipping state, not production data. The production Fabric readback record loader remains `null`; configuring the two paths alone cannot enable a customer success claim.

## Next vertical integration

Reuse Issue #1546 and existing Saban, Payments and Shipping implementation owners. Build an authenticated, permission-scoped canonical receipt reader (the source-only structural audit above does **not** satisfy this) joining:

`offer_key -> order_key -> provider receipt -> mission_key -> authorized attempt -> worker/QA receipt -> delivery receipt -> margin/refund`.

Every join must verify type, issuer, matching stable identifiers, freshness, replay/fencing semantics and independent authority before changing a stage to externally verified. Use controlled failure tests, then an owner-authorized physical-node and customer canary. Never give `home.read` access to private transactional data and never treat a future join as a trigger to spend/publish.
