# Systemia Notification Fabric

Systemia Notification Fabric is Evercraft's shared notification delivery plane. Products do not each invent their own push stack. They emit either a normalized notification intent or an operational Signal Fabric event and this service handles targeting, consent, deduplication, delivery, dead-endpoint cleanup, and receipts.

## Architecture

`Product event -> Notification Intent -> policy/consent/targeting -> transport -> receipt ledger`

`Operational event -> Signal Fabric -> severity/dedupe/budget -> Notification Fabric -> operator devices`

The transport boundary is intentionally replaceable. The first transport is standards-based Web Push using VAPID and RFC 8291 payload encryption. Evercraft owns routing, subscriptions, preferences, policy, payloads, receipts, and event history. Browser vendors still operate the last-mile push gateway required by the Web Push platform. Native APNs and Android transports can be added behind the same adapter contract without changing product code.

## Security defaults

- Server-to-server notification ingestion is closed unless `EVERCRAFT_NOTIFICATION_INGEST_TOKEN` is configured.
- Device enrollment is closed unless `EVERCRAFT_NOTIFICATION_ENROLL_TOKEN` is configured.
- Cross-origin browser access is denied unless the exact origin is listed in `EVERCRAFT_NOTIFICATION_ALLOWED_ORIGINS`.
- Push endpoints must use HTTPS.
- Subscription files are written with owner-only filesystem permissions where supported.
- Marketing notifications require explicit opt-in and are disabled by default on every subscription.
- Dead Web Push endpoints (`404`/`410`) are disabled automatically.
- Transient network, `429`, and `5xx` failures receive bounded retries with short capped backoff.
- Product events carry a dedupe key/window so retries do not become notification storms.
- Operational critical alerts inherit Signal Fabric evidence, recovery, dedupe, and hourly budget rules.

## Environment

Generate a VAPID key pair with:

```bash
node systemia/notification-fabric/generate-vapid-keys.mjs
```

Configure the runtime:

```text
EVERCRAFT_VAPID_PUBLIC_KEY=...
EVERCRAFT_VAPID_PRIVATE_KEY=...
EVERCRAFT_VAPID_SUBJECT=mailto:ops@your-domain.example
EVERCRAFT_NOTIFICATION_INGEST_TOKEN=...
EVERCRAFT_NOTIFICATION_ENROLL_TOKEN=...
EVERCRAFT_NOTIFICATION_ALLOWED_ORIGINS=https://app1.example,https://app2.example
EVERCRAFT_NOTIFICATION_DATA_DIR=/durable/private/path/notifications
EVERCRAFT_NOTIFICATION_PUSH_ATTEMPTS=3
```

Never put the private VAPID key or either bearer token in browser code.

## API

- `GET /api/notifications/health` returns transport readiness without secrets.
- `GET /api/notifications/config` returns the public VAPID key for browser subscription.
- `POST /api/notifications/subscriptions` registers or refreshes a browser subscription. Enrollment bearer token required.
- `DELETE /api/notifications/subscriptions/:id` removes a subscription. Enrollment bearer token required.
- `POST /api/notifications/intents` delivers product/user notifications. Ingest bearer token required.
- `POST /api/notifications/signals` sends an operational event through Signal Fabric and only pages when policy permits. Ingest bearer token required.

## Intent contract

```json
{
  "schema": "systemia.notification.intent.v1",
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

## Browser adoption

Each Evercraft web product should serve `evercraft-push-sw.js` from its own origin and call the shared browser registration helper only after an authenticated user asks for notifications. Do not ship a global enrollment token to the browser. Public apps should proxy registration through their authenticated backend so the global enrollment secret never reaches browser code. The browser helper accepts an optional bearer only for deployments that already issue a safe scoped credential.

The shared helper lives at `systemia/notification-fabric/browser-client.ts`.

The default store is a durable single-node filesystem adapter intended for the current Forge runtime. The store contract is replaceable. Before running multiple notification service replicas, move subscription, dedupe, and receipt state to a shared transactional store so replicas cannot race.

## Next adapters

The fabric is ready for APNs, native Android/FCM, SMS fallback, email fallback, in-app inbox, and digest workers. Those are transports, not separate notification systems. Product code should continue to emit the same intent contract.


## Server-side adoption

Node services can use `systemia/notification-fabric/client.mjs`. Configure `EVERCRAFT_NOTIFICATION_BASE_URL` and the server-only ingest token, then call `client.notify(intent)` for product/user notifications or `client.signal(signal)` for operational events. Product code never needs to know the Web Push protocol or transport details.
