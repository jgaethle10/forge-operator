# FindMyPart | Owned direct customer request go-live

**Status:** Implementation in draft PR #1701. No public deployment or customer data is implied by this file.

## Customer workflow
A customer visits the owned `/findmypart/` page. They enter **what part**, **what equipment**, and **where to reply**, then tick a single contact consent box. The owned endpoint `POST /api/findmypart/inquiry` validates the submission, encrypts it and saves it in a private local directory. Only a successful write and durable alert outbox produces a received reference. The page then shows that reference. No account, phone call, tier choice, checkout, agent execution, or supplier order is created.

If the backend cannot confirm receipt, the interface **does not claim a lead**. It offers retry and a customer-controlled email link.

## Operator environment (must be provided via owned secret management)
```text
EVERCRAFT_FINDMYPART_LEADS_DIR=<private persistent volume readable by operator only>
EVERCRAFT_FINDMYPART_INTAKE_KEY_B64=<32 cryptographically random bytes encoded as base64>
EVERCRAFT_FINDMYPART_OWNER_PRINCIPAL=<validated Evercraft operator principal>
EVERCRAFT_NOTIFICATION_BASE_URL=<owned Notification Fabric ingress>
EVERCRAFT_NOTIFICATION_INGEST_TOKEN=<operator-held private token>
```
Never paste live keys into GitHub, logs, customer-facing pages or CI. The directory must be owned and mode `0700`. Saved inquiry files and outbox alerts are mode `0600`. Encryption is AES-256-GCM with a unique nonce per inquiry. Key rotation needs a separately validated migration, not an unplanned change while encrypted leads remain.

The inbox alert contains **only a random reference**. Raw part descriptions, customer emails and machine context remain encrypted in the private store.

## How the owner reviews a lead
After an authenticated private operator session has the key/volume mounted, use:
```bash
node scripts/findmypart-review-inquiry.mjs FMP-XXXXXXXXXXXXXXXXXXXXXXXX
```
The script prints the part brief only to that operator terminal. Never run it in public CI, forward its output to marketing, or put customer text into an agent instruction stream.

## Deployment and acceptance
1. Review source and successful exact-commit CI. Merge only after Systemia release acceptance.
2. Deploy the combined owned Fabric runtime on approved server, with the persistent volume, key and Notification Fabric recipient configured.
3. Independent external HTTPS readback of `GET /findmypart/`, `GET /findmypart/app.mjs`, `GET /findmypart/brand/mark.svg`, and `GET /findmypart/sample-report/`; verify correct content hash and noindex hold.
4. Submit a **consented synthetic test request** with a non-personal test email, verify HTTP 201 and `FMP-...` reference. Ensure record stays encrypted and only the reference reaches the operator notification inbox. Test encrypted local owner read and reply workflow without sending email to a real third party.
5. Withhold the public marketing launch until Systemia authorizes publication. The initial direct form may be released before paid checkout, but label payment as not yet available; do not describe a pending inquiry as a booking or order.
6. Separately integrate the order-bound Payments adapter from PR #1598, then verify safe exact-product provider checkout and confirmed settlement, fulfillment and refund behavior. Do not infer paid revenue from a form receipt.
7. Confirm log retention, storage backup, deletion/retention obligations and key recovery before accepting genuine customer private information.

## Stop conditions
- Missing 32-byte encryption key or unsafe storage directory: HTTP 503, **no acknowledgement**.
- Off-origin submission: HTTP 403.
- Missing part, equipment, email or contact consent: HTTP 422.
- Spam honeypot: acknowledged as not received, **no stored lead**.
- More than three submissions per email per hour (per process): HTTP 429. Edge-level anti-abuse is still required for public exposure.
- Notification is not configured: the saved encrypted lead stays available to the owner; no claim of notification delivery is made.
- Never claim a checkout, purchase, source, fitment or finished report from a free inquiry alone.
