# Evercraft Relay / Systemia Notification Fabric

Evercraft Relay is the shared delivery control plane for the Evercraft ecosystem. Products emit one normalized intent. Relay decides how to reach the right principal with the least unnecessary interruption while preserving durable continuity and evidence.

A product should never need to know whether the human is currently connected through Evercraft realtime, offline behind Web Push, inside quiet hours, over an attention budget, or awaiting acknowledgement. Those decisions belong here.

## Routing model

```text
Product / Systemia event
        |
        v
Normalized intent
        |
        +--> consent + targeting + dedupe
        |
        +--> durable inbox
        |
        +--> owned realtime presence
        |
        +--> quiet-hours + attention policy
        |
        +--> Web Push fallback / critical fanout
        |
        v
hash-chained receipts -> seen -> acknowledged
```

Operational events first pass through Systemia Signal Fabric, which determines severity, evidence state, dedupe, recovery coalescing, and critical notification budgets. Relay then handles human delivery.

### Core policy

- Normal traffic prefers the least disruptive route.
- If a principal is actively connected to Relay, ordinary OS push is suppressed and the notification arrives through realtime plus the durable inbox.
- If the principal is offline, Web Push becomes the fallback.
- Quiet hours keep noncritical traffic in the inbox.
- Per-principal attention budgets prevent ordinary notification storms.
- Safety and critical traffic bypass quiet hours and attention budgets and deliberately fan out across available channels.
- A push gateway acceptance is recorded only as gateway acceptance. It is never mislabeled as human delivery.
- Human `seen` and `acknowledged` are separate receipts.

## Trust model

Relay receipts form a chained ledger. Set `EVERCRAFT_NOTIFICATION_RECEIPT_SECRET` to use HMAC-SHA256 receipt hashes. This makes unauthorized receipt rewriting detectable as long as the secret remains outside the state store. Without the secret, Relay falls back to an unkeyed SHA-256 chain for corruption detection.

Browser-facing access uses short-lived scoped Relay sessions rather than the global enrollment or ingest secret. Session claims bind a principal to explicit permissions, audiences, products, issuance time, expiry, and a unique token ID.

The global ingest token remains server-only.

## Transports

### Owned realtime

Relay exposes an authenticated Server-Sent Events stream at `/api/notifications/stream`. It is the preferred delivery route while an Evercraft surface is open. Realtime presence can be matched by principal, audience, and product.

### Durable inbox

Every targeted principal receives a durable inbox entry before transient delivery paths are attempted. This keeps continuity even when a browser, device, or external push gateway is unavailable.

### Web Push

The first offline transport is standards-based Web Push using VAPID and RFC 8291 payload encryption. Web Push endpoints must use HTTPS. Dead endpoints returning `404` or `410` are disabled automatically. Transient network, `429`, and `5xx` failures receive bounded retries.

Browser vendors still operate the final Web Push gateway required by the platform. Evercraft owns the event model, routing, policy, targeting, consent, retries, inbox, realtime transport, receipts, and audit state.

Native APNs and Android delivery remain adapter targets behind the same intent contract. They are not separate notification systems.

## Environment

Generate VAPID keys:

```bash
node systemia/notification-fabric/generate-vapid-keys.mjs
```

Runtime configuration:

```text
EVERCRAFT_VAPID_PUBLIC_KEY=...
EVERCRAFT_VAPID_PRIVATE_KEY=...
EVERCRAFT_VAPID_SUBJECT=mailto:ops@your-domain.example

EVERCRAFT_NOTIFICATION_INGEST_TOKEN=...
EVERCRAFT_NOTIFICATION_ENROLL_TOKEN=...
EVERCRAFT_NOTIFICATION_SESSION_SECRET=<32+ byte secret>
EVERCRAFT_NOTIFICATION_RECEIPT_SECRET=<strong independent secret>

EVERCRAFT_NOTIFICATION_ALLOWED_ORIGINS=https://app1.example,https://app2.example
EVERCRAFT_NOTIFICATION_DATA_DIR=/durable/private/path/notifications
EVERCRAFT_NOTIFICATION_PUSH_ATTEMPTS=3
```

Never expose the VAPID private key, ingest token, enrollment token, session secret, or receipt secret to browser code.

## Durable delivery and recovery

For work that must survive a process crash, use the durable job path instead of direct synchronous delivery.

```text
product event
   |
   v
durable outbox commit  ->  202 Accepted + job id
   |
   v
leased Relay worker
   |
   +--> delivery succeeds -> completed
   |
   +--> transient failure -> exponential retry
   |
   +--> worker dies -> lease expires -> another worker recovers job
   |
   +--> attempts exhausted -> dead letter
```

Producer retries are deduplicated with an `Idempotency-Key`. Each job preserves a stable logical notification ID across worker retries. Web Push attempts also carry a stable Topic derived from that ID so compatible push services can collapse still-pending duplicate attempts.

