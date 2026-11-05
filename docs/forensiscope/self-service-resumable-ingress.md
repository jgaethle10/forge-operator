# ForensiScope self-service upload, owned-only staging

**Release state: PRIVATE / local-test only. No public upload DNS route, paid checkout or automatic result delivery is claimed.**

The service is implemented in `systemia/forensiscope/resumable-ingress.mjs`.
Its browser client is `public/forensiscope/self-service/uploader.mjs`.
Neither file is wired into the public customer preview. No API token is
hardcoded or passed through a query string. The public preview remains a
local-file duration/price checker, not an upload or purchase experience.

## Required application-owned callbacks

A trusted local server constructs `createForensiScopeResumableIngress` using:

- `storageDir`: absolute path to private durable Evercraft-controlled storage
  with mode 0700 directories and 0600 files.
- `authorizeBuyer(req)`: authenticate a real signed customer session and
  return `{subject}`. Never derive identity from a JSON body, filename,
  unverified email, or an unauthenticated HTTP header.
- `resolveOrder(orderKey,subject)`: return a **server-owned** persisted
  `{subject,quote,checkoutAdmission}` record matching this customer.
  Never accept `quote`, `checkoutAdmission` or a client-supplied `paid` flag.
- `verifyPaidOrder(orderKey)`: trusted Evercraft Payments/Raven Nexus
  provider and settlement readback. Exact order, SKU, USD amount and receipt
  are verified by `evaluateForensiScopePaidUpload`. Checkout redirect
  parameters and simulated payment objects have no authority.
- `allowedOrigins`: explicit owned HTTPS browser origins.

This module exports a Node HTTP request handler, **not a publicly running
server**. The deployment layer must bind it to loopback behind owned
authenticated HTTPS (or equivalent private service-to-service transport).
Do not bind it to 0.0.0.0, publish DNS, or enable client upload without
validating TLS, end-to-end identity, processing capacity, and privacy review.

## API, all require authenticated buyer except GET /health

| Method | Route | Meaning |
| --- | --- | --- |
| POST | /v1/forensiscope/uploads | Start/recover verified paid-order session; JSON `order_key`, `file_size_bytes`, `media_extension` |
| GET | /v1/forensiscope/uploads/:id | Authenticated resume status and received chunk indexes |
| PUT | /v1/forensiscope/uploads/:id/chunks/:index | Bounded octet-stream chunk, required `Content-Length` and `x-chunk-sha256` |
| POST | /v1/forensiscope/uploads/:id/complete | Reverify settlement, assemble file and issue exact SHA-256 source receipt |
| DELETE | /v1/forensiscope/uploads/:id | Remove session and stored media, even after expiry |

The browser helper uses `File.slice()`, SHA-256 of each bounded chunk
and an in-memory auth token. It never sends a full media buffer in one
request and never stores raw file bytes, buyer credentials or session
tokens in localStorage. The server's persisted session indexes permit a
client restart to resume the same purchased order. The server assembles
the chunks into a private source file and records an SHA-256 checksum.
`uploadedSourceForWorker` is a **private owner-side method** for later
Saban ingestion; it is deliberately absent from HTTP responses.

A successful upload is `uploaded_unprocessed`. It **does not** mark a
video processed, produce a transcript, reserve capacity for another
job, create a new checkout, or publish a private result. Those separate
workflows must verify the upload receipt and their own authorities.

## Safety and retention

- No anonymous, wrong-buyer, unpaid or forged-redirection upload.
- No private filename or raw media in API errors; no arbitrary file paths.
- No chunk/index path traversal; single writer per session.
- Chunk-level hash verification, byte limits, idempotent replay and
  exact assembled source digest.
- Strict origin allowlist on browser requests; explicit buyer auth for
  every upload and read.
- Paid provider readback at both session admission and final commit.
- Default expiration after 24 hours with `purgeExpiredSessions()` for
  operational cleanup; buyer deletion is available even after expiration.
- Do not claim secure deletion from device storage; deletion covers only
  this ingress store. Any separately processed derivatives require an
  explicit retention/deletion policy.

## Next production gates

1. An actual owner-verified session/OAuth endpoint for phone and desktop
   clients, with revocation and rate limiting, and an owned authenticated
   TLS route from the Pages buyer interface.
2. Exact ForensiScope SKU checkout from Evercraft Payments, real provider
   readback, checkout capacity reservation and customer-entitlement store.
3. Real ffprobe/codec/security validation, malicious-file isolation,
   per-customer storage quotas and durable queue admission before checkout.
4. Saban processing keyed by the upload order and SHA-256 source receipt,
   retry/failed-job state, job progress and compute cost/timeout limits.
5. Private download/view via scoped expiring grants, customer-visible
   deletion/retention, incident auditing and a complete real-device canary.

Run local proof with `node --test tests/forensiscope-resumable-ingress.test.mjs`.
Tests use synthetic local order/payment readbacks solely to exercise rejection
and upload mechanics. They **do not verify a real payment provider**.
