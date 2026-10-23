# Evercraft Artifact Preservation Coordinator v0.3

**Review-only implementation.** This is an explicit, adapter-driven archive coordinator, not a deployed Google Drive agent, a Systemia service, an installation utility, or an automated publisher.

## Why it exists

ChatGPT file links are not proof that an artifact is retained in durable storage. The backup procedure must be attributable and verifiable: `source -> staging -> adapter upload -> adapter download -> SHA-256 check -> append-only private evidence`. Installation, Git source commits, release approval, and publication stay separate.

## Pipeline interface

Node.js 22 ESM:

```js
import { preserveArtifact } from './scripts/artifact-preservation.mjs';
// `approvedPrivateAdapter` is an independently implemented, authenticated
// and reviewed adapter in a separate private trust boundary.
const report = await preserveArtifact({
  source: '/private/project/build.zip',
  project: 'lightforge',
  version: 'rc04',
  adapter: approvedPrivateAdapter,
  custodyDir: '/private/evercraft-custody-ledger',
});
```

The supplied `adapter` MUST implement `put({source, key, expected})` and `restore({handle, destination})`. `put` returns `{provider, object_id, version_id, account_scope}`. A provider name, returned ID, cloud-looking link, and even a matching download **do not** independently authenticate the provider. A future signed attestation may only be issued after checking provider account and object provenance with a separately trusted verifier. Never place object IDs, account scopes, customer artifacts, token-bearing URLs, provider keys, or private ledgers in the public repository.

`localFixtureAdapter(root)` exists only for unit/integration testing. It copies files to another local fixture directory and never connects to Google Drive. It supports identical repeat files without overwriting existing bytes.

## States and boundaries

The coordinator writes separate, owner-private (`0600`) JSON receipts:

- `00-preflight.json` after local staging and SHA-256 verification
- `01-upload.json` after an adapter-reported object handle
- `02-roundtrip.json` only after readback SHA-256 and source recheck match
- `09-failure.json` when any stage fails; it records phase and error class, omitting error text that could expose tokens

It uses a new private run directory for every attempt. The temporary staging and restored bytes are removed at the end of the run, including failures. Retrying a failed run requires an explicit new invocation. No scheduled scans, background jobs, or remote operations are enabled by this repository.

`state='byte_verified'` means *only* that the file handed back by the configured adapter equals the source bytes. All returned reports specify `backup_roundtrip_attested=false`, `provider_authentication='not_independently_attested'`, `device_install='unverified'`, and `publication='unverified'`. If the source changes during upload/readback, the run fails. Adapter errors and mismatching bytes fail closed.

## Safety limitations

The simple file-name denylist is not a full secret scanner. The caller must classify artifacts before passing them to a real adapter, honor user consent and privacy, and block personal data, customer files, unlicensed assets, and credentials unless explicitly authorized for the named private destination. Do not add long-lived credentials to GitHub Actions or embed them in commands. Do not merge this pipeline with deployment automation. Production approval requires authenticated Drive adapter, constrained destination policy, least-privilege identities, remote version-bound receipts, independent round-trip verification, expiry/rotation and key governance, privacy classification, crash-retry strategy and a machine-authoritative Systemia receipt.

## Validation

`node --test tests/artifact-custody.test.mjs tests/artifact-roundtrip.test.mjs tests/artifact-preservation.test.mjs`

Tests run offline with a local fixture adapter, including corruption, missing provider handles, symlinks, duplicate uploads, error privacy and source mutation. CI only runs tests, without upload credentials or artifact publication rights.
