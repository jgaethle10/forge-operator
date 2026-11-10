# ForensiScope: One owned customer runtime

State: PRIVATE LOOPBACK INTEGRATION. Not a deployed public ForensiScope customer purchase service.

The module systemia/forensiscope/customer-runtime.mjs composes the
existing owned ForensiScope quote/admission, resumable ingress, durable
private jobs, and automatically polled worker on one local origin.

All customer API paths share a single private listener:
- POST /v1/forensiscope/quote: server-side quote and capability preflight, not checkout
- POST /v1/forensiscope/uploads: paid, authenticated chunked upload
- GET /v1/forensiscope/uploads/:id: resume receipt
- PUT /v1/forensiscope/uploads/:id/chunks/:index: private binary transfer
- POST /v1/forensiscope/uploads/:id/complete: final source hash receipt
- POST /v1/forensiscope/jobs: enqueue verified paid upload
- GET /v1/forensiscope/jobs/:id: status
- GET /v1/forensiscope/jobs/:id/result: buyer-scoped report
- DELETE /v1/forensiscope/jobs/:id: owner-requested job data deletion
- GET /v1/forensiscope/health: reports loopback-only staging and public payment hold

A caller instantiates createForensiScopeCustomerRuntime with the
private absolute storage root and trusted implementations of:
authorizeBuyer, resolveOrder, verifyPaidOrder, verifyResultAccess,
readCapacity, and optionally processRecording. The factory rejects
missing trust adapters. None of these fields may be controlled by
anonymous buyer requests. There is no default customer account,
provider receipt, mock checkout, or automatically invented token.

Call runtime.start({host:'127.0.0.1',port:0}) from an approved owned
resident supervisor. It binds loopback ONLY and starts a private
automatic worker; no human must press Run for each admitted paid job.
The worker uses the existing transcription backend by default, which
must be configured with a real engine and ffmpeg/ffprobe on the host.
The service will NOT advertise a success when processing fails.
Call runtime.stop() at shutdown to stop the worker and close the listener.

The preflight accepts only extension, size, duration and explicit media
rights attestation. It returns published tier pricing plus actual trusted
capacity gate flags. Even a positive capacity gate has checkout_url=null
and upload_url=null. A quote is never a charged order and does not
prove the actual file format/codec. Production per-file validation,
malware screening, quotas and capacity reservation remain mandatory.

Security: never publish this service directly. Bind only 127.0.0.1,
localhost, or ::1. An owned HTTPS reverse proxy is allowed ONLY
after an independent live TLS and authentication canary, payment
receipt readback, cross-user privacy testing, real buyer session
verification, and upload malware/codec/resource-pressure tests.
No third-party app-builder runtime or Base44 dependency is needed.

This integrated runtime DOES NOT YET provide:
- Real customer registration/login/passwordless account
- ForensiScope-specific Evercraft Payments SKU checkout
- Live provider/ledger settlement proof and Webhook reconciliation
- Owned HTTPS media ingress and production disk capacity control
- Durable multi-process worker leasing, crash recovery and retries
- Wired video duplicate analysis for customer reports
- Scalable report pagination and secure share/download links
- Verified live mobile payment-to-results execution

Run the local proof via:
node --test tests/forensiscope-customer-runtime.test.mjs

Test payment and processing callbacks are synthetic fixtures inside
tests only, not runnable public merchant integrations. A successful
integration test is NOT evidence of paid user orders or production uptime.
