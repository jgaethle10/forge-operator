# Systemia Wing Courier | encrypted work transfer between Evercraft departments

**Engineering state:** transport source and synthetic test contract committed November 19, 2026. **NOT deployed.** No live Harbor→Fallen transfer, authenticated production relay, decrypted Ricky files on NextGen, or authorized customer preview has been verified.

**Mission:** a wing submits one private, verifiable work package and receives a durable receiver acknowledgment without asking the founder to transfer files manually. GitHub is canonical *code and engineering receipts*, never a customer-media store. This is a new **payload carrier** for the existing Systemia and Passport architecture, **not a competing mission orchestrator, customer messenger or release system**.

## Wing-to-wing path

```
Harbor Meta intake (existing customer consent + original bytes)
    |
    +-> private source package: assets + preferences/rights context
    |    - X25519 recipient public key + ephemeral DH
    |    - HKDF-SHA256 -> AES-256-GCM authenticated encrypted envelope
    |    - sender Ed25519 signature over encrypted envelope
    |
    v  outbound-only HTTPS, scoped "harbor" sender token
Evercraft owned Wing Courier broker (Penguin/owned edge planned)
    | stores ciphertext only, no source filenames or plaintext
    | durable staged -> ready queue, SHA-256, package idempotency
    v  outbound-only HTTPS, scoped "fallen" receiver token
NextGen Wing Courier resident
    | checks broker ciphertext hash, trusted Harbor signing key,
    | recipient decryption key, AEAD integrity and every file SHA-256
    | private import + receipt; broker ack means reported custody ONLY
    v
Systemia Intake Fabric "agent" candidate (Passport intake.write.agent)
    | receipt metadata only; untrusted customer contents stay inert
    | Human/Systemia admission separate from transport
    v
Fallen Studios named production operator + creative / rights / QA
    | authenticated render and independent exact-file review
    | founder approval for current recovery
    v
Wing Courier encrypted return to Harbor (delivery-authority false)
    v
Harbor external Messenger preview-send guard + customer response
    | authorized release only; separate provider readback
    v
Evercraft Payments after customer preview approval -> verified master delivery
```

**Outcomes are distinct:** `CIPHERTEXT_STORED` is not `RECEIVED_VERIFIED`; `RECEIVED_VERIFIED` is not `SYSTEMIA_ADMITTED`; `SYSTEMIA_ADMITTED` is not `FALLEN_PRODUCED`; `FALLEN_PRODUCED` is not `APPROVED_FOR_CUSTOMER`; a payment-intent or Meta send attempt is not paid/delivered proof.

## Already implemented in source
- `envelope.mjs`: Node 22 built-in X25519, Ed25519, HKDF, AES-256-GCM. Streamed encrypt/decrypt for large files; private flatten-only filenames, digest/size and no-symlink safeguards, atomic staging, duplicate rejection; receipt with **zero** downstream authority. The source manifest and asset bytes are inside the encrypted ciphertext; the relay sees only opaque IDs and routing wing identifiers.
- `broker.mjs`: authenticated, wing-scoped staged/upload/ready/poll/download/ack operations and durable ciphertext bytes with private filesystem permissions. HTTPS/TLS must be provided by an independently verified **owned** edge, because the broker refuses any non-loopback bind. No receiver storage credentials or sender private keys on broker. `ACK_REPORTED_BY_RECEIVER` is not an independently attested client delivery.
- `client.mjs`: source packaging, retryable identical package-id push, outbound-only polling, receive-side signature/hash/decrypt, duplicate import protection, private receipt and broker acknowledgment. Both agents call **outbound**, so NextGen does not need an internet-facing listener, full tailnet enrollment, public SSH or Google Drive.
- `intake-bridge.mjs`: locally verified receipt becomes a **Passport-gated inert Intake Fabric candidate** referencing locally held source files. The source adapter requires a real `intake.write.agent` grant, never a claim inside customer media. No remote mission admission or execution.
- `resident.mjs`: repeat outbound polling, durable local receipts, retry of previously downloaded but not yet Passport-ingested custody packets; safe errors and no automatic render/send.
- `wing-courier.test.mjs` and `intake-bridge.test.mjs`: synthetic end-to-end and adversarial checks. CI `.github/workflows/evercraft-wing-courier.yml` covers transport tests. **Synthetic CI is not proof of live deployment**.

## Security and authority to complete before production
1. Owner verifies the **actual** allowed Evercraft-owned Caddy/TLS origin, its hostname, external reachable security policy, and dedicated limited path proxy to loopback port. **Do not invent a DNS name, reconfigure production Caddy on assumption, or publish the broker unprotected.**
2. On the owned relay host, store private `stateDir` (0700) and per-wing token files (0600) with distinct long random send/receive credentials, never in repo, logs, chats or client HTML. Restrict sender destinations explicitly and rate-limit request/upload size at the edge.
3. On NextGen, generate receiver X25519 private key locally. Harbor obtains the **verified recipient public** key from an authorized Systemia directory, not an untrusted customer message. Harbor generates private signing key locally, and NextGen pins its authenticated sender public key. Key rotation/approval/revocation must be an independently authenticated owner operation.
4. Configure `resident.mjs` on NextGen as an owned user service after a legitimate operator approves the exact scope, directory, log policy and private credential custody. Broker config can be changed without granting remote shell access. No Tailscale is required for this design. If not deployed, maintain HOLD state; **do not tell Harbor to transfer to a nonexistent endpoint**.
5. Integrate verified custody receipt with real Passport-authorized `systemia/intake-fabric/intake.mjs`. A job is admitted only when genuine permissions, ownership, rights and capacity pass. Publishing/social actions remain separately governed by `systemia/distribution/harbor/commercial-preview-send-guard.mjs` plus a future **connected** provider sender.
6. End-to-end prove real authorized bytes, real sender/receiver, real finite retries, exact 12/12 file SHA custody, real named operator and QC on **the actual machine**, and separate founder/client approvals. Protect data retention/deletion, metadata exposure, log redaction, backup/restore, disk quota and token revocation before scale.

