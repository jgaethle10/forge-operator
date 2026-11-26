# Graphics Megazord: production mesh v1

This is a handoff and admission layer, not a new image generator and not a claim of finished video production.

Evercraft already owns Graphics Command, Fallen Creative Council, Fallen Visual Stage, World Engine, Visual Desk and Clip. The production mesh brings their contracts into one campaign-specific job pack with byte-level identity and fail-closed gates.

## Build

Use the existing command:

    node systemia/graphics-command/build-commercial.mjs \
      --campaign systemia/graphics-command/campaigns/website-audit-attention.json \
      --output /tmp/evercraft-visuals \
      --origin https://fabric.systemiacommandcenters.com/visuals

For each campaign, the command now additionally writes:
- production-jobpack.json: time-aligned shot/frame work orders and explicit downstream department requirements.
- production-mesh-receipt.json: SHA-256 identity of local posters, HTML motion stage, source evidence, council reconciliation, and Clip handoff.
- commercial-build-receipt.json: keeps the established receipt, now also referencing the mesh digest and customer-readiness state.

The production mesh receipt is deterministic for the same exact files. It contains no network access credentials and confers no publication authority.

## Authority and execution boundaries

| Department | Verified at build | Next required evidence |
| --- | --- | --- |
| Graphics Command | Four SVG media variants, dimensions, nonempty bytes, hashes, campaign/plan/source consistency | Human visual approval; exact-frame raster tests |
| Fallen Creative Council | All shot IDs, no duplicate or blocked shots, ten-role contract reconciled | Produced and visually assessed candidate footage |
| World Engine | Work order for spatial shots | Actual scene replay + rendered-frame receipts |
| Fallen Visual Stage | Deterministic HTML stage API present, bytes hashed | Real frame samples and final video encode |
| Voice Foundry / Kaidance / music | Sound direction carried through | Generated/recorded performance, music licenses, dialogue timing, audio master |
| Fallen Master QC | Nothing claimed | Media decode, sync, loudness, rights, and visual review receipt |
| Visual Desk | Files on disk | A measured deployed page with independent HTTP canary |
| Evercraft Clip | Handoff contract only | Explicit publication approval, media-intake verification and platform receipts |

A passing preproduction check is not a publishable, customer-deliverable film. A generated HTML scene cannot be silently promoted to an MP4 claim. World Engine is not marked executed merely because a shot references it.

Shot frames are allocated by rounding cumulative time at the requested FPS. This prevents per-shot rounding from changing the finished timeline duration.

## Tests

    node --test systemia/graphics-command/production-mesh.test.mjs

Tests cover honest state classification, deterministic receipts, asset deletion, broken exact-frame API, forged provenance, mismatched digests, missing Creative Council shots and unauthorized publication flags.

## Next adapters

1. Execute the World Engine spatial scenes and attach camera/frame hashes to corresponding shot IDs.
2. Render exact Fallen frames into a real video asset with FFprobe, selected-shot and visual-review evidence.
3. Bind rendered voice, score, effects and mastered dialogue to the shot timeline, preserving licenses and performer consistency.
4. Advance the final master through quality gates and user-approved Clip publication.

Do not flip the booleans by hand. Advance only via validators that read actual produced files and independently verifiable receipts.


## Ecosystem coverage audit: October 20, 2026

The audit scopes seven source directories, nine additional named integration files, the family cartoon UI, Fallen Sessions, public interactive world experience, and relevant Saban production helpers. The pinned source baseline currently contains **139 production-related source modules**. Changes outside those scopes, uncommitted code on worker hardware, provider credentials, model weights and media assets are not covered.

### Explicit profile routing

