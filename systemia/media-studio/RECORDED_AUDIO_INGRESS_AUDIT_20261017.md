# Evercraft | Fallen audio ingress audit and bridge | 2026-10-17
**Status:** source checkpoint on `feature/fallen-recorded-audio-vault-20261017`. NO production merge/deployment, commercial-use approval, uploaded new recordings, or live audio playback.
**Scope:** existing Fallen Media Studio, PulseGrid BrowserAudioAssetVault, original Ed25519 recorded-audio custody gate, Instrument Foundry PR #1371, audio mastering and release authority.

## Confirmed observations
- GitHub authenticated access is available; `jgaethle10/forge-operator` is writable. Original `feat/fallen-recorded-foley-custody-20261014` diverged 206 commits behind `main` when inspected. To avoid unsafe merge drift, this change was ported to a fresh branch starting at current `main`.
- `PulseGridBrowserAudioAssetVault` stores audio bytes content-addressed by SHA-256 in IndexedDB, and verifies digests on reads; the existing ordinary Fallen UI imports files as `rights:'unknown'`. Normal imports and local microphone takes are unchanged by this patch.
- Original Node custody gate verifies claimed review metadata signed by a locally trusted Ed25519 key and actual WAV/FLAC/OGG file hash. It does *not* verify the external license or authorize release. 14 local tests green.
- New browser-side bridge verifies the *same canonical signed payload* using WebCrypto Ed25519, accepted license identifiers, source URLs, media container, and exact immutable Blob SHA-256. 19 local tests green, including forged signatures, altered bytes, malformed WAV, wrong container, path traversal declaration and mis-stated rights.
- Explicit `PulseGridBrowserAudioAssetVault.ingestReviewedRecording(blob, reviewedAsset, pinnedReviewerPublicKeyPem)` and matching `pulsegrid-browser.ts` exports call the existing storage pathway. All reviewed recordings **remain `rights:'unknown'`**. An opt-in reviewed import does not affect ordinary import behavior or claim a recording legally cleared.
- PR #1371 independently advances the canonical Fallen/PulseGrid audio instrument path, including resolver/capture/playback technology. No duplicate recorded-piano engine was started.

## High-priority risks and holds
1. **P0, release authority:** A signature is a reviewer assertion, not actual copyright clearance, grant, business-owner approval, or platform publication authority. No trusted reviewer public key is enrolled into live user browsers. Do not accept keys from an uploaded manifest or Drive.
2. **P0, untrusted general rights labels:** The canonical graph represents `owned|licensed|unknown|restricted`, but those values are not independent rights evidence. Downstream commercial render and publishing policy must demand *separate source/legal clearance*, not trust arbitrary client labels.
3. **P0, audible quality:** No real speaker-listening pass, captured original Foley, or founder-approved replacement sound exists in this patch. V7 legacy sample provenance is still uncertain.
4. **P1, branch CI:** 33 local Node tests passed; no independent GitHub Actions run exists for this new branch yet. The dedicated workflow is path-scoped, PR-triggered, and intentionally not executed merely by committing.
5. **P1, creative & platform gates:** No Web Audio playback proof, full-repository typecheck, public URL/Clip distribution, Saban worker acceptance, Systemia mission-admission receipt, or signed host commissioning was observed.
6. **P1, cross-branch sequencing:** Deduplicate release logic with Instrument Foundry PR #1371 before merge; avoid changing its sampled-instrument authority/cache/playback components in parallel.

## Engineering release contract
- First verify full CI and mainline compatibility; run original Node + browser negative controls and PulseGrid regression under a review PR.
- Enroll a trusted reviewer public key through an independently authorized host policy, not an uploaded user asset.
- Independently examine the original recording's actual license, attribution and applicable distribution context; issue revocable, scope-bound rights approval outside the browser graph. Refuse commercial release without it.
- Exercise real owner-approved browser: input bytes -> reviewer proof -> verified vault ingest -> authored timeline -> sound editor -> mix/loudness QC -> human listen -> documentary/synthetic visual truth gate -> Clip/publishing receipt.
- Preserve all existing V2–V7 assets for rollback. This branch makes **no public-facing rollout**.

## Local proof
Node 22: 14/14 original custody checks; 19/19 browser custody/negative controls; all source files and test logs archived in the Evercraft Continuity Mission 001 Google Drive folder. Repository CI and real-device QA remain separate evidence states.
