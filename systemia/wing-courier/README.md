# Systemia Wing Courier | encrypted work transfer between Evercraft departments

**Engineering state:** transport source and synthetic test contract committed November 19, 2026. **NOT deployed.** No live Harbor→Fallen transfer, authenticated production relay, decrypted Ricky files on NextGen, or authorized customer preview has been verified.

**Port allocation:** Wing Courier's owned loopback broker is pinned to `127.0.0.1:8851` so it does not collide with the existing Saban Microseed Gateway on `127.0.0.1:8791`. **Verify port 8851 is free on the actual owner host before activation**, and verify that the Fabric process can reach that same loopback listener. Do not interrupt or reassign Saban's port.

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
- `broker.mjs`: authenticated, wing-scoped staged/upload/ready/poll/download/ack operations and durable ciphertext bytes with private filesystem permissions. ACK requires the receiver's **Ed25519 signature bound to exact package ID, from/to wings, ciphertext hash and local custody receipt hash**; possession of a bearer token alone cannot falsely mark receipt. The broker also enforces bounded stored-byte and reservation quotas. HTTPS/TLS must be provided by an independently verified **owned** edge, because the broker refuses any non-loopback bind. No receiver storage credentials or sender private keys on broker. `ACK_REPORTED_BY_RECEIVER` is not an independently attested client delivery.
- `client.mjs`: source packaging, retryable identical package-id push, outbound-only polling, receive-side signature/hash/decrypt, duplicate import protection, private receipt and broker acknowledgment. Both agents call **outbound**, so NextGen does not need an internet-facing listener, full tailnet enrollment, public SSH or Google Drive.
- `intake-bridge.mjs`: locally verified receipt becomes a **Passport-gated inert Intake Fabric candidate** referencing locally held source files. The source adapter requires a real `intake.write.agent` grant, never a claim inside customer media. No remote mission admission or execution.
- `resident.mjs`: repeat outbound polling and durable local receipts. Before **every** delayed Passport Intake offer it re-checks the private receiving directory, exact wing/package binding, filename safety, per-file SHA-256 and expected byte sizes, rejecting altered or extra files. A failed re-check remains held and can retry only after custody is restored. The original sender-signature validation happens at encrypted import, not during offline retry. No automatic render/send.
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
 "port":8851,
 "wings":[
  {"wing":"harbor","sendTokenFile":"/private/secrets/harbor.send",
   "receiveTokenFile":"/private/secrets/harbor.receive","ackVerifyPublicKeyFile":"/private/trusted/harbor.sign.pub","allowedDestinations":["fallen"]},
  {"wing":"fallen","sendTokenFile":"/private/secrets/fallen.send",
   "receiveTokenFile":"/private/secrets/fallen.receive","ackVerifyPublicKeyFile":"/private/trusted/fallen.sign.pub","allowedDestinations":["harbor"]}
 ]
}
```
Run `node systemia/wing-courier/broker.mjs /private/config.json` only after verifying local service ownership and confidentiality. It binds `127.0.0.1:8851`, **not** an accessible internet endpoint. Gateway/TLS configuration is separate and not currently deployed.

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
 "baseUrl":"https://fabric.systemiacommandcenters.com/api/internal/wing-courier",
 "sendTokenFile":"/private/secrets/harbor.send"
}
```
The existing Fabric public hostname is independently verified, but this private Wing Courier route is **not enabled or verified live**. Its exact path is pinned in client code to prevent bearer-token leakage to third-party hosts.

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
 "baseUrl":"https://fabric.systemiacommandcenters.com/api/internal/wing-courier",
 "receiveTokenFile":"/private/secrets/fallen.receive",
 "destinationDir":"/home/coach/.local/share/evercraft/fallen-intake/media",
 "receiverPrivateKeyFile":"/private/keys/fallen/decrypt.key",
 "receiverSigningKeyFile":"/private/keys/fallen/sign.key",
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

## Authenticated read-only receiver route canary (NextGen, pre-transfer)

After the owner-operated private broker and Fabric route are separately provisioned,
the **authorized NextGen local operator** can verify the existing HTTPS route
using the genuine private Fallen receiver configuration. This canary first sends
an **anonymous GET**, requiring 401/403; it only then sends an authenticated
**GET /v1/inbox?wing=fallen** using the already-provisioned private receiver token.
A 200 response must match the actual Wing Courier broker inbox schema and wing.
The result contains no inbox items, bearer tokens, package identifiers, file
names or customer bytes. A 404 is HELD and does not expose a bearer token.