- **Family cartoons and serialized toons:** family UI/server, character series bible, locked voices and identities, performance direction, lip sync, skeletal animation, geometry bridge, cinematic pipeline, and sound/master QA. Hands, facial performance, eyelines, movement, stable character appearance and child-safe review are required evidence, not assumed capabilities.
- **Documentary:** evidence and Worldstate, spatial staging, WebGPU, visual observer, authenticity labels, source rights and quality review.
- **Commercial:** Graphics Command, ten-role council, shot tournament, actual product truth, voice, music and render/master QC.
- **Interactive world:** collision, 3D animation, textures, lighting, audio, browser GPU and replay, with real-device tests.
- **Music/performance:** PulseGrid composition, voice and audio engine, spatial sound, dialogue sync, music rights and final mix.
- **Social creative:** Space Dudz artwork, Visual Desk, Clip distribution, privacy/family safety and platform sign-off.
- **Data and education:** geography/terrain, source evidence, projection accuracy, public edge readiness and labels.
- **Delivery:** FFmpeg/FFprobe-based render/master chain, verified Clip intake and separately authorized publishing.

Each profile remains contract-only and not runtime-verified until actual output artifacts are produced and admitted. Source-code presence or even passing unit tests never become claims of human-quality output, current provider access, deployed pages, or authorized publication.

### Enforced drift proof

The package now contains production-capability-baseline.json, production-capability-audit.mjs and a dedicated test suite. On each commercial specimen build, the audit walks its declared source scopes, hashes each checked-in source module, compares every module against the explicit baseline and requires all named production features and profile requirements to exist.

**New or missing modules fail the build** until inventoried. This is deliberate: new tools must be acknowledged rather than lost between creative departments. Updates to the baseline require reviewing their actual responsibility, dependencies and evidence policy.

Generated bundles now include production-capability-audit.json and production job packs include all eight production profiles with their required features and evidence receipts.

### Open gaps identified

- This has **not** yet generated an end-to-end, character-stable cartoon with verified hand anatomy, expressive voice and lips, final sound master and accepted video.
- Real provider keys, permissions, budgets, current provider availability, model weights and usage rights have **not** been verified by source scanning.
- A source can have a nearby test file without its test having run. Local source/test inventory checks must not be mistaken for completed end-to-end media tests.
- The commercial specimen produces useful deterministic graphics and HTML motion; a real integrated MP4 with finished voice/music and proven public delivery still requires separate execution receipts.
- The repository inventory does not include family-supplied photographs/videos held outside the checkout, unattached local workstation assets or unconnected external apps.

The purpose of this audit is to preserve all these lanes in a single traceable inventory, identify what can be routed next, and prevent accidental claims that every source module is already running in production.


## Toon Shot Handoff v1: now callable by the family cartoon app

Fallen Series Mode is now wired to a separate planning and admission boundary:

- Backend route: POST /api/fallen/family/toon-handoff
- Source: systemia/media-studio/toon-shot-handoff.mjs
- Tests: systemia/media-studio/toon-shot-handoff.test.ts and systemia/media-studio/family-http.test.ts

Request JSON has four keys: bible (the returned family series bible), seriesPlan (the returned Series Mode plan), shots (human/agent-authored shot directions), and optionally fps (24 to 60). Every shot must supply id, visualNeedId matching a real video production need, durationSec, locationId, action, soundDirection, characters, and dialogueCueIds. Visible characters must have five explicit acting directions: objective, physicalAction, face, gazeTarget, hands.

The family episode now includes a stable family-story-world location anchor. It is a declared story world, **not a rendered environment asset**. Individual shot environments, visuals and rights still require later evidence.

The handoff rejects:
- missing or duplicate shots, visual needs, characters, cue IDs or dialogue assignments;
- altered character bible, absent reference IDs, unknown location or unbound voice;
- missing hand/facial/eyeline/action direction or unseen speakers;
- incompatible shot timing, aspect ratio or continuity state.

Successful response state is preproduction_work_orders_only. It includes frame-accurate assignments, immutable traits, voice IDs, explicit mouth/phoneme sync requirements, and animation/render/audio/QC gates. No paid model request is made. The family UI itself still needs an editable shot-directions panel before this is a one-click consumer workflow.

