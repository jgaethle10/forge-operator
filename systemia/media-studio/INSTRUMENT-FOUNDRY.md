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
