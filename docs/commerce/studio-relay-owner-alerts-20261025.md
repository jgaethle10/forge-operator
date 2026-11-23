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


## Private owner-local intake status (no Relay credentials required)

On Penguin, run as the ordinary runtime user who owns the private Studio directory:

```bash
node scripts/studio-owner-intake-status.mjs
```

This is a **read-only, local-only** diagnostic. It prints aggregate counts and newest inquiry time, never customer names, emails, company names, brief text, or Relay credentials. It validates private file permissions and fails closed on malformed ledgers, duplicate references, or suspicious alert files. It does not send notifications, repair missing alerts, mark inquiries reviewed, or authorize payment.

- `inquiries_total`: durable first-party inquiries
- `awaiting_relay_dispatch`: private non-PII alerts waiting for Relay
- `relay_inbox_accepted`: durable Relay inbox acceptance receipts, **not** human reads
- `alert_recovery_needed`: inquiry with neither pending alert nor acceptance receipt
- `duplicate_pending_and_accepted`: an alert has both a queued file and an acceptance receipt; review before any retry

**Important:** This utility does not inspect the running Fabric process environment. Zero inquiries do not prove Relay is configured. Privately verify an existing authorized owner principal, owned Notification Fabric endpoint, and protected ingest token, without exposing values or making up an identity. No synthetic leads or emails.


## Penguin Notification Fabric resident: staged activation

The full Forge `server.ts` registers Notification Fabric but is not a resident Penguin service. Keep the working Fabric runtime on port 8787 untouched. A dedicated **first-party, loopback-only adapter** can host the same `registerNotificationFabricRoutes` on port 3921 without publishing any extra internet ingress.

Read-only prerequisite check after source rollout:

```bash
scripts/install-notification-relay-loopback.sh --check
```

Explicit owner-authorized standalone activation (requires existing Express dependency and root permission):

```bash
sudo bash scripts/install-notification-relay-loopback.sh --apply
```

This installs `evercraft-notification-fabric.service`, which binds only `127.0.0.1:3921` and persists a private mode-0700 inbox under `/var/lib/evercraft/notification-fabric`. Strong ingest, session, and receipt secrets are generated on the owned host and saved only to root-owned `/etc/evercraft/notification-fabric.env` (0600); no token is printed or committed. Any preexisting service or configuration is held for manual review. It does not edit `/etc/evercraft/fabric.env`, restart Fabric, supply a Studio recipient, send any notification, or expose browser push. A successful local health check proves the **Relay listener**, not Studio notification delivery.

**Second, separate authorization gate:** choose and verify the existing owner Relay principal, and wire the protected host-only Relay settings (`EVERCRAFT_NOTIFICATION_BASE_URL`, `EVERCRAFT_NOTIFICATION_INGEST_TOKEN`, `EVERCRAFT_STUDIO_RELAY_OWNER_PRINCIPAL`) into `evercraft-fabric.service` using an owner-reviewed private systemd environment file. Do not guess an identity, paste secrets into a terminal transcript, log credentials, create a second Relay store, or append insecure duplicate variables to an existing environment file. Only when a real opted-in buyer has submitted an inquiry should its accepted reference be used to verify outbox -> durable Relay inbox -> operator acknowledgement. Relay inbox acceptance is **not** human notification or payment.


### Penguin Express dependency isolation

The guarded installer must not require `node_modules` inside the canonical Forge checkout. On Node001, `scripts/install-notification-relay-loopback.sh --check` previously returned exit 3 because Forge's declared Express dependency was absent from the local checkout. That was a *safe prerequisite hold*, not a broken Fabric update.

Updated behavior: read-only `--check` reports whether npm and the private dependency directory are available, without running npm. Explicit `--apply` installs **only pinned `express@4.21.2`** and its required dependencies into owner-private `/var/lib/evercraft/notification-relay-deps`, with package scripts disabled. The standalone Node service loads Express from that private path and fails closed if an explicit dependency root is missing, unsafe or at the wrong version. The installer does not run `npm install` in Forge or change any tracked files. Installing a dependency library on the owned host is distinct from moving application runtime to a third-party service.