This is a mechanical step toward stable, performing characters, not proof that an animation is finished. Character photo reference identifiers are declarations, not proof that identity matching, hand anatomy or frame continuity passed.


## Real encoded 2D toon canary (October 20)

The owned systemia/media-studio/toon-cel-canary.py script renders an **actual**
original cel animation from authored SVG curves at deterministic timestamps. It
rasterizes frames with CairoSVG, generates a small original instrumental synthesis
with Python's wave module, encodes an H.264/AAC MP4 via FFmpeg, uses FFprobe to
validate the stream dimensions and codecs, and writes a SHA-256-backed JSON receipt.

Run on a workstation with FFmpeg, FFprobe and the Python cairosvg package:

    python3 systemia/media-studio/toon-cel-canary.py --out /tmp/fallen-toon-canary --seconds 3 --fps 24 --width 768 --height 432

The existing Visual Desk CI workflow generates its own one-second 480×270 version
and retains the MP4, original score and receipt as a GitHub Actions artifact.
The frame output is evidence of rasterized and encoded pixels, rather than a
compositor mockup or an HTML-only motion plan.

**Scope and limitations:**
- The authored fox and lantern are a self-contained *synthetic canary character*,
  not a family member, photograph-derived identity, approved cast member or a
  licensed third-party character.
- The canary contains no spoken words; it **does not** prove speech, lip sync,
  expressive generative voices, model provider access, skeletal-motion quality or
  an identity-correct episode.
- The renderer is currently a standalone source-backed test and **does not**
  consume the full toon-shot-handoff contract yet. The real family toon
  pipeline still needs an adapter from validated shot directions to an
  identity-aware visual runtime and subsequent actor/master review.
- The synthetic instrumental is original, not a vetted Evercraft music master.
- No paid media or third-party API calls occur. Do not publish or sell this
  generated canary as finished cartoon work.

Remaining work is *execution integration*, not more contract documents:
1. Exact-frame identity-aware character renderer consuming actual toon shot IDs,
   approved visual references and animation rig poses.
2. Matched voice/viseme timeline and original-score output from owned audio.
3. Visual observer rejection and master QA over a playable produced film.
4. Explicit delivery/Clip authorization only after all evidence is admitted.


## First sound-reactive character mouth experiment

The original-fox renderer additionally supports an **explicit, offline scratch-dialogue
mode**. Its end-to-end proof uses a real Series Mode dialogue cue with the fixed
experimental line "Hello, little light." and its locked *declared* speaker.

For this proof only, an available local eSpeak/eSpeak-NG binary generates the
experimental synthetic audio (not Voice Foundry and not the locked character
voice). FFmpeg resamples it to a shared 32 kHz PCM clock. Python measures the
actual speech RMS during each frame interval and opens/closes the vector fox's
mouth from those measured samples. The script mixes the spoken audio with its
original instrumental bed, then encodes a playable H.264/AAC MP4.

GitHub Actions exercises the no-dialogue original-fox cel render, distinct
authored reach/observe acting profiles, and the real Series Mode dialogue packet
with a single approved scratch line. It compares an active and silent mouth
crop in the resulting PNG frames and retains the WAV/MP4, measured mouth
timeline, and preview receipts.

**Important evidence boundary:** RMS envelope matching proves basic
audio-reactive mouth movement, not alignment of individual phonemes or visemes.
The test voice is *not* an identity/voice-profile match and has not been
auditioned for naturalness or approved for a commercial. The system continues
to report phonemeTimingVerified:false, voiceProfileMatched:false,
dialogueSynced:false, masterQcPassed:false, and publicationAuthority:false.
The speaker, source art, and sound are a fictional canary, never family
identity. Other spoken text is rejected by this scratch-only renderer.

The next advancement requires verified word/phoneme timing from an approved
voice generator, mouth shapes for actual phonetic units rather than volume
alone, audiovisual alignment testing, and an identity-aware character rig.


## Creative-quality reset after user rejected original fox specimen (October 21)

