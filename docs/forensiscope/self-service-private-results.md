# ForensiScope private customer jobs and result delivery

State: **owner-only local integration proof**. This code does not publish
a customer endpoint, accept public money, or imply automatic fulfillment.

The private resumable-ingress service hands off only a verified
uploaded_unprocessed source. The new private-job-service module creates
a durable customer-bound job, copies the source into its own private
storage, validates its SHA-256 digest, and exposes authenticated
customer status and private report readback.

## Server-owned dependencies

A host constructs createForensiScopePrivateJobs with:
- an absolute private storage root;
- a trusted uploadService.uploadedSourceForWorker instance;
- authorizeBuyer(req), from validated customer authentication;
- resolveOrder(orderKey,subject), from the canonical Evercraft order ledger;
- verifyPaidOrder(orderKey), using authoritative Evercraft Payments
  and Raven Nexus provider settlement readback;
- verifyResultAccess({subject,orderKey,jobId}), from the private
  customer entitlement/grant service;
- an optional processRecording worker. The default
  processForensiScopePrivateRecording uses the existing
  processMeetingBatch with installed ffmpeg/ffprobe and a configured
  real transcription engine, and fails if unavailable. Its duplicate
  review section explicitly says not_run until duplicate processing is
  independently wired in.

## Customer API

| Method | Path | Behavior |
| --- | --- | --- |
| POST | /v1/forensiscope/jobs | Create/reuse a paid order job from an upload_id. Does NOT run the worker. |
| GET | /v1/forensiscope/jobs/:id | View private state: queued, processing, completed or failed. |
| GET | /v1/forensiscope/jobs/:id/result | Read checked report after provider re-verification and valid scoped, expiring customer grant. |
| DELETE | /v1/forensiscope/jobs/:id | Delete private source/report/job, except when actively processing. |

There is no public run route, anonymous result, raw source_path
in API responses, or browser-controlled arbitrary worker execution.
A private owned supervised worker may call jobs.runOne({jobId}) to
perform processing. The staged startForensiScopePrivateWorker helper
polls the queue and picks up paid jobs automatically when started by
an owner-controlled resident supervisor. The worker is not exposed to
the customer API. Jobs will not execute unless that owned supervisor
actually starts and keeps the worker running.

## Evidence and privacy boundaries

- Job creation requires fresh paid readback plus a customer-owned upload.
- Enqueue is idempotent per paid order and media SHA-256.
- A worker never trusts the browser's source hash: the copied file is
  hashed again before processing.
- The report is stored in private files and restricted to explicitly
  allowed fields, with size/segment caps. Worker-internal paths and
  authentication objects cannot reach customer responses through
  those projected fields.
- Stored report bytes are hashed and verified before buyer release.
- Result release requires unrevoked payment and an unexpired
  customer-specific private_result_read grant.
- No invented duplicate findings, transcription success, public URL
  or guaranteed delivery. Failure appears as a generic code.
- Buyer deletion and purgeExpiredJobs remove this job store, with
  seven-day default retention. The separate upload must also be
  removed through its service; this is not an all-provider deletion claim.

## Remaining production gates

1. Owned TLS/API route and real buyer authentication.
2. Exact ForensiScope Evercraft Payments checkout and settlement readback.
3. Saban worker scheduler with ASR, duplicate review, quotas,
   cancellation and interrupted-job recovery.
4. Multi-process transactional locking and streaming/paginated large reports.
5. Private access grants, retention/deletion review, and actual device
   checkout → upload → processing → report acceptance proof.

Test locally with:
node --test tests/forensiscope-private-job-service.test.mjs

The test suite uses synthetic payment/readback and a synthetic
processing callback to prove the private job lifecycle. That does
not verify a real customer payment or production transcription.
