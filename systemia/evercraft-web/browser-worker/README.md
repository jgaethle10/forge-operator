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

## Promotion gate

Do not mark `evercraft.web.browser.public.v1` active until all are true:

1. container build is green;
2. worker is deployed on Yard/Evercraft Compute;
3. gateway-to-worker token/lease path is configured;
4. public render canary returns real JavaScript-rendered evidence;
5. private/local target attempts are rejected;
6. non-GET side effects are blocked;
7. evidence receipt hashes verify;
8. MCP/agent discovery only advertises the browser tool after the production canary passes.

Authenticated browsing is a separate capability and is not implemented by this worker.