If npm is unavailable, isolated installation fails safely and does not configure Studio alerts. If npm reports network or dependency issues, do not bypass private storage/credential checks, publish port 3921, or start the full Forge `server.ts` to work around it. Source CI tests the same private-prefix dependency layout.


### Relay resident startup check

The dedicated Node service uses systemd `Type=simple`, which can report started before its loopback HTTP listener is ready. On 2026-11-22 the first activation installed the Express dependency, enabled the service, then received an immediate connection refusal on port 3921. The owner later verified `ActiveState=active`, `SubState=running`, `NRestarts=0`, listener `127.0.0.1:3921`, `/api/notifications/health` HTTP 200, and separately healthy Fabric release `f93210a61e...` with 125 capabilities. This was a **readiness race**, not a failure or lost customer lead.

The installer now performs a bounded 24-attempt, 0.5-second loopback health poll after systemd activation, checking the service remains active. It does not restart or overwrite an existing installation. **Never rerun `--apply` on a host where the root-only env file and unit already exist.** Keep these credentials and private inbox storage unchanged.

The next identity gate is distinct: Evercraft Home's public owner-claim manifest declares subject reference `user:jesse`, but **that manifest alone is not proof the private Home owner account is bootstrapped or an authorized Relay inbox/session exists**. Verify actual owner bootstrap state and privately bound subject before configuring `EVERCRAFT_STUDIO_RELAY_OWNER_PRINCIPAL`; do not infer an inbox simply because Relay health is 200. The customer inbox remains empty until a real opt-in submission.


## Bind an already-claimed Evercraft Home owner to private Studio alerts

Verified Penguin evidence from 2026-11-22: Home loopback health reports `healthy=true`, `auth_mode=passport`, `owner_bootstrapped=true`, and `owner_claim_available=false`. Protected Home configuration matches the committed owner subject `user:jesse`. The existing Relay on `127.0.0.1:3921` is healthy and its protected ingest credential and owned URL match; private Fabric Studio owner binding remains absent.

Operator-only, **read-only by default**:

```bash
sudo node scripts/configure-studio-relay-owner.mjs --check
```

This validates a *claimed* local Home owner (not only a manifest), root-only Home and Relay configuration, the same non-root account running the private Relay and Fabric services, authenticated read-only Relay `/api/notifications/metrics` ledger verification, Fabric health and absence of conflicting legacy variables. Outputs only boolean/operational status, not names, credentials or customer content. If an existing owner binding is present, verifies it rather than overwriting.

An owner may explicitly activate after reviewing the preflight:

```bash
sudo node scripts/configure-studio-relay-owner.mjs --apply
```

Only the new root-only `/etc/evercraft/studio-relay.env` (mode 0600) and `40-studio-relay.conf` systemd drop-in are created. They contain the actual owner principal from claimed Home, the **already-running** private Relay's local address and its **existing** ingest token. The original `/etc/evercraft/fabric.env` is neither edited nor replaced, and neither Relay's credentials nor service are regenerated. `evercraft-fabric.service` is restarted once and a bounded readback requires the same source release, same capability count, healthy Fabric and the three exact protected environment values in the running Fabric process. On failure the script attempts to remove only its own two newly created files and restore Fabric, reporting if rollback needs operator investigation. No synthetic buyer inquiry, direct setup notification intent or checkout is sent. **Attention:** The existing Fabric runtime also shares `EVERCRAFT_STUDIO_RELAY_OWNER_PRINCIPAL` with Website Audit and Closeout dispatchers; enabling it can start delivery of their already-queued genuine internal alerts. Relay dedupe and private receipts still apply. The operator must review this shared-routing behavior before `--apply`, and must not mistake an internal Relay notice for customer email.

Important: `--apply` never overwrites existing binding files, never rotates the Relay token and must not be re-run to resolve an unexpected hold. Concurrent Fabric updater runs trigger a hold; do not override it. A healthy configured dispatcher only means future real leads can enter private Relay. Durable inbox receipt, owner viewing a notification, customer reply and payment must be proven separately.
