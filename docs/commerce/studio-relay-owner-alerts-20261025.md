# Commercial Studio → Systemia Relay owner alerts

This is the first-party, privacy-minimized commercial-lead notification path. It is **not a buyer or payment automation**.

## Proven admission path

The public Studio form sends an approved, consented customer brief to the owned Fabric POST intake. Fabric saves the full brief in its PRIVATE Studio ledger (`$EVERCRAFT_STUDIO_LEADS_DIR/inquiries.ndjson`, mode 0600). Only a reference ID, controlled project label, and reception time enter `alert-outbox/*.json`, which is also private.

When **all three** owner-only environment settings are configured on the Fabric host, the resident process attempts delivery to the existing Systemia Relay notification service:

```text
EVERCRAFT_STUDIO_RELAY_OWNER_PRINCIPAL=<actual authorized owner principal ID>
EVERCRAFT_NOTIFICATION_BASE_URL=<trusted owned Relay API HTTPS origin>
EVERCRAFT_NOTIFICATION_INGEST_TOKEN=<secret in private service environment, not git>
```

The principal must already be an identity known to Relay. Server-to-server bearer auth remains private; no token is used by the public form. Without these settings the private alert queue remains safely **pending**. Never label it sent or human seen.

Relay stores the operational notification in the principal's durable inbox. Web Push or realtime requires the owner's existing authorized Relay subscription/session. A successful Relay `inboxed>=1` receipt means *durable inbox acceptance only*, **not** OS push, user seeing the message, answering the lead, a quote, or a payment. Every notice uses a stable `studio:<inquiry reference>` dedupe key and a seven-day window.

The Fabric server retries pending notices every minute while its process is active. A temporary outage or absent configuration must not interrupt the customer-facing request or delete the private brief. Only confirmed inbox acceptance removes an alert from the pending queue, with a separate private acceptance receipt. The queue has no personal data (name, email, business, creative text, IP, cookies). A failed alert does not trigger automatic email, agent execution, or checkout.

## Local integrity checks

```bash
node --test tests/fabric-commercial-studio-inquiry.test.mjs tests/fabric-commercial-studio-relay-alerts.test.mjs
```

The public GET/OPTIONS canary verifies site availability, cross-origin request policy, and method boundaries without creating any fake leads. It **does not** verify private durable customer acceptance or notifications; a voluntary real customer inquiry and owner's Relay inbox acknowledgment are separate field receipts.

## Remaining operational acceptance

- Confirm the local Fabric process has a writable private Studio state directory on persistent disk with sufficient retention/backups and user ownership.
- Confirm owner principal, Relay server and ingest token are bound in the **private service environment** and protected by service permissions.
- Confirm a genuine opt-in customer inquiry is present in the private ledger and an associated non-PII alert transitions from pending to Relay inboxed.
- Record owner review and customer reply through Interaction Ledger without duplicate same-day messages. Do not emit unsolicited replies or automatic payment links.

Safe failure semantics: **NO CONFIG → QUEUED**, **PROVIDER ERROR → QUEUED**, **RELAY INBOXED → RECEIPT**. None of these imply new money.
