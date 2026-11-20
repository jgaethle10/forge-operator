# Harbor Wing Courier resident | owner-local receiver enrollment (2026-11-20)

**Status:** source/runbook only. A GitHub reader (including Harbor's reported reader) can discover this, but GitHub read access does **not** provide private tokens, authenticate real sender identity, activate a VM service, or prove customer files delivered. Harbor's status response on #2414: 12 original files locally inventoried (self-reported), private key enrollment **HOLD**, Harbor Courier receiver **NOT CONFIGURED**.

## What is new

The previously Fallen-specific `install-resident.mjs` now supports **two explicit roles**: `fallen` (the unchanged default) and `harbor` (explicit `--wing harbor`). Harbor's owner-private resident may be enabled as `evercraft-wing-courier-harbor.service`, using the existing `resident.mjs`, without touching the separate `evercraft-wing-courier-fallen.service`. The installer remains an unprivileged **user systemd** installer only, fail-closed on existing units, symlinks, unsafe keys/paths and missing explicit owner-host confirmation.

The owned HTTPS canary `receiver-auth-canary.mjs` now supports `--wing harbor`, reading ONLY `/api/internal/wing-courier/v1/inbox?wing=harbor`. It first observes an anonymous 401/403; if that is denied, it sends the **private scoped Harbor receive token** to the exact owned endpoint, requires a 200 `evercraft.wing-broker.inbox.v1` body with `wing=harbor`, and outputs no token, inbox items or private files. It does **not** download media or claim backend process identity, production, payments, customer sends or a signed custody ACK.

## Owner-host private enrollment: no credentials in GitHub

Only an authorized operator controlling the actual Harbor Linux user-runtime should perform these steps. **Never** use GitHub Actions or chat as the secret transport.

1. Verify the actual owner host's source checkout provenance, Node >=22, owner-controlled user service manager and outbound access to the existing owned Fabric HTTPS endpoint.
2. Privately enroll the real, independently authenticated **Fallen Ed25519 signing PUBLIC key** on Harbor, checking its approved SPKI SHA-256 fingerprint against a trusted owner channel. Retain Harbor's Ed25519 receiver signing PRIVATE key and X25519 decryption PRIVATE key locally with 0600 permissions. Use a separate scoped Harbor *receive* token from the Penguin broker, sent only over an authenticated owner-controlled private route. **Do not** paste token values, private keys or customer filenames into issues.
3. Assemble a 0600 owner-private Harbor configuration file **outside Git checkout**, referencing existing private files and a 0700 owner-private destination. The `senderVerifyPublicKeys` map must contain **only** `fallen`. For a first synthetic request, omit optional `intakeStateDir/passportStateDir` until a real, independently scoped Passport actor has been enrolled. Example below is a **shape**, not a real file, not live credentials:

```json
{
  "wing": "harbor",
  "baseUrl": "https://fabric.systemiacommandcenters.com/api/internal/wing-courier",
  "receiveTokenFile": "/approved/private/harbor/receive.token",
  "receiverPrivateKeyFile": "/approved/private/harbor/decrypt.key",
  "receiverSigningKeyFile": "/approved/private/harbor/sign.key",
  "destinationDir": "/approved/private/harbor/custody",
  "senderVerifyPublicKeys": {
    "fallen": "/approved/private/trust/fallen.sign.pub"
  }
}
```

4. Execute **local dry-run only**, on the approved host, with the actual already-created private config path:

```bash
node systemia/wing-courier/install-resident.mjs --wing harbor --config /approved/private/harbor/receiver.json
node systemia/wing-courier/receiver-auth-canary.mjs --wing harbor --config /approved/private/harbor/receiver.json
```

Both operations are non-activating by default. The canary reports `network_check_not_authorized` without `--authorize-owned-network-check`.
5. Only after root-owned Fabric config, public TLS, broker protection, private recipient token and independent identity/key enrollment pass locally, conduct the operator-authorized **read-only** challenge:

```bash
node systemia/wing-courier/receiver-auth-canary.mjs --wing harbor --config /approved/private/harbor/receiver.json --authorize-owned-network-check
```

No network request is sent if private preflight fails. A `403` token rejection or `404` disabled route means **HOLD**, not readiness.
6. If and only if the host operator explicitly accepts the unit install, verify that **no Harbor service already exists** and that a durable user systemd manager is available, then run once:

```bash
node systemia/wing-courier/install-resident.mjs --wing harbor --config /approved/private/harbor/receiver.json --activate --confirm-owned-host
```

Do **NOT** rerun on an existing service. Inspect its status separately. An activated user service only polls the private encrypted Courier inbox. It does not contact Meta, Stripe, customer, Saban or external media hosts.
7. Use a synthetic, no-customer-media **Fallen → Harbor work_packet** and require a real Harbor receiver signature verified by Penguin broker; then sender-side `client.mjs status` independently observes the exact ACK. Verify the **Harbor → Fallen** reverse synthetic direction independently before any approved originals. Only the authentic receiver-signed ACK crosses the transport milestone.

**Live stop conditions:** source only; failed canary; unsupported host/user systemd; missing verified pinned Fallen Ed25519 public identity; no private Harbor receive token; no source rights; no verified synthetic receipt; or any desire to send or charge the customer. Do not force activation past a hold.

**Tracking:** #2294 Courier actual transport, #2414 Harbor pickup status, #2280 first commercial, #2416 company-wide Saban/ForensiScope integration, #2284 customer preview/release freeze.