A successful FFmpeg export, matching digest, and basic RMS-driven mouth motion
did **not** make the clip an acceptable cartoon. The user explicitly rejected
the scratch-voice, flat front-facing vector specimen. Retain it only as a
regression fixture, not as character-design or performance proof.

New source-backed tools:

* toon-audition-board.py decodes the **actual encoded video** at multiple
  timestamps, generates a nine-panel contact sheet, measures sampled pixel
  differences, binds the board to the movie SHA, and flags scratch speech,
  missing identity, and missing artistic/voice approval. Pixel change is
  technical motion evidence only, never an objective claim of visual quality.
  Visual Desk CI retains the report and board beside the MP4.
* toon-cinema-preflight.mjs takes a validated Fallen shot and a separately
  declared, approved start-frame identity reference and requests a
  high-quality reference-preserving video through the existing Visual Model
  Fabric. Current Runway Gen-4.5 remains **declared, not live-verified** by
  default. It will not run until runtime verification, rights and paid
  execution authorization are independently established. It neither burns
  provider credits nor asserts an art asset was checked merely from a URL.
* The scratch eSpeak voice remains explicitly **not** Voice Foundry,
  lip-sync proof, or approved creative audio.

Current next production milestones: externally approved character art and
identity-consistent visual source, actual owned/licensed expressive speech
with a listening-approved performance, meaningful acting and eyelines across
shot changes, controlled music mix, and human review of real rendered
frames. No upload, social publication, commercial showcase, or claim of
finished quality from a technical CI success alone.


## Multi-pose real-art scene animatic (October 22)

The toon-pose-animatic.mjs stage can actually encode a sequence of reviewed
character pose images together with a recorded voice file into an H.264/AAC MP4.
This is an edited, camera-moved animatic, not character rig animation or
lip-sync admission. It deliberately does not recycle the rejected flat fox.

Required source manifest: schema evercraft.fallen.toon-performance-sources.v1,
bound to exact packet digest, shot ID, actor ID. Image PNG/JPEG and recorded
dialogue each have exact SHA-256, declared ownership/rights and review evidence.
Speech is bound to its cue text, cue ID, and declared locked voice profile;
scratch eSpeak is not accepted here. Real audio decode and non-silent PCM are
required. SceneFrames must contain 2 to 5 unique pose images, with fields:
id, actorId, referenceAssetId, file, sha256, atSec, performanceBeat,
rightsClaim, reviewState, reviewEvidenceRef. First image at zero binds the
identity image; further poses are independently checked as owned/approved
and must be different, timed, and locked to the same actor.

Offline invocation with Node, ffmpeg, ffprobe and tsx dependency installed:

    node --import tsx systemia/media-studio/toon-pose-animatic.cli.mjs \
      --packet /path/shot-handoff.json \
      --manifest /path/production-sources.json \
      --assets /path/art-and-audio \
      --shot exact-shot-id \
      --out /path/scene-review

Emits animatic-review.mp4 and animatic-receipt.json, including source hashes,
rendered sample hashes, exact frame count, audio hash and honest false quality
and publication flags. No external provider credits or payments are used.

GitHub CI exercises a generated three-color PNG sequence plus a pure sine
tone WAV. Those are synthetic QA fixtures, emphatically not creative output
worth sharing. Artwork direction and recorded expressive voice must still be
approved, followed by true character rig animation, phoneme sync, original
music master and audience review before any customer-ready release.


## Hierarchical two-dimensional animation rig (October 22)

This push adds a physical offline layered motion stage. The source-backed
toon-puppet-rig.py accepts original/user-approved full-canvas transparent RGBA
PNG layers (2 to 12) with per-part pivot, parent ID, z order and signed source
hash; authored keyframes interpolate rotation/translation/scale with easing.
Parent-to-child world transforms let heads and limbs inherit body motion. A
frame-by-frame PIL compositor feeds FFmpeg real RGB motion, followed by an
actual recorded voice file. This is distinct from the earlier jump-cut pose
animatic and the rejected stock-looking fox demonstration.

