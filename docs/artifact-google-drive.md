# Evercraft Artifact Custody: Google Drive v0.4 adapter (review only)

This **code is not deployed**. It adds a Google Drive v3 resumable-upload/metadata/download adapter to the existing `preserveArtifact` coordinator. It is explicit-invocation only; there is no scheduler, automatic Drive authorization, OAuth token refresh, GitHub Actions credential, signer enrollment, Systemia server hook, or machine installation.

## Private-runner contract

Requires Node.js 22, a **short-lived OAuth access token** with appropriate Drive permission, a previously approved **private Drive folder ID**, and write access to a private local custody ledger. The token must be provisioned by a private identity broker, not committed, written to a shell command, or pasted into a chat. No service account, private key, or refresh token is included in the package.

The private environment variables are `GOOGLE_DRIVE_ACCESS_TOKEN` and `EVERCRAFT_CUSTODY_DRIVE_FOLDER_ID`. The call must be explicitly invoked:

```bash
node scripts/artifact-preserve-drive.mjs \
  --source /private/artifacts/release.zip \
  --project quantum-foundry --version v0.4 \
  --custody-dir /private/evercraft-custody-ledger \
  --execute authorized-private-upload
```

This is a specification example, **not a request for the user to manually run it**. Production token acquisition, least-privilege access and adapter lifecycle belong to the owned Systemia private execution environment, which is not connected to this code today.

## Exact behavior

1. The coordinator fingerprints the original artifact, stages it privately, and creates a unique receipt folder.
2. The adapter creates a Google Drive v3 resumable upload session under the explicitly approved folder using the supplied OAuth token. Its upload-session URL must be HTTPS on an allowed Google API hostname and `/upload/` path.
3. The adapter uploads the bounded artifact and immediately reads back Drive metadata. It requires the returned ID, sole expected parent, exact object name, and size.
4. The adapter downloads the object through Drive API `alt=media` into a temporary file, refuses symlink and preexisting destinations, and returns the bytes to the coordinator.
5. The coordinator checks that the original source is unchanged and that the restored copy has the same size and SHA-256 digest. A private `02-roundtrip.json` is written only after success; errors create `09-failure.json`.

The adapter uses a **128 MiB maximum** by default and buffers an upload to avoid unconsumed file streams after immediate HTTP failures. Larger files need a separately reviewed chunked streaming implementation before production use. Upload failures may leave unverified, unfinished Drive objects; never treat them as successful backups. The code doesn't perform cleanup/deletion of remote objects, which should require separate policy and audit receipts.

## Claims deliberately not made

- `backup_roundtrip_attested=false`: a matching download is not an independently signed provider attestation.
- `provider_authentication='not_independently_attested'`: a test adapter, configured OAuth token, or Google-looking object ID is insufficient for a separate trust claim. Signed evidence, token identity, account custody, immutable version binding and authorization checks are still required.
- Device installation, deployment, release approval, and publication remain **unverified**.
- The private Drive connector used interactively from ChatGPT is **not** the unattended Google Drive API adapter in this repository.

## Security and rollout gates

The code never accepts an arbitrary Drive folder path or caller-specified upload endpoint. Tokens remain runtime-only, never logged or written to receipts. Public CI uses a fully in-process fake Google API; it never contacts Google, never uses account credentials and never handles customer or proprietary artifacts.

Before production: a private OAuth broker with short-lived scopes and rotation; concrete owner-approved folder allowlist; independent provider identity and version-scoped signed receipts; content/sensitivity classification; executable and archive safety review; logging and recovery for upload timeouts; idempotence/partial object handling; re-check after key renewal; and Systemia release admission. Do not enable unattended uploads, merge this PR, or attach production credentials based solely on offline tests.
