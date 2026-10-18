# Evercraft Instrument Foundry | Canonical PulseGrid bridge (draft)

This is an engineering slice of **Fallen Sessions / PulseGrid**, not a standalone DAW and **not a release-ready grand piano**.

## Why
The frozen *Weight of Silence* reference recording is the creative quality floor. The sample-free oscillator replacement was rejected after human listening. Instead, Evercraft is developing a recorded/expressive instrument pipeline with clear custody, verified source WAV bytes, and no invented license grants.

Foundry v1 already exists as an offline capture-plan and recording renderer in the founder's workspace (172 score-targeted slots, 9 local Python tests). It has **no owned acoustic captures yet**. This PR adds the **PulseGrid admission layer** for WAV assets after the offline capture/render step. It does not import founder workspace files or imply studio recordings occurred.

## Contracts
- `compileFoundryImport({session,assets,attachments})` validates canonical `PulseGridSession` identity and existing *audio* tracks, conservative rights, content-addressed asset IDs, provenance, bounds, and no silent replacement; it returns the canonical `asset.register_audio` + `clip.attach_audio_asset` operations as a transaction request.
- `verifyFoundryWavBytes(asset, bytes)` validates actual RIFF/WAV shape and SHA-256 using `crypto.subtle` (browser/Node), rather than trusting a self-reported manifest.
- **The caller must run byte verification for every asset before invoking** the existing `applyPulseGridTransaction` function, and separately supply a hash-verifying, permission-scoped `PulseGridAudioAssetResolver` for playback. The compiler itself intentionally does not mutate the session or read stored assets.
- The transaction response labels `release_ready=false`, `playback_verified=false`, and `CANDIDATE_NOT_COMMITTED` regardless of a claimed rights state. Commercial sample/master ownership is a separate independent decision.
- The actual performer-owned captures, consent/rights evidence, instrument model and expressive recording QA are not in this PR.

## Tests
```bash
node --test systemia/media-studio/instrument-foundry-bridge.test.mjs
```
Tests cover transaction shape, unknown/restricted rights, forged metadata, custodial collisions, missing/invalid content hashes, cross-track rejection, idempotent asset reuse, and actual byte tampering.

## Next: make the instrument sound beautiful
1. Record/commission a small *rights-clear* grand piano multisample pilot across key dynamic layers and round-robins; document pedal-up/down, dampers, sympathetic resonance, two microphones, performer releases and room impulse responses.
2. Create an expressive performance/voice allocator consuming actual validated samples with pedal-state, voice stealing, key-off and velocity crossfades; do not synthesize missing score notes as if sampled.
3. Integrate the existing canonical PulseGrid audio resolver with **independent byte verification**, expression automation and production source receipts. Validate end-to-end in CI against the canonical session transaction and a browser playback test.
4. A/B test against the frozen original with listening panel; preserve the original if a new timbre makes the music worse.
5. Keep public music release held until external sample rights, musical human authorship and final master clearance have been documented.

**What this branch does NOT prove:** live Foundry samples, recording contracts, production mixing, a new audio engine deployed to users, commercial music rights, or improved expressive sound.


## Verified playback resolution (second engineering slice, v3)

`createFoundryVerifiedResolver` implements the existing PulseGrid audio asset
resolver contract. The host must supply a **trusted** authenticated tenant,
session and audition/review scope, a separate `authorizeRead` guard that
checks actual identity/tenant/project permissions, and a `readBytes` storage
adapter. Do not accept tenant context merely from client-supplied metadata.

The resolver checks identity, format, budgets, and rights before storage;
authorizes every access, snapshots returned bytes before async verification,
and checks actual RIFF/WAVE data and SHA-256. On success it returns a browser
WAV Blob ready for PulseGridAudioEngine.setAudioAssetResolver.

```js
import {createFoundryVerifiedResolver} from './instrument-foundry-resolver.mjs';
const resolver=createFoundryVerifiedResolver({
  scope: authenticatedHostSession, // trusted, never raw user input
  authorizeRead: enforceTenantProjectAndIdentityPermission,
  readBytes: authorizedStoredWavRead,
  onReceipt: auditVerifiedRead,
});
pulseGridAudioEngine.setAudioAssetResolver(resolver);
```

