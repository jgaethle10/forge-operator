# Evercraft Signal | Official-source Watch v1

Read-only source observation for Signal editorial operations. **Not** a public emergency alert feed or an independent radiation-monitoring system.

## Source scope and evidence limitations

The adapter uses exactly two allowlisted Savannah River Site official releases (#2 and #3) and the official news-release archive. It detects disappearance of known official phrases, source retrieval failures, and untracked release links. This is not a full semantic comparison, so matching phrases do not prove that no other text changed.

Each receipt records: retrieval time, official URL, content SHA-256, known-assertion check, explicit source coverage state, and candidate release links. Unavailable sources are monitoring gaps, not negative hazard results.

The Systemia Signal Fabric bridge returns normalized candidate records marked as *not sent*. Review candidates never become verified contamination or urgent public hazard alerts.

## Workflow

Workflow: `.github/workflows/signal-official-watch.yml`.

GitHub Actions schedule: six-hour interval (subject to GitHub scheduling, permissions and source availability), plus manual dispatch. Each run uploads a 30-day receipt artifact and a short operator summary. An actual scheduled run is required before reporting operational uptime.

Tests: `node --test tests/signal-official-watch.test.mjs tests/signal-fabric-bridge.test.mjs tests/signal-incident-public.test.mjs`

Source observation command: `node systemia/signal-publication/official-watch.mjs --out artifacts/signal-official-watch/latest.json`

## Hard boundaries

- This monitor does not independently measure radiation, exposure or a contamination plume.
- FAA restrictions are not contamination boundaries.
- A quiet source or an unavailable source never proves safety.
- A changed phrase or new release link triggers **editorial review**, not publication or emergency instructions.
- No paid checkout, public case modification, subscriber alert or private notification is performed.
- The public incident page remains a dated editorial snapshot, not a live service.

## Next gate

Attach approved receipts to Systemia's persistent incident ledger, replay and acknowledgment system; then build a typed public freshness view with measured source-health evidence. Add new independent source families only after verifying their reliability and time semantics.

## November 9: First-party Signal buyer-intake lane

Source: `systemia/mcp/signal-public-inquiry.mjs`, mounted on the existing owned Fabric runtime:

- `GET /api/signal/readiness`: public-safe readiness only; no customer details, payments or secret material
- `POST /api/signal/inquiry`: consented single-incident scope request, creates a private encrypted inquiry receipt `ECS-...`, not an order
- Every accepted request is encrypted at rest with AES-256-GCM using a dedicated 32-byte server-held key `EVERCRAFT_SIGNAL_INTAKE_KEY_B64`. Never commit the key, expose it to a browser or use GitHub Actions to handle customer data
- Private store defaults to `~/.local/state/evercraft/signal-leads`, configurable via `EVERCRAFT_SIGNAL_LEADS_DIR`; directory must be mode 0700, private files mode 0600, and symbolic links rejected
- Alert outbox includes only opaque reference/time, not contact details. The owner-notification bridge can run when `EVERCRAFT_SIGNAL_OWNER_PRINCIPAL` and the existing Notification Fabric environment are configured. Outbox reconciliation handles a crash between encrypted write and queued notification
- Browser only labels the form native-ready when the owned readiness endpoint reports `intake_available:true`. Otherwise it offers a one-click email draft as fallback. A browser email draft is not a received lead

To configure owned runtime, the operator must provision a fresh key using an authorized secret manager or securely generate a 32-byte random key outside the repository; apply strict filesystem ownership and permissions, configure the server environment, and redeploy/restart the Fabric service on its owned host. **Do not place real customer data or the key in CI.** Before promoting the native form, independently verify the HTTPS readiness route, a consented authorized end-to-end test, private encrypted storage, and owner notification receipts. GitHub merge alone does not deploy the resident Fabric service.

**Commerce boundary:** `signal.incident_evidence_brief_250.v1` remains `native_order_enabled:false`. A securely stored inquiry is not accepted scope, not a verified payment, and not permission to start work. Exact-SKU Evercraft Payments verification remains a separate release gate.

### Owner-only inbox

After the owned runtime has a valid private key and store, the operator can inspect references without exposing customers:

- `node scripts/signal-owner-inbox.mjs status`: private store availability, total encrypted inquiries, queued and acknowledged alerts, **no PII**
- `node scripts/signal-owner-inbox.mjs list`: opaque inquiry references, **no PII**
- `node scripts/signal-owner-inbox.mjs show ECS-<reference> --reveal`: owner-authorized local reveal requiring the dedicated key; never use in public logs
- `node scripts/signal-owner-inbox.mjs draft ECS-<reference> --reveal`: safe reply draft addressed to the buyer, with **no sending, no checkout and no false fulfillment claim**

The browser is not given a private inbox route, decryption key, customer lookup endpoint or payment token. Customer inquiries are not counted as revenue until matching Evercraft Payments settlement and fulfillment receipts exist.

### Owned resident auto-convergence (November 10 release)

The existing owned evercraft-fabric-update.timer is now configured to provision Signal intake via scripts/provision-signal-resident-intake.mjs. It prepares /var/lib/evercraft/signal-intake/ with service-user ownership, mode 0700 directories, key.b64 mode 0600, and a persistent leads/ store. A cryptographically random 32-byte key is generated **only once** if none exists and there are no encrypted records it would orphan. Existing valid keys are not rotated or logged. A previously configured server-only environment key is respected.

Before calling an updated or aligned Fabric release healthy, the updater now performs a read-only loopback GET to /api/signal/readiness and requires intake_available:true, payment_ready:false, and payment_verified:false. Unsafe directories, identity mismatches, absent key, or stale runtime routes remain a release HOLD. No requests, charges, customer data, or real payments are generated by provisioning.

This automatic convergence depends on an actual authorized resident Fabric timer running and fetching main. A merged PR does not prove the ChromeOS host forward, DNS, trusted TLS, or external access. Inspect the resident updater receipt and the independent external canary. The owner-only local inbox remains the review path; never copy key.b64, private customer records or keys into GitHub or public logs.
