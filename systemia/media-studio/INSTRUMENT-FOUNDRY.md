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

\`createFoundryVerifiedResolver\` implements the existing PulseGrid audio asset
resolver contract. The host must supply a **trusted** authenticated tenant,
session and audition/review scope, a separate \`authorizeRead\` guard that
checks actual identity/tenant/project permissions, and a \`readBytes\` storage
adapter. Do not accept tenant context merely from client-supplied metadata.

The resolver checks identity, format, budgets, and rights before storage;
authorizes every access, snapshots returned bytes before async verification,
and checks actual RIFF/WAVE data and SHA-256. On success it returns a browser
WAV Blob ready for PulseGridAudioEngine.setAudioAssetResolver.

\`\`\`js
import {createFoundryVerifiedResolver} from './instrument-foundry-resolver.mjs';
const resolver=createFoundryVerifiedResolver({
  scope: authenticatedHostSession, // trusted, never raw user input
  authorizeRead: enforceTenantProjectAndIdentityPermission,
  readBytes: authorizedStoredWavRead,
  onReceipt: auditVerifiedRead,
});
pulseGridAudioEngine.setAudioAssetResolver(resolver);
\`\`\`

A verified read **is not audible playback proof**. This PR includes
no live host storage connector, credentials, owned acoustic samples,
expressive grand piano, or commercial rights clearance. Unknown rights allow
only independently authorized internal listening; restricted rights and
self-declared release flags are rejected. Reader and verifier must be used
together, not bypassed by a direct Blob URL.

\`\`\`bash
node --experimental-strip-types --test \
  systemia/media-studio/instrument-foundry-bridge.test.mjs \
  systemia/media-studio/instrument-foundry-resolver.test.mjs \
  systemia/media-studio/instrument-foundry-pulsegrid.integration.test.mjs
\`\`\`

Next: authorize a real recording storage adapter and run actual
recording -> storage -> verified Blob -> canonical audio decode/playback
in a browser, with separately attributable producer and listener receipts.
Continue holding the rejected oscillator remake out of the master path.