A verified read **is not audible playback proof**. This PR includes
no live host storage connector, credentials, owned acoustic samples,
expressive grand piano, or commercial rights clearance. Unknown rights allow
only independently authorized internal listening; restricted rights and
self-declared release flags are rejected. Reader and verifier must be used
together, not bypassed by a direct Blob URL.

```bash
node --experimental-strip-types --test \
  systemia/media-studio/instrument-foundry-bridge.test.mjs \
  systemia/media-studio/instrument-foundry-resolver.test.mjs \
  systemia/media-studio/instrument-foundry-pulsegrid.integration.test.mjs
```

Next: authorize a real recording storage adapter and run actual
recording -> storage -> verified Blob -> canonical audio decode/playback
in a browser, with separately attributable producer and listener receipts.
Continue holding the rejected oscillator remake out of the master path.


## Founder audition path in Fallen Sessions (third slice)

The `/fallen-sessions` route now has an **Import Foundry WAV** control beside the existing general import. It accepts a locally selected RIFF/WAV file as `rights:'unknown'`, then uses the existing `PulseGridBrowserAudioAssetVault` to hash, decode and retain the recording. Before any canonical transaction it re-reads the stored Blob, independently verifies WAV bytes/format/SHA-256 with `verifyFoundryWavBytes`, and invokes `compileFoundryImport` and the **existing** `applyPulseGridTransaction` to attach the asset to a real Audio Take scene. On Play, the existing `PulseGridAudioEngine` uses the same vault's `getVerifiedBlob` resolver.

The source reference `sha256:<digest>` in this local workflow records **only the content fingerprint of the user-selected local WAV**. It does **not** verify performer attribution, commercial sampling rights, independent host identity or that the file is Evercraft-owned. The authenticated multi-tenant storage resolver remains a separate host-side integration, not a property of local imports.

This special import automatically grows an audio clip up to the existing 16-bar limit based on the current PulseGrid BPM. Longer WAVs fail explicitly rather than being silently truncated. This is for **short piano and string instrument takes**, not for importing the full 68-second master through a single clip. General Import Audio continues to support normal formats and behavior.

**What the code tests prove:** the UI is wired to the canonical transaction and the verified stored-audio path; batch and byte custody tests pass. **What they do not prove yet:** an actual founder device clicked the new UI, audible browser playback of a captured acoustic piano, web deployment or release rights. Use an owned recording for that next end-to-end demonstration and capture the exact build/source/asset/playback receipts.

Run the dedicated workflow and also existing `npm run test:media-studio` / TypeScript check before any merge. The original *Weight of Silence* master is immutable in this change.


## Bounded playable sampled piano (fourth engineering slice)