Critical intents may opt into acknowledgement enforcement:

```json
{
  "acknowledgement": {
    "required": true,
    "mode": "any",
    "within_seconds": 300,
    "max_escalations": 2,
    "escalation_interval_seconds": 300,
    "title_prefix": "STILL UNACKNOWLEDGED"
  }
}
```

Relay schedules a durable acknowledgement watch after successful delivery. If the original notification is not acknowledged by policy, Relay emits a critical escalation and can repeat that escalation within the bounded ladder. Acknowledging the original event terminates subsequent escalation.

The filesystem outbox is restart-safe for the current single-node Forge/Yard runtime. It deliberately does not claim multi-process consensus. Before running multiple active Relay replicas, the outbox, leases, inbox, attention budgets, receipt sequencing and idempotency index must move behind one shared transactional store.

## API

Public configuration and health:

- `GET /api/notifications/health`
- `GET /api/notifications/config`

Server-to-server, ingest token required:

- `POST /api/notifications/jobs` durable intent enqueue, preferred for production workflows
- `POST /api/notifications/signal-jobs` durable Signal Fabric enqueue
- `GET /api/notifications/jobs/:id` job state without returning the queued payload
- `POST /api/notifications/worker/run` bounded manual worker cycle for operations/testing
- `POST /api/notifications/intents` direct synchronous delivery, retained for compatibility and low-risk paths
- `POST /api/notifications/signals`
- `POST /api/notifications/session-tokens`
- `GET /api/notifications/metrics`

Browser/device session:

- `POST /api/notifications/subscriptions` using a scoped `subscribe` session or the legacy enrollment token
- `DELETE /api/notifications/subscriptions/:id`
- `GET /api/notifications/stream` with `stream` permission
- `GET /api/notifications/inbox` with `inbox` permission
- `POST /api/notifications/inbox/:id/seen`
- `POST /api/notifications/inbox/:id/ack` with `ack` permission

## Intent contract

```json
{
  "schema": "systemia.notification.intent.v2",
  "product": "rivet",
  "purpose": "transactional",
  "priority": "normal",
  "title": "Your RIVET report is ready",
  "body": "Tap to open the completed site opportunity report.",
  "recipient_ids": ["user_123"],
  "url": "/rivet/reports/abc",
  "dedupe_key": "report:abc:ready",
  "dedupe_window_seconds": 3600
}
```

Purposes are `transactional`, `operational`, `safety`, `reminder`, and `marketing`. Marketing requires `consent_basis: "explicit_opt_in"` and an opted-in subscription.

Machine-readable contracts live in `intent.schema.json`, `receipt.schema.json`, and `job.schema.json`.

## Browser adoption

Each Evercraft web product serves `public/evercraft-push-sw.js` from its own origin and uses `browser-client.ts`.

The product backend authenticates its user, then uses `client.mjs` to mint a short-lived Relay session:

```js
const session = await relay.issueSession({
  principal_id: user.id,
  permissions: ['subscribe', 'stream', 'inbox', 'ack'],
  audiences: ['company-ops'],
  products: ['rivet']
});
```

The browser can then register Web Push, connect to the owned realtime stream, read its inbox, and acknowledge notifications without ever receiving a global infrastructure secret.

## Server-side adoption

Node services use `systemia/notification-fabric/client.mjs`:

- `client.enqueue(intent, { idempotencyKey })` preferred durable production path
- `client.enqueueSignal(signal, { idempotencyKey })`
- `client.notify(intent)` synchronous compatibility path
- `client.signal(signal)`
- `client.issueSession(claims)`

Products continue to emit the same intent contract as transports evolve.

## Persistence boundary

The default store is a durable single-node adapter suitable for the current Forge runtime. Before Relay runs as multiple active replicas, subscription state, inboxes, attention budgets, dedupe state, and receipt sequencing must move to a shared transactional store so replicas cannot race. The store interface is intentionally replaceable.

## Verification

Relay has a dedicated GitHub Actions gate in `.github/workflows/notification-fabric.yml`. The workflow runs the focused notification suite and syntax-checks all runtime modules whenever Relay or Signal Fabric changes.


## Worker configuration

```text
EVERCRAFT_NOTIFICATION_WORKER_ENABLED=true
EVERCRAFT_NOTIFICATION_WORKER_ID=<optional stable node label>
EVERCRAFT_NOTIFICATION_WORKER_INTERVAL_MS=1000
EVERCRAFT_NOTIFICATION_WORKER_LEASE_MS=30000
EVERCRAFT_NOTIFICATION_WORKER_BATCH_SIZE=10
```

The resident worker timer is unreferenced so it does not prevent clean process shutdown. Operators can disable the resident worker and run an isolated worker process later without changing product contracts.
