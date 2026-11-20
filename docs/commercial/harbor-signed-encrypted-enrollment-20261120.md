# Harbor private enrollment | signed one-time ciphertext pickup

**Status: source-only candidate. No Harbor machine access, authenticated owner keys, private token issuance, service activation or customer-media transport was performed.**

This extends Evercraft's existing **Fallen** one-time signed enrollment bootstrap with a distinct, **disabled-by-default Harbor** route. The real problem is not GitHub read permissions: Harbor's #2414 status said its Courier receiver was not configured and independently authenticated private enrollment was HOLD. The new route allows a real owner-controlled Harbor host to obtain its **pre-existing owner-prepared encrypted enrollment package** without GitHub, chat, a public file share, third-party host, or a new generic file API.

## Contract and isolation

- Exact fixed route: `https://fabric.systemiacommandcenters.com/api/internal/wing-enrollment/v1/harbor`.
- `EVERCRAFT_HARBOR_BOOTSTRAP_ENABLED` must explicitly equal `1`. Other Harbor env entries cannot silently enable it. Off returns `404`.
- Require separate Harbor **Ed25519 public signer** enrolled and independently pinned on Penguin. Harbor signs a one-time challenge with its **local private signing key**. Only the exact, already-encrypted `evercraft.harbor.receiver-enrollment.v1` file (bound to its recipient X25519 public SPKI fingerprint and SHA-256) may leave Penguin.
- Challenge: 192-bit nonce, bounded lifetime (default 60s), consumed even when signature is wrong. Success leaves an exclusive private 0600 **role-qualified marker** in an already existing 0700 claim directory. Subsequent claims return `410` across restarts and processes.
- A separate `fallen` route and its own marker continue working unchanged. Neither role may use the other role's recipient-enrollment schema or route.
- Harbor's retrieval client `systemia/wing-courier/retrieve-harbor-bootstrap.mjs` demands the **independently verified** SHA-256 of the encrypted package and Harbor X25519 recipient fingerprint *before* it will contact the owned Fabric endpoint. It checks exact challenge pins, expiry, signed claim response, ciphertext digest, final recipient schema, and writes an exclusive 0600 private file with no output contents. It does not decrypt/install credentials or run a service.

### Owner-only setup prerequisites

1. On the **real Penguin** private operator runtime, independently verify source provenance; obtain Harbor's actual existing Ed25519 public signer and Harbor X25519 public recipient key and compare public SPKI SHA256 pins over an **out-of-band authenticated owner channel**. GitHub comments and synthetic test keys are not that proof. No new keys, private credential or customer footage in GitHub.
2. On **Penguin's approved private operator account**, the owner first confirms a real, separate, scoped Harbor *receive* token already exists as a local 0600 token file and independently pins Harbor's X25519 public recipient SPKI SHA-256. Use the **new offline encrypted package generator**, which reads that one token and encrypts it for Harbor under an ephemeral X25519 key, HKDF-SHA256 and AES-256-GCM with role/recipient-bound AAD. It writes exactly one 0600 `evercraft.harbor.receiver-enrollment.v1` JSON envelope with no plaintext token and reports a SHA-256 for separate independent verification:

```bash
node systemia/wing-courier/harbor-enrollment-package.mjs --prepare \
  <private-penguin-harbor-receive-token-file> \
  <verified-harbor-recipient-public-x25519-key> \
  <independently-verified-harbor-recipient-spki-sha256> \
  <new-penguin-private-harbor-encrypted-package>
```

The tool never generates/replaces the real scoped broker token. The package must be newly created, privately stored, and SHA-pinned; do not use arbitrary plaintext JSON under the Harbor schema.
3. Create a dedicated or deliberately controlled 0700 claim directory in owner-private state, without symlinks. Preserve claim markers across reboot and release; do not delete a marker to force replay.
4. Only after privileged review of the Fabric HTTPS route and its bearer-only Courier separation, the private Fabric environment may stage **paths and hashes only** (the actual private token or any encrypted package bytes must not be placed in env or GitHub):

```text
EVERCRAFT_HARBOR_BOOTSTRAP_ENABLED=1
EVERCRAFT_HARBOR_BOOTSTRAP_PACKAGE=<owned-private-encrypted-package-path>
EVERCRAFT_HARBOR_BOOTSTRAP_SIGNER_PUB=<verified-harbor-ed25519-public-key-path>
EVERCRAFT_HARBOR_BOOTSTRAP_SHA256=<independently-verified-64hex-of-exact-encrypted-package>
EVERCRAFT_HARBOR_BOOTSTRAP_RECIPIENT_FP=<independently-verified-64hex-of-harbor-x25519-spki>
EVERCRAFT_HARBOR_BOOTSTRAP_CLAIM_STATE_DIR=<owned-private-0700-claim-dir>
```

All values shown are **placeholders**, not production inputs. Never enable remote routes from GitHub or a generated task. If the real TLS proxy or running Fabric version does not route the exact Harbor endpoint securely, **HOLD**. Do not conflate HTTP 404 on a stale deployed Fabric with an enabled safe service.

5. On Harbor's **real owned machine** only, after verifying its private Ed25519 signer and recipient fingerprint against the authorized owner, an authorized operator may fetch:

```bash
node systemia/wing-courier/retrieve-harbor-bootstrap.mjs --fetch \
  <private-harbor-sign-key-path> \
  <new-private-ciphertext-output-path> \
  <independently-verified-package-sha256> \
  <independently-verified-harbor-recipient-x25519-spki-sha256>
```

The client defaults to **HELD** without `--fetch`. It requires a new path under a pre-existing owned 0700 private folder and never emits package contents, tokens, source filenames or private keys in its status. The response is **ciphertext**. A separate, permission-checked local decryption and **exclusive 0600 token installation** is now available on Harbor's actual machine:

```bash
node systemia/wing-courier/harbor-enrollment-package.mjs --open \
  <private-fetched-harbor-encrypted-package> \
  <private-harbor-x25519-decrypt-key> \
  <independently-verified-encrypted-package-sha256> \
  <independently-verified-harbor-recipient-spki-sha256> \
  <new-private-harbor-receive-token-file>
```

This decrypts only after SHA-256, X25519 recipient identity, authenticated AES-256-GCM tag and strict token-format checks. The token is **never printed**. The returned status still says broker auth NOT VERIFIED and resident NOT ACTIVATED. Then configure the explicit Harbor receiver config and run `--wing harbor` default dry-run and read-only authenticated inbox canary, followed by an owner-approved service installation only if all independent checks pass.

### Admission and operations remain separate

After private enrollment, require a genuine owned Fabric / broker 401→authenticated Harbor inbox 200 read-only canary, private Harbor user-service preflight, and explicit activation once. Prove a synthetic **Fallen → Harbor** bundle with actual Harbor-signed custody ACK independently read back by Fallen, then a synthetic **Harbor → Fallen** signed ACK, before asking Harbor to send any of the 12 reported customer originals. Once received, Systemia's Passport, Saban, ForensiScope, Fallen QC, Harbor preview, Payments and Shipping remain individually governed. Rejected previous customer preview #2284 stays frozen.

Source tests: `node --test systemia/wing-courier/enrollment-bootstrap.test.mjs systemia/wing-courier/harbor-bootstrap.test.mjs systemia/wing-courier/harbor-enrollment-package.test.mjs`

Tracking: Courier owner-host #2294; Harbor pickup #2414; company-wide #2416; first commercial #2280.
