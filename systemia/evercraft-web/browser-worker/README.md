# Evercraft Owned Browser Worker v1

This is the shared rendered-public-web kernel for Evercraft Web and future Raven Nexus visual lanes.

## Current truth boundary

Source exists and can be built as a standalone Playwright/Chromium worker. It is **not production-live merely because this code exists**. Evercraft Web's public Browser capability remains held until a Yard/Evercraft Compute deployment is reachable from the gateway and an independent end-to-end canary passes.

## Public mode

`POST /v1/browse` runs one fresh Chromium context per job.

Required header:

`Authorization: Bearer $EVERCRAFT_BROWSER_WORKER_TOKEN`

Supported bounded actions:

- `wait`
- `wait_for_selector`
- `scroll`
- `follow_anchor` (reads an anchor href, validates it, then performs a GET navigation; it does not click arbitrary controls)

Public-mode controls:

- public HTTP(S) targets only
- DNS/IP validation for the initial target and every browser network request
- Chromium is forced through an Evercraft-owned loopback outbound proxy that resolves, validates, then connects to the exact vetted public IP, closing the DNS-rebinding/TOCTOU gap
- destination ports are limited to 80/443
- blocks loopback, private, link-local, carrier-grade NAT, documentation, multicast and reserved targets
- strips outbound Cookie and Authorization headers
- fresh browser context per job
- GET/HEAD/OPTIONS only
- blocks service workers, downloads, WebSockets when the Playwright runtime exposes routeWebSocket, form-submit actions and arbitrary clicks
- bounded viewport, body size, actions, timeout and extracted text
- optional viewport screenshot with SHA-256 receipt
- evidence receipt SHA-256 for every completed run

## Local

```bash
cd systemia/evercraft-web/browser-worker
npm install
npm test
EVERCRAFT_BROWSER_WORKER_TOKEN=dev-only node server.mjs
```

Health:

```bash
curl http://127.0.0.1:8787/healthz
```

A deployment must keep the worker behind the Evercraft gateway/control plane. Do not expose the bearer token to end users or LLM clients.

## Yard / Evercraft Compute integration

The candidate branch registers `systemia.evercraft-web-browser.v1` as a resident Evercraft Compute workload. Yard deploys it through a private compute lease, verifies worker health, binds the deployment receipt, and invokes browser jobs through the compute service route rather than exposing the worker directly. `proof:evercraft-browser-yard` verifies the lease, health, receipt, invoke, private-target rejection, and stop lifecycle using an injected worker runtime. The real Docker/Chromium runtime still requires the production deployment canary before promotion.

## Promotion gate

Do not mark `evercraft.web.browser.public.v1` active until all are true:

1. container build is green;
2. worker is deployed on Yard/Evercraft Compute;
3. gateway-to-worker token/lease path is configured;
4. public render canary returns real JavaScript-rendered evidence;
5. private/local target attempts are rejected;
6. non-GET side effects are blocked;
7. evidence receipt hashes verify;
8. MCP/agent discovery only advertises the browser tool after the production canary passes;
9. authenticated handoff creation crosses the private Yard lease rather than a public unauthenticated create endpoint;
10. claim tokens and typed credential text do not appear in receipts or persistent state;
11. a real human-login canary confirms the handoff page works through the verified public edge before authenticated browsing is advertised as production-live.

## Authenticated human handoff

Source now includes an **ephemeral, human-authorized authenticated browser handoff**. It is deliberately separate from the public read-only browser mode.

The flow is:

1. Systemia/Yard creates an authenticated browser session through the private Compute lease.
2. The worker returns a short-lived handoff path carrying a one-time claim in the URL fragment.
3. The human opens the Evercraft handoff page and clicks/types directly into the isolated browser session.
4. Typed text is never returned in action receipts. The worker records only bounded metadata such as action type and character count.
5. Cookies and authenticated browser state live only inside that isolated in-memory browser context for the session lifetime.
6. Closing or expiring the session destroys the context. v1 does not persist an authenticated profile.

