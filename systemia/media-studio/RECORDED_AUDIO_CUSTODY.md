# Fallen | Recorded audio custody and licensing review gate

**Mission:** `evercraft-continuity-2026-10-10-001` / Graphics Department audio research.  **State:** code proposal, not live Systemia admission, renderer integration, new recording acquisition or public release.

This is an offline/read-only intake preflight for recorded Foley candidates. It addresses an existing gap between PulseGrid's SHA-256 byte vault and human-approved rights verification. It does **not** change `pulsegrid-asset-vault.ts`, `timeline-export.ts`, the audio master, existing production policies or any customer-facing route. Its deliberately narrow result is `accepted_for_ingest_review` (never `publicationAuthorized:true`).

## Usage on a trusted workstation

```
node systemia/media-studio/recorded-audio-custody.mjs \
  --manifest ./audio/custody.json \
  --assets-dir ./audio/samples \
  --public-key /TRUSTED/LOCAL/approved-reviewer-ed25519-public.pem \
  --output ./audio/REVIEW_RECEIPT.json
```

The public key is a **trust anchor** delivered and pinned by the machine owner independently from Drive/GitHub, never accepted from the asset package itself. The gate does not generate keys, upload files, fetch URLs, inspect permissions on remote sites or execute input audio. Output is an immutable new report (`wx`, no overwrite). Exit code 0 means only the local bytes and signer's attestation were verified, not that the license is legally valid or the item may be released.

## Example manifest format (illustrative, NOT an approval)

```json
{
  "schema": "evercraft.fallen.recorded-audio-custody.v1",
  "assets": [{
    "assetId": "switch-01",
    "relativePath": "switch.wav",
    "sha256": "64_lowercase_hex_characters_of_the_audio_file",
    "licenseId": "CC0-1.0",
    "sourceUrl": "https://example.org/recording-source",
    "licenseEvidenceUrl": "https://example.org/rights-page",
    "attribution": "",
    "review": {
      "schema": "evercraft.fallen.recorded-audio-review.v1",
      "decision": "approved",
      "reviewedBy": "reviewer-id",
      "reviewedAt": "2026-10-14T20:00:00Z",
      "signature": "base64-Ed25519-signature-of-approvalBytes(asset)"
    }
  }]
}
```

The reviewer must authenticate the **real source, rights, license scope, ownership, and required credit** before issuing an Ed25519 signature for `approvalBytes(asset)`. A manifest's statements are untrusted without that attestation; even a valid signature attests a human review claim rather than proving copyright ownership or an external site's current state. `CC-BY-4.0` requires a nonblank attribution; other licenses are denied by default, with an explicitly claimed owned-recording category (`LicenseRef-Evercraft-Owned`) requiring independent ownership evidence review.

### Rejection cases

- No independently pinned Ed25519 reviewer key; missing/forged/replayed-to-another-file signature
- Changed file bytes or digests, duplicate asset IDs, altered license/source/credit fields
- Missing rights evidence, non-HTTPS links, unknown license, missing CC-BY attribution
- Directory traversal, symlinks outside the approved directory, wrong file extensions, fake WAV/FLAC/OGG headers, empty/oversized input

This is **not** full media decoding. FFprobe duration, codecs, channel count, loudness, noise, listening review, attribution presentation, Systemia approval, sourcing and publication clearance remain separate gates. A reviewer must explicitly authorize any use in production.

## Test (no network, no secrets, no changes to other files)

```
node --experimental-strip-types --test systemia/media-studio/recorded-audio-custody.test.ts
npm run test:media-studio
```

Tests use ephemeral local Ed25519 keys and a tiny synthetic WAV fixture that must **never be treated as production-recorded Foley**. Tested locally outside the repository before PR: 14/14 passed using Node 22. Repository-wide test and CI are pending independent execution.

## Continuity V7 evidence state

The existing V7 samples bundled from LibreOffice remain **uncleared internal evaluation audio**. No signed license approval or verified original CC0 bytes are present in this patch. Do not rename the V7 review cuts as CC0-sourced, promote them to Clip, or use them in paid client media until a trusted reviewer and downstream editorial gate approve the actual media.

## Integration next

1. Verify reviewer's key enrollment and source permission through Systemia, without putting private keys on Drive.
2. Require this report before the existing PulseGrid vault accepts a recorded Foley clip for a commercial asset; bind report to the exact asset digest and release context.
3. Keep the existing mix mastering and `master-qc` separate. Run real-ear creative review before authorizing video publishing.
4. Attach exact case/source refs, actual origin, license text, and test results to the eventual production receipt. No new workflow schedules or credential scopes are required in this PR.