Default invocation is an offline private-config dry run. Network verification
requires an explicit local opt-in:

```bash
node systemia/wing-courier/receiver-auth-canary.mjs --config /approved/private/fallen.json
node systemia/wing-courier/receiver-auth-canary.mjs --config /approved/private/fallen.json --authorize-owned-network-check
```

It does **not** download/decrypt an envelope, run the resident, change the
broker, enable the Fabric public route, assign Systemia work, or release customer
media. Even a valid authenticated response is NOT evidence of a completed
Harbor-to-Fallen transfer or machine identity attestation. Keep #2294 open until
a separately approved synthetic end-to-end receipt and later authorized
real customer-file 12/12 verification exist.

## Limits, honesty, and next operator gates
This reference implementation is **not yet a hardened internet-facing service**: it needs owner-controlled TLS reverse proxy, per-actor revocation, audited quotas/retention, recovery/reconciliation of interrupted uploads, operational health monitoring and real direct device key registration. If the owned relay host is unavailable, the system must hold queued work and retry safely; no customer-facing claims of delivery or production.

**Frozen first customer:** original rejected preview remains `CUSTOMER_REJECTED_PREVIEW / RECOVERY_REQUIRED`. No further preview, payment link, master or customer message until founder-authorized repair, separate independent Fallen creative/audio review and exact-file approval. Prevent the courier's internal result transport from becoming a substitute for Harbor's external Meta-send gate.

Related existing contracts: `systemia/intake-fabric/README.md`, `systemia/passport/README.md`, `systemia/shipping/README.md`, `systemia/media-studio/client-commercial-preflight.md`, issues #2280 (real customer handoff) and #2284 (customer incident).


## Owned NextGen resident bootstrap, no founder media copying

`install-resident.mjs` provides a **dry-run-first local host activation gate**. It does not connect to Meta, create keys, publish routes or move customer files. It refuses to install unless a real local operator supplies a 0600 private config with pinned Harbor public signing key, private Fallen recipient decrypt+ACK signing keys, private received-assets directory and a real HTTPS origin. It does not log secret contents.

On the **authorized NextGen user account**, when its secrets and genuine owned TLS broker route have been provisioned:

```bash
node systemia/wing-courier/install-resident.mjs --config /path/to/private/fallen.json
# Dry-run report: local files valid, NOT proof the remote route exists.
node systemia/wing-courier/install-resident.mjs --config /path/to/private/fallen.json --activate --confirm-owned-host
# Only an approved owner on the actual NextGen machine may opt in after dry run.
# Pre-existing service files and symlinked systemd paths HOLD without overwrite.
```

The second command is **not authorized by publication of this README or by a GitHub CI pass**. Actual deployment requires the named owner-controlled operator, private credentials and a verified broker endpoint; the publisher must never auto-run activation from a PR. No root, no public incoming NextGen port, no Tailscale requirement. Whether the service remains connected requires an independent private-machine + external TLS receipt.

No customer contact, payment, release or rendering is enabled by starting this resident. For the first recovery, Ricky remains `CUSTOMER_REJECTED_PREVIEW / RECOVERY_REQUIRED` until producer assignment, independent Studio review, founder exact-file approval and governed native Meta send.

## Reuse the owned Fabric HTTPS edge (optional route, NOT activated by code merge)

Independent external checks on 2026-11-20 UTC established that `fabric.systemiacommandcenters.com` resolves through public DNS, has a valid TLS handshake, returns HTTP 200 for `/health`, and identifies itself as `evercraft-fabric-local`. **Its existing deployment-receipt-bound field was false**. These checks do NOT prove an authenticated Courier route.

The source now offers an **explicitly disabled-by-default** route at:

`https://fabric.systemiacommandcenters.com/api/internal/wing-courier`

The Fabric runtime imports `systemia/wing-courier/fabric-proxy.mjs`, but returns 404 for the entire prefix unless the **actual owner-controlled Fabric environment** sets `EVERCRAFT_WING_COURIER_ROUTE_ENABLED=1`. This owner-local flag must not be set from GitHub CI, an untrusted chat, or a client-claimed identity. A verified, already-running loopback broker at `127.0.0.1:8851` with genuine wing-scoped credentials must exist first. The proxy forwards only the declared Courier API methods, exactly to that loopback socket. It does not accept arbitrary upstream URLs, cross-origin browser requests, hostnames, or broad remote controls. If the broker is absent, authenticated requests return an unavailable response.

