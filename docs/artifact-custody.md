# Evercraft Artifact Custody Engine v0.2

A deliberately offline, fail-closed **local integrity and attestation verifier**. This is NOT a backup uploader, device installer, publication system, Systemia service, or proof that a cloud provider was contacted. It is a reusable foundation for binding artifact hashes to independent evidence.

## Quick start

Requires Node.js 22. No packages, credentials, accounts, or network access required.

```bash
node scripts/artifact-custody.mjs prepare --root ./my-project --project quantum-foundry --version v0.2 --out ./my-project.manifest.json
node scripts/artifact-custody.mjs inspect --root ./my-project --manifest ./my-project.manifest.json
node --test tests/artifact-custody.test.mjs
```

`prepare` reads files in the selected folder, skips symlinks and common secret names, hashes included regular files and writes an atomic-ish local receipt. It does **not** read or upload a Google Drive folder. Secret scanning is intentionally a minimal exclusion filter, not a guarantee that files contain no sensitive data. **Keep project-specific manifests private**, because filenames themselves can disclose information.

The `inspect` output explicitly distinguishes local SHA-256 verification from the stages `backup_roundtrip`, `git_commit`, `device_install`, and `publication`. Without valid independent attestations each stage remains `unverified`, including when the source is perfectly intact.

## Optional trust-gated attestations (future adapter contract)

Trusted external verifiers can produce an array of JSON attestations, then `inspect` can check signatures:

```bash
node scripts/artifact-custody.mjs inspect --root ./my-project --manifest ./my-project.manifest.json \
  --receipts ./private-signed-attestations.json --truststore ./private-trust-anchors.json \
  --require backup_roundtrip
```

Each attestation has these fields:

```json
{
  "schema": "evercraft.artifact.attestation.v1",
  "issuer": "private-backup-verifier",
  "stage": "backup_roundtrip",
  "artifact_sha256": "<sha256 of the exact local artifact>",
  "artifact_path": "path/relative/to/project",
  "observed_at_utc": "2026-10-23T19:00:00Z",
  "evidence_id": "<private verifier receipt ID>",
  "signature_base64": "<Ed25519 signature>"
}
```

The signature covers a UTF-8 JSON object with the first seven listed fields, in that exact order, using `canonicalClaims` in the JS module. The verifier must confirm the remote bytes and authoritative provider identity **before** signing, and independently retain detailed evidence. The truststore maps issuer names to authorized `stages` and a PEM-formatted Ed25519 `public_key_pem`.

**Security:** Signatures only prove control of a trusted key, not that an issuer was honest or a provider was really contacted. Production signing keys, issuer enrollment and provider API receipts must be governed separately in a private trust boundary. Never put signing keys, account tokens, customer files, or real recovery manifests in the public repository. A trusted fake receipt can still lie. This prototype does not establish cryptographic timestamp freshness, artifact ownership, publishing rights, or operational authorization.

`--require STAGE` exits with code 3 when not all artifacts have an authorized valid attestation for that stage. Local hash mismatch exits with code 2. Bad arguments/JSON exits with code 1.

## Systemia integration gate

Proposed Systemia workflow: local manifest -> authenticated private Drive upload -> server-side listing & size -> authenticated byte roundtrip -> signed backup evidence -> Git commit proof -> independently signed device installation evidence -> approved publication evidence. Keep every step distinct. No background upload or privileged action is enabled by this package. The existing Drive recovery validator remains authoritative for its separately scoped migration inventory; this new tool must not replace it without a reconciled design and tests.

## Boundaries

- No network, no fetch, no Git push, no data exfiltration, no automatic installation, no publishing
- Does not change any service or device
- Local file hash is only local-integrity evidence, not cloud backup evidence
- `inspect` checks passed trust keys, but independent identity assurance and provenance remain upstream responsibilities
- For private Evercraft archive reconciliation, use the private Drive custody manifest, not code committed publicly

## v0.2: local restored-snapshot comparison

The additional no-network command compares the *actual downloaded bytes* with the retained original snapshot:

```bash
node scripts/artifact-roundtrip.mjs --original /private/original.bin --restored /private/restored-from-drive.bin --out /private/comparison.json
```

It checks exact bytes via streaming SHA-256 and size, rejects missing files, directories and symbolic links, and refuses to overwrite either input or an existing report. Exit codes: 0 identical, 2 mismatch, 1 invalid input or unsafe file. Comparison reports omit local paths but include hashes and sizes. A match is **not** a signed Google Drive receipt, does not validate who downloaded the copy or where the bytes originated, and never authorizes publication, Git commits or device installation. `backup_roundtrip_attested` is always false. A future authorized private connector adapter must independently record authenticated Drive file ID, account identity, downloaded bytes, upload correlation, timestamps, and a trusted signed receipt before any custody stage can be promoted.

The local inspection gate has also been hardened: signed stage attestations never promote an artifact whose local bytes are missing or mismatched, even if the signature itself is cryptographically valid. The existing separate Systemia drive recovery workflow remains authoritative for its own migration scope.

An isolated path-scoped, read-only GitHub workflow runs both test files. It has no secrets or deploy privileges, does not fetch private user artifacts, and does not automatically publish anything.

## v0.3 preview: adapter-driven preservation

See `docs/artifact-preservation.md` and `scripts/artifact-preservation.mjs`. The explicit coordinator runs a staged upload/download/verify workflow with a supplied adapter, retains private per-phase receipts, detects byte mismatches, and never treats an adapter assertion as independently authenticated cloud storage. This PR contains only an offline local-fixture adapter; real Google Drive credentials, Systemia admission, unattended jobs, device installation, and publication are not enabled. The private real Drive backup operations performed through ChatGPT are separately documented in the owner's private Recovery Vault, not embedded in this public source tree.