The canonical **MIDI Keys** synthesizer can now hold a reversible
\`clip.set_foundry_piano_patch\` referencing content-addressed audio assets
already registered in the **same** PulseGrid session. The patch lives on the
canonical clip provenance and survives graph export, undo and session migration.
It is not an independent hidden instrument database.

The first supported patch is \`recorded_piano_v1\`, with explicitly declared
sample root pitch (MIDI 21–108), recorded velocity range, \`release_sec\`,
and a conservative **±2 semitone** maximum transposition. A missing sample,
uncovered MIDI pitch, unrecorded velocity, restricted sample, malformed patch,
or absent verified storage fails **closed**, rather than substituting the old
oscillator synth or claiming the user has a fully sampled grand piano.

During playback, \`PulseGridAudioEngine\` resolves and decodes every referenced
sample through its existing vault-backed asset resolver and schedules an
actual \`AudioBufferSourceNode\` through the existing track bus. The note
uses playback-rate transposition, velocity scaling, a short attack envelope,
and a controlled key-off release envelope. This is **first-generation
sample playback**, not modeled hammer mechanics, multi-mic resonance, piano
pedal sensing, continuous round-robin variation, or a natural-instrument
performance guarantee.

The Fallen Sessions screen exposes an **Import Foundry WAV** control and an
**Arm Recorded Piano** action with an explicit **Piano root MIDI** field. The
founder can import one genuine recording for internal listening, set its root
note, attach it to the canonical \`keys\` MIDI scene, add/play MIDI notes within
two semitones, and undo the assignment. WAV hash proves its bytes only, not
exclusive rights, who performed it, or payment/distribution eligibility.
Broader note-by-note instrument coverage will need more authorized captures.

**Do not accidentally confuse the MIDI sampler with the existing Audio Take
one-shot clip**. The latter plays the complete WAV as a clip. This new
instrument voice is MIDI-triggered and envelope-controlled from a user-selected
root note.

Tests include a real canonical patch assignment and undo, pitch and velocity
coverage, no invented missing notes, cross-track rejection, simulated Web Audio
buffer rate/gain/start/stop events, and the UI's verify-before-arm path.
These are **automated implementation tests**. To claim audible success, capture
the authenticated source WAV, deploy the specific PR build in a supported
browser, press Play, listen to the actual note and tail, and save the
exact source/hash/session/asset/playback and human QA receipts.

The beloved *Weight of Silence* master remains unchanged; no rights clearance,
acoustic piano capture, production release, or proven listening quality is
asserted by this code.


## Reusable multi-note piano bank and Saban review lane

The Fallen Sessions **Arm Recorded Piano** control now **appends** the verified Audio Take sample to the current canonical Keys scene's \`recorded_piano_v1\` patch. The UI exposes the recording's root MIDI pitch and bounded **velocity minimum/maximum**. Subsequent captures at new roots or non-overlapping velocity layers accumulate instead of replacing the first sample. The original recording is detached from Audio Take (not deleted from the asset vault), preventing double playback, and the same reversible PulseGrid transaction preserves undo.

The \`appendFoundryPianoSample\` helper preserves previous layers, validates every referenced sample against registered canonical audio, rejects unregistered/restricted samples, rejects overlapping layers at an identical root, respects the same ±2-semitone transposition bound and refuses missing pitch or unrecorded velocity ranges. Existing sound-quality limits still apply: dynamic layers require **actual distinct recordings**, not amplitude scaling falsely presented as several real performance layers. A patch currently supports no more than 64 declared sample layers, and missing/overlapping coverage is surfaced as an error rather than silently repaired. The studio does not auto-authorize any recording for publication.

### Saban in the review pipeline

Existing \`systemia/media-studio/saban-adapter.mjs\` is reused by \`instrument-foundry-saban-review.mjs\` to run four **parallel planning reviewers**: continuity, rights-requirement, provenance and timing. Saban's current adapter checks **that requirements and references are present**, not the authenticity of legal ownership or musical quality. A wrapper further requires an accepted human-listening receipt and a valid SHA-256 digest, but still reports \`release_ready:false\` and \`sample_rights_independently_verified:false\`.

GitHub Actions runs \`bridge-evidence\` and \`saban-capture-review\` as separate parallel jobs. The CI role checks are **local deterministic adapter invocations**, **not a deployed Saban resident compute worker or autonomous agent reviewing recorded audio**. This gets us faster repeatable preflight without misstating independent creative clearance.

At the first multi-layer commit, GitHub run 39085112409 passed 88/88 bridge tests and 4/4 Saban review tests. The broader Forge workflows are checked separately.

### Remaining proof

1. Capture real consented/licensed multi-velocity acoustic piano notes with room, performer and equipment receipts; verify the actual sources.
2. Test import, accumulation, note selection and audio in a real supported browser, documenting output and source fingerprints.
3. Human A/B against the immutable original *Weight of Silence*.
4. Complete independent rights and distribution-platform review before any commercial master is approved.

No new acoustic samples, deployed instrument, commercial clearance or human-approved new sound quality is implied by a green CI status.


## Technical acoustic-capture quality gate

A verified SHA-256 checksum only proves that bytes match a source. It does **not** establish the recording is musically useful. The new \`instrument-foundry-capture-qa.mjs\` analyzes the **actual PCM/float samples** in a WAV and reports bounded, reproducible technical metrics before the canonical piano bank may accept it:

- RIFF/WAVE, codec, channel count, sample rate and block alignment. Accepted: PCM16/24/32 and IEEE float32; mono/stereo; 44.1/48/96 kHz; 0.3–15 seconds; maximum 64 MiB.
- Measured peak, RMS, the final 70 ms tail RMS, DC offset, non-finite samples, clipped-sample count and total samples inspected.
- A near-silent recording, sustained sample clipping, excessive DC bias, non-finite/out-of-range samples, or a conspicuously loud final decay window holds sample admission. The high final tail may also represent an intentional non-piano effect; a new recording or explicit engineering review is required, never automatic silent correction.
- The existing \`Arm Recorded Piano\` UI re-reads the **same** locally verified WAV byte source, first checks its identity via \`verifyFoundryWavBytes\`, then calls \`analyzeFoundryPianoWav\`. If held, no canonical instrument-bank transaction is committed. If passed, it displays peak/tail measurements while **retaining the unknown performer/music rights and no subjective quality claim**.
- The Saban capture preflight now requires the technical-signal QA report to be declared successful in addition to the existing roles and human listening acceptance. Saban's current adapter **does not itself reexamine the waveform bytes**: this checks report completeness/consistency only; source bytes remain independently checked by the Foundry tool.

**Limitations:** This is an early conservative signal gate, not pitch identification, piano authenticity classification, microphone calibration, room-noise analysis, semantic copyright clearance, or a substitute for listening and recording provenance. Passing does not mean \`musical_quality_approved\`, \`performer_rights_verified\` or \`commercial_release_ready\`. Quiet piano samples are allowed when their signal levels remain physically meaningful.

CI exercises clean and quiet decays, heavily clipped samples, near silence, abrupt tails, DC bias, PCM24 stereo, float32/non-finite, malformed RIFF/alignment, and byte-slice handling. Run [39087701525](https://github.com/jgaethle10/forge-operator/actions/runs/39087701525) passed **101/101 Foundry and 6/6 Saban capture preflight tests** at commit \`8318c906ac678679e99eaa66790516b6cfcd1129\`. Broader Forge workflows are tracked separately.

**Next artistic gate:** A real captured piano note with known origin, documented microphone setup and performer consent, followed by an actual user-browser playback receipt and human A/B versus the frozen original *Weight of Silence*.


## Selected MIDI root versus measured WAV pitch

The recording may have healthy amplitude, decay and bit depth yet still be the **wrong musical note**. The new \`checkFoundryPianoRootPitch(actualWavBytes, expectedMidi)\` uses a short, bounded channel-wise time-domain periodicity test to compare actual recorded content against the selected MIDI root (21–108). It returns immutable-style evidence with expected frequency, inferred frequency, estimated cents deviation, periodicity and one of:

- \`consistent\`: period resolved with sufficient confidence and deviation within 45 cents of selected MIDI root
- \`mismatch\`: a confident periodicity measurement differs by more than 45 cents
- \`indeterminate\`: silence/weak signal, ambiguity, non-finite data or inadequate period resolution, requiring review rather than false automatic labeling

The analyzer examines a bounded early section of the actual PCM samples after SHA-256 and technical waveform quality checks. Stereo takes select the stronger measured channel so phase-opposed stereo won't cancel a legitimate piano pitch. It **does not claim to detect piano authenticity, tune complex attack transients, identify a copyright holder or certify a note by human listening**. Heavy pedal resonance, hammer noise, room noise, instrument inharmonicity and complex polyphonic takes can cause uncertainty and require musician judgment.

\`Arm Recorded Piano\` now holds mismatched or indeterminate captures before the canonical \`clip.set_foundry_piano_patch\` operation. The user sees the cause and cents deviation when available, and the WAV remains available for independent audition and review. A consistent signal still has \`human_pitch_confirmed:false\`.

The existing Saban planning preflight requires its **declared** pitch-evidence root to match the selected root and pass this consistency status; its adapter **does not itself analyze the WAV** or authorize release. Missing, inconsistent and indeterminate pitch evidence blocks its review-ready state. Human listening and independently verified recording rights remain required after these technical gates.

At PR head \`b2c85e65d35b42b86b3e496ade4d682fb4c83d61\`, [Foundry workflow 39089331736](https://github.com/jgaethle10/forge-operator/actions/runs/39089331736) passed **110/110 Foundry tests and 8/8 Saban planning tests**. Broader Forge checks are validated independently. Tests currently use synthetic periodic WAV fixtures and *do not* establish performance accuracy on a real piano dataset. Before treating inferred pitch as reliable on acoustic multisamples, gather diverse clean/noisy note captures across the whole 88-key range and measure false acceptance/rejection in human-reviewed samples.

The original *Weight of Silence* reference master is not modified. No release authorization, production deployment, professional acoustic sample recording or actual human browser audio proof is claimed.