The toon-puppet-binding.mjs wrapper first checks the signed Fallen packet,
verified source artwork and voice against its locked actor/voice/cue. Each
layer must also have a corresponding manifest rigParts record including actor,
allowed reference asset, SHA-256, declared rights and human review evidence.
False approval claims remain false, no model is invoked or billed, and source
files are never publicly uploaded.

Invoke the same offline entrypoint used for pose animatics with the two
optional flags below:

    node --import tsx systemia/media-studio/toon-pose-animatic.cli.mjs \
      --packet /path/shot-handoff.json \
      --manifest /path/approved-sources.json \
      --assets /path/media-files \
      --shot exact-shot-id \
      --out /path/render-review \
      --rig /path/character-rig.json \
      --python python3

Rig schema: evercraft.fallen.toon-puppet-rig.v1. Include packetDigest, shotId,
actorId, width, height, fps, durationSec; all layers with id, actorId,
referenceAssetId, file, sha256, parentId, pivotPx, zIndex; keyframes with
atSec and for every layer rotationDeg, translatePx and scale; voice with
file, sha256, cueId and voiceProfileId. Duration is 1-10 seconds at 24-30fps.
Model has bounded motion and rejects cycles, malformed PNG layers, missing
alpha, unsafe paths, tampered hashes, missing joints, wrong actor/voice,
unreviewed source and no pixel motion.

Output: puppet-motion-review.mp4 plus puppet-motion-receipt.json with
source hashes, audio hash, exact frame count, sampled actual pixel hashes,
and publication/identity/lip-sync/master QC flags all explicitly false.
Internal CI uses simplified transparent shapes and a sine wave only as
technical fixtures, **never** as a creative cartoon for audience review.

IMPORTANT LIMIT: Transforming genuinely separated and correctly drawn parts
preserves the art better than morphing whole frames, but it still does not
solve character appealingness, anatomical staging, nuanced facial acting,
phoneme-driven mouth shapes, music, or human creative admission. Approved
multilayer character artwork and an auditioned real performance must replace
the test fixtures before any public-facing scene can be offered.

## Authored facial performance on actual rig frames (October 22)

The cutout renderer now supports layered mouth, eye, and brow **sprite
switches** while preserving joint transforms. This is not amplitude-driven
speech or a whole-image morph, and does not invent missing character drawings.

Supply 2–6 actual distinct RGBA PNG sprites for each optional face group.
Every variant carries the same verified actor/source-asset and declared review
record as other rig parts. Each sprite defines switchGroup = mouth / eyes /
brows and variant = an exact authored name, e.g. open, closed, round or
rest. Variants in one group must use the same parent joint, pivot and depth.
Their decoded pixel contents must differ.

Provide optional rig.facialTracks with one track for every switched group:

    {"group":"mouth","source":"authored_frame_timing","cueId":"cue-1",
      "events":[{"atFrame":0,"variant":"rest"},
                {"atFrame":22,"variant":"open"},
                {"atFrame":36,"variant":"round"},
                {"atFrame":60,"variant":"rest"}]}

Eye/brow tracks omit cueId. Events must start at frame zero, have strictly
increasing integer frame indexes, reference exact registered variants, and
actually change the artwork. Mouth cueId must match the recorded dialogue
cue locked in the shot. At each rendered frame only the currently selected
variant is composited, inheriting the same facial/head joint movement.
CI exercises a blink and a rest/open/round mouth sequence, checks changed
encoded media, authoritative frame counts, and exact source-event receipts.

**Critical boundary:** these are authored expression switches, not
phoneme-timed visemes, certified audio-video sync or natural facial acting.
Even an accurate cue ID cannot establish spoken-phoneme timing. Render
receipts continue to say phonemeTimingVerified = false,
lipSyncVerified = false, humanCreativeApproved = false and
publicationAuthority = false. No ugly fixture is a creative deliverable.