Client-side `baseUrl` is pinned to this exact **owned HTTPS origin + path** for remote traffic. Only local loopback HTTP is permitted for isolated tests. This allows both Harbor (outbound push) and NextGen (outbound poll) to reuse the already-owned Fabric domain with **no new DNS name, broad tailnet access, Caddy edits, or incoming NextGen port**.

**Operator-controlled activation prerequisites:**

1. Reconcile Fabric's actual signed deployment receipt/identity and current public TLS origin; do not infer approved runtime provenance from a 200 response alone.
2. Provision broker-specific private state and unique per-wing send/receive token files under owner-controlled, nonpublic 0600/0700 storage. Pin the genuine public Ed25519 receiver-ACK signing key for each wing. Never commit secrets.
3. Have a named trusted operator start the loopback broker using a reviewed owner-only config, verify its private health and forbidden-auth tests, then opt-in the private Fabric route via the owner-controlled environment. Recheck the live authenticated path from an independent machine. A public 404 before activation is intended.
4. Only after verified credentials/public keys exist, activate the NextGen outbound receiver with the dry-run-first `install-resident.mjs` and authenticate the private Harbor sender; keep provider-side customer-send guard independent.
5. Collect an actual 12/12 source-byte receiving receipt and an explicit Systemia intake/producer assignment before any creative rendering or customer messaging.

See P0 issues #2294 (deployment), #2280 (first customer), #2284 (rejected-preview incident).


## Sender-side verified custody checks (no upload retry required)

Once the actual Harbor sender has prepared and pushed an encrypted private bundle with its scoped token, it can read back its **own** tracked package status over the exact existing Fabric route:

```bash
node systemia/wing-courier/client.mjs status /private/harbor-config.json /private/outbox/exotic-chiles.wing
```

The `status` command reads the exact private sender-side `*.wing.json` metadata and authenticates as the original sender to the broker's `GET /v1/envelopes/:id/status`. It rejects any reply with a mismatched ciphertext hash, ID, origin or recipient, or a missing signed custody ACK. The broker checks the original sender's send-role token; neither an anonymous caller nor the receiving wing's token can inspect the sender-only status.

Distinct states: `BROKER_RESERVATION_ONLY` means upload not completed, `BROKER_STORED_AWAITING_RECEIVER` means ciphertext arrived but no verified receiving ACK, and `VERIFIED_RECEIVER_ACK_RECORDED` means the broker verified the receiver's pinned Ed25519 signature over a real local receipt digest. **None is Systemia admission, Studio QA, an approved customer preview, payment or Messenger send.**


## Fabric shared-route resource guards (2026-11-19)

The existing **opt-in** \`/api/internal/wing-courier\` bridge within Evercraft Fabric is a fixed-path request relay to its **loopback-only**, wing-authenticated ciphertext broker. It is **not live** merely because code is merged. The single canonical proxy is \`systemia/wing-courier/fabric-proxy.mjs\`, not a second Caddy listener or new public domain.

In addition to the broker's destination/token/signature and durable-queue limits, the Fabric proxy now defaults to:

- **512 MiB maximum incoming request body** (hard ceiling 3 GiB plus an envelope allowance), validated against Content-Length before opening an upstream request and against bytes actually streamed for chunked/unknown-length uploads; large bytes are **not** assembled into a JS buffer.
- **4 simultaneous active proxied requests** (bounded configurable range 1–64). Excess authorized requests return HTTP 429 and must be retried by the authorized wing without changing package identity or granting send authority.
- A bounded upstream request timeout; owner-local backend failures return generic non-secret 503/504 statuses.
- Existing exact Host/method/path restrictions and owner-scoped bearer-token verification. Bad bearer credentials never become media work.

Operator-selected limits in \`createWingCourierFabricProxy\` must not exceed the installed broker's own quotas, the signed wing contract, disk capacity and approved source batch. The code's default does **not** establish actual operator approval, a configured live broker or a secure public deployment.

Run \`node --test systemia/wing-courier/fabric-proxy.test.mjs\` to verify declared + streamed oversized-body rejection, concurrency backpressure/recovery and existing authenticated routing. These are synthetic offline tests only. The real 12-file customer handoff remains HELD until a named owner operator verifies the existing TLS edge, broker, secrets, resident, exact source bytes, rights and independent review. The native Meta preview-send freeze remains unaffected.