The human handoff supports screenshot refresh, coordinate clicks, typing into the focused browser field, bounded key presses, scrolling, waiting and validated public-URL navigation. Private/reserved network targets remain blocked. Downloads and service workers remain blocked.

This source capability is **not production-live merely because it exists**. A public handoff URL must not be represented as available until the Yard deployment has a verified public route and an external authenticated-handoff canary has passed.

## Human-granted Systemia delegation

Authenticated handoff can now grant a short-lived **competition draft automation** lease after the human has logged in. The claim token remains on the human side. The agent/operator does not receive it.

The delegated path is intentionally split:

- public edge: human can grant or revoke delegation using the human claim;
- private Yard/Compute lease: Systemia can request delegated snapshots and bounded actions after delegation exists;
- same-origin only in v1;
- draft field filling and explicit Save Draft actions only;
- no new terms acceptance, registration/join attestation, final submission, payments, staking, account-security changes, password/secret entry, MFA/OTP, or CAPTCHA authority;
- delegation is in-memory, expires with the session, and does not persist an authenticated profile.

This removes repetitive competition-form work without treating authentication as blanket legal authority.

The delegation source and tests are still **candidate capability**, not proof of a production-authenticated provider session. Promotion requires the existing verified public handoff gate plus an external canary that demonstrates human login, human grant, private Yard delegated action, rejection of a prohibited action, revoke, and session destruction.


## Candidate durable read-only jobs (not production-promoted)

The worker now includes an optional, single-owner filesystem-backed asynchronous job ledger. It is off by default. Enable only with a private persistent disk or volume mounted writable by the worker user:

    EVERCRAFT_BROWSER_JOB_STATE_DIR=/var/lib/evercraft-browser-jobs

The worker's existing private bearer token is required on every job operation:

- POST /v1/jobs: create a bounded public read-only job (202); retries use the same idempotency_key (200).
- GET /v1/jobs/:id: inspect status, failure category and bounded completion receipt.
- DELETE /v1/jobs/:id: cancel an active or pending job.

Example body (send only through Systemia's authorized private Yard/Compute lease):

    {"idempotency_key":"mission-001-page-001","mission_key":"systemia-browser-mission-001","work_key":"browser-work-001","job":{"url":"https://example.com/","include_screenshot":true,"actions":[{"type":"wait_for_selector","selector":"h1"}]}}

Privacy/recovery boundaries:

- Persisted jobs are public read-only; there is no authenticated-session replay. URLs containing query strings, fragments, or embedded credentials are rejected rather than persisted.
- Persisted completion results contain evidence hashes, safe URL and title, not page body, screenshot bytes, cookies, Authorization headers or browser profile state.
- Per-job idempotency keys bind to payload and Systemia lineage; duplicate keys with different requests fail closed.
- Atomic 0600 file writes, directory fsync, bounded retries and startup requeue for interrupted jobs are implemented. Jobs with exhausted attempts become terminal failures.
- Cancellation aborts the browser context, and a late completion may not overwrite a cancelled record.
- Single process per directory only. This version does not implement a distributed lease, encrypted credential vault, or signed Systemia admission.
- A durable volume is mandatory for real restart persistence. Ephemeral container storage is not crash-survivable.
- durable-jobs.test.mjs covers idempotency, cancellation, redaction, retry and simulated crash recovery. durable-jobs.proof.mjs is a real-browser canary for an authorized public page, intended for execution in Docker/CI with a writable durable volume. A source file is not a passing canary.

Known integration gate: Systemia's current browserWorkerOps expects /v1/run and x-evercraft-key with a distinct action/snapshot schema; this worker's read-only endpoint is /v1/browse with a bearer token. A signed, versioned Yard/Compute transport adapter and confirmed runtime configuration are required before advertising end-to-end readiness. Do not silently alias these contracts or treat a static configuration value as runtime proof.
