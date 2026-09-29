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
10. the fragment bootstrap claim is single-use and rotates into a separate access credential;
11. the public edge keeps ongoing access in an HttpOnly, Secure, SameSite=Strict cookie rather than page-readable storage;
12. Control Room state-changing requests require the same-origin control header in addition to the host-only cookie;
13. claim tokens, ongoing access credentials and typed credential text do not appear in receipts or persistent state;
14. a real human-login canary confirms the handoff page works through the verified public edge before authenticated browsing is advertised as production-live.

## Authenticated human handoff

Source now includes an **ephemeral, human-authorized authenticated browser handoff**. It is deliberately separate from the public read-only browser mode.

The flow is:

1. Systemia/Yard creates an authenticated browser session through the private Compute lease.
2. The worker returns a short-lived handoff path carrying a bootstrap claim in the URL fragment. The fragment is never sent on the initial HTTP request and Control Room immediately scrubs it from the visible URL.
3. Control Room redeems that bootstrap claim once. The worker invalidates it and mints a distinct session access credential.
4. The public edge removes the ongoing access credential from the JSON response and stores it only in an HttpOnly, Secure, SameSite=Strict cookie scoped to that exact session API path.
5. Refreshing the Control Room page can resume an unexpired session from the HttpOnly cookie without re-exposing the original claim.
6. The human clicks/types directly into the isolated browser session. The secure relay input disables password-manager/autofill hints so credentials are not accidentally saved against the Control Room origin.
7. Typed text is never returned in action receipts. The worker records only bounded metadata such as action type and character count.
8. Cookies and authenticated state for the destination site live only inside the isolated in-memory Chromium context for the session lifetime.
9. Closing or expiring the session destroys the context. v1 does not persist an authenticated browser profile.

The human handoff supports screenshot refresh, coordinate clicks, typing into the focused browser field, bounded key presses, scrolling, waiting and validated public-URL navigation. Private/reserved network targets remain blocked. Downloads and service workers remain blocked.

This source capability is **not production-live merely because it exists**. A public handoff URL must not be represented as available until the Yard deployment has a verified public route and an external authenticated-handoff canary has passed.