## Private broker config (example shape, NO real token data)
Create a chmod 0600 JSON file **on the owned broker**, using private files holding random secrets:
```json
{
 "stateDir":"/private/evercraft/wing-courier",
 "port":8791,
 "wings":[
  {"wing":"harbor","sendTokenFile":"/private/secrets/harbor.send",
   "receiveTokenFile":"/private/secrets/harbor.receive","allowedDestinations":["fallen"]},
  {"wing":"fallen","sendTokenFile":"/private/secrets/fallen.send",
   "receiveTokenFile":"/private/secrets/fallen.receive","allowedDestinations":["harbor"]}
 ]
}
```
Run `node systemia/wing-courier/broker.mjs /private/config.json` only after verifying local service ownership and confidentiality. It binds `127.0.0.1:8791`, **not** an accessible internet endpoint. Gateway/TLS configuration is separate and not currently deployed.

## Private wing keys
To generate on the wing's **actual owner-approved machine**:
```
node systemia/wing-courier/client.mjs keys /private/wing-keys/harbor harbor
node systemia/wing-courier/client.mjs keys /private/wing-keys/fallen fallen
```
These commands are examples and belong on their respective different machines, **not both on Harbor**. Each wing retains its own `*.key` and offers only the reviewed `*.pub` through a trusted key directory. Private key directories must not preexist with contents. Do not reuse this demo command as live unattended registration.

## Harbor sender configuration (private 0600 JSON)
```json
{
 "fromWing":"harbor","toWing":"fallen",
 "recipientPublicKeyFile":"/private/trusted/fallen.decrypt.pub",
 "senderSigningKeyFile":"/private/keys/harbor/sign.key",
 "baseUrl":"https://verified-owned-relay.example",
 "sendTokenFile":"/private/secrets/harbor.send"
}
```
The URL is an **illustrative placeholder**, not verified or live.

```bash
node systemia/wing-courier/client.mjs prepare /private/harbor-config.json \
  /private/customer-asset-dir /private/outbox/exotic-chiles.wing media \
  asset-001.jpg asset-002.png asset-003.mp4
node systemia/wing-courier/client.mjs push /private/harbor-config.json /private/outbox/exotic-chiles.wing
```
The example lists only three filenames for readability; the real first case has **12 separate private files** plus a brief as a separate authorized context file if necessary. Re-running `push` on the **same** `.wing` retries the same idempotent encrypted envelope, not a new submission. No publication or payment authority is generated.

## Fallen receiver configuration (private 0600 JSON)
```json
{
 "wing":"fallen",
 "baseUrl":"https://verified-owned-relay.example",
 "receiveTokenFile":"/private/secrets/fallen.receive",
 "destinationDir":"/home/coach/.local/share/evercraft/fallen-intake/media",
 "receiverPrivateKeyFile":"/private/keys/fallen/decrypt.key",
 "senderVerifyPublicKeys":{"harbor":"/private/trusted/harbor.sign.pub"},
 "intakeStateDir":"/private/systemia/intake",
 "passportStateDir":"/private/systemia/passport",
 "adapterActorRef":"adapter:wing-courier"
}
```
```bash
node systemia/wing-courier/resident.mjs /private/fallen-config.json --once
# Later, after owned user-service admission:
node systemia/wing-courier/resident.mjs /private/fallen-config.json
```
A genuine `intake.write.agent` Passport grant is required before any candidate is accepted into Intake Fabric. Without a real grant the already-private received bytes remain held and the resident retries admission. No step automatically initiates a render.

## Limits, honesty, and next operator gates
This reference implementation is **not yet a hardened internet-facing service**: it needs owner-controlled TLS reverse proxy, per-actor revocation, audited quotas/retention, recovery/reconciliation of interrupted uploads, operational health monitoring and real direct device key registration. If the owned relay host is unavailable, the system must hold queued work and retry safely; no customer-facing claims of delivery or production.

**Frozen first customer:** original rejected preview remains `CUSTOMER_REJECTED_PREVIEW / RECOVERY_REQUIRED`. No further preview, payment link, master or customer message until founder-authorized repair, separate independent Fallen creative/audio review and exact-file approval. Prevent the courier's internal result transport from becoming a substitute for Harbor's external Meta-send gate.

Related existing contracts: `systemia/intake-fabric/README.md`, `systemia/passport/README.md`, `systemia/shipping/README.md`, `systemia/media-studio/client-commercial-preflight.md`, issues #2280 (real customer handoff) and #2284 (customer incident).

