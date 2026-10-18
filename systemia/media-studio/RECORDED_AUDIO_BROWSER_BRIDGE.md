# Fallen Recorded Audio | Browser custody bridge | Review held

Mission: evercraft-continuity-2026-10-10-001.
Branch: feat/fallen-recorded-foley-custody-20261014.  Avoid duplicate work with Instrument Foundry PR #1371.

## Audited baseline
- Original recorded-audio-custody.mjs verifies SHA-256 and an Ed25519 reviewer signature over exact metadata. Its 'accepted_for_ingest_review' is not legal verification, playback proof, or permission to publish. 14 focused tests passed on Node 22.
- Existing PulseGridBrowserAudioAssetVault.ingest accepts local files, computes content digest, decodes audio, stores them in IndexedDB, and returns an asset. The Fallen Sessions UI defaults ordinary imports and recordings to rights='unknown'.
- The Instrument Foundry draft PR #1371 independently implements WAV sample verification, resolver authentication, playback scheduling, performance controls, capture QA, and test workflows. This bridge is limited to signed review intake and does not duplicate those capabilities.
- Current checkout on the accessible host is not a live repository clone. GitHub file readbacks are authoritative for this branch. CI for the custody branch has not run.

## Bridge contract
The new browser module checks a independently pinned Ed25519 reviewer's public key using WebCrypto, the exact canonical signed metadata payload, current file bytes, and strict WAV/FLAC/OGG declared container correspondence. It then passes the already-verified Blob to the *existing* canonical vault using rights='unknown'. This deliberately does NOT claim a license or publish. The vault method is opt-in and never changes the normal import workflow.

WebCrypto Ed25519 and WAV/FLAC/OGG decoding must be available to the client runtime. The key cannot be read from the uploaded audio, its manifest, Drive, or a self-attested source; secure host provisioning is required. No key is enrolled by this patch. No production UI button is enabled without that enrollment. This code does not prevent later rights revocation and is not a commercial release gate.

## Tests and blockers
- 19 browser attestation/byte-integrity/negative-control tests and 14 original Node custodian tests passed locally; 33 total.
- Integration exposure is through PulseGridBrowserAudioAssetVault.ingestReviewedRecording and the existing pulsegrid-browser.ts barrel, without changes to FallenSessions UI, playback engine, legacy stored assets, or main.
- Independent full Forge TypeScript lint, browser end-to-end playback, live Saban/Systemia admission, actual registered signer trust, source license review, artist listening and external release remain unverified.
- Real rights-clear microphone/recorded sample acquisition and live browser playback cannot be inferred from synthetic fixtures.

Do not merge this branch to main or auto-run production workflows on the basis of source-level tests alone.