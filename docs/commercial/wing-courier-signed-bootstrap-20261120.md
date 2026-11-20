# Fallen receiver bootstrap | signed ciphertext retrieval (source gate)
Date: 2026-11-20. **Draft/source only; not deployed or authorized.**

Purpose: connect NextGen's existing Fallen X25519/Ed25519 identity to the live Penguin Wing Courier broker without USB, GitHub-hosted ciphertext, SSH, arbitrary commands, or customer files.

The opt-in Fabric route is `/api/internal/wing-enrollment/v1/fallen`, separate from authenticated Courier APIs. It is **404 by default**, fixed to the owned Fabric host, and serves only the exact operator-pinned encrypted enrollment JSON. There is no file path parameter.

## Identity and operator gates

- NextGen's pinned signer Ed25519 SPKI SHA-256 is `f928395925508f85db7e394cbe745dacd5a7e949891726f1de9958f5415b6bd9`. The running Penguin broker's trusted Fallen signing key previously matched this value; verify again at deployment.
- NextGen's pinned recipient X25519 SPKI SHA-256 is `eebd0eb18ff928eaee284fa9b584bd9d981e2091c40fb1708d8129a94799867a`.
- The already-created encrypted package SHA-256 is `b3c4dbc7e2cf167291257d64bab60b174763b3512f5fed4da4e14580ff4a4491`. The source file stays in Penguin's private `0700/0600` storage.
- The owner must independently verify the live TLS origin, signer pin, private package file, and authoritative deployment before enabling anything.
- Challenge GET yields a random 192-bit nonce with a 60s expiration. POST requires a valid Ed25519 signature over the exact nonce, package hash, recipient fingerprint, and protocol schema. A nonce is consumed even if a signature fails. One successful claim atomically creates an exclusive 0600 marker under a pre-existing 0700 owner-private claim-state directory, and further claims return 410 **including after restart**. A crash during delivery still consumes the claim, requiring explicit operator recovery rather than automatic replay. Disable the temporary route promptly after the signed receipt; the marker must not be deleted during routine deployment or restarts. This is an operator-supervised bootstrap, not a general enrollment issuance service.
- Only ciphertext is returned. This doesn't transfer customer media, authorize Passport intake, install receiver credentials, enable resident service, or allow previews/payments.

## Source tests

`node --test systemia/wing-courier/enrollment-bootstrap.test.mjs`

## Owner-side activation (NOT executed by PR)

The Fabric process needs four explicit environment values **only after owner approval**:

```
EVERCRAFT_FALLEN_BOOTSTRAP_ENABLED=1
EVERCRAFT_FALLEN_BOOTSTRAP_PACKAGE=/home/jessegaethle10/.local/state/evercraft/wing-courier/fallen-receiver-enrollment.enc.json
EVERCRAFT_FALLEN_BOOTSTRAP_SIGNER_PUB=/home/jessegaethle10/.local/state/evercraft/wing-courier/trusted/fallen.sign.pub
EVERCRAFT_FALLEN_BOOTSTRAP_SHA256=b3c4dbc7e2cf167291257d64bab60b174763b3512f5fed4da4e14580ff4a4491
EVERCRAFT_FALLEN_BOOTSTRAP_RECIPIENT_FP=eebd0eb18ff928eaee284fa9b584bd9d981e2091c40fb1708d8129a94799867a
EVERCRAFT_FALLEN_BOOTSTRAP_CLAIM_STATE_DIR=/home/jessegaethle10/.local/state/evercraft/wing-courier/claim-state
```

Create and verify the claim-state directory separately as owner-only mode 0700 before enabling Fabric. Preserve it across deployments and restarts. Fail closed if that directory is missing, writable by others, or symlinked.

Never put these env values into a public browser, and never write private signing/decryption keys or bearer credentials to GitHub. In particular, do not enable the route until runtime source provenance and startup behavior under these flags are verified. A stale Fabric binary will not contain this handler.

On NextGen, after the route is verified active and approved, the owner-local operator may execute:

```
node systemia/wing-courier/retrieve-fallen-bootstrap.mjs --fetch \
  "$HOME/.local/state/evercraft/wing-courier/keys/fallen/sign.key" \
  "$HOME/.local/state/evercraft/wing-courier/fallen-receiver-enrollment.enc.json"
```

Its destination parent directory must already be private (0700). It verifies the pinned challenge and SHA-256, writes the **ciphertext only** as a new private 0600 file, and emits a nonsecret receipt. The encrypted package's payload is still a bearer credential: never post its contents or plaintext to ChatGPT.

After retrieval, perform a **separate local decrypt and credential installation** using the already-established X25519 private key and strict 0600 ownership; validate authenticated HTTP 200 through the existing receiver-auth-canary. Do not start a resident or transfer customer media until the independent receiver readiness gate passes.

Track existing deployment issue #2294. No separate customer-facing release is authorized.
