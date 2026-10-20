# Evercraft Voice Foundry | v1 voice engineering and QA

Status: source-stage engineering contract, not provider-produced audio and not production deployment. Owner: Fallen Audio Department / Kaidance, with Systemia release controls. This module is a provider-neutral preflight and candidate-review gate; it makes zero network calls and never authorizes spending.

## What changed

The existing Media Studio adapter binds a dialogue need to a provider voice ID and fits generated duration. Voice Foundry adds a separate voice casting, dialect/locale verification, performance, consent, and listening quality boundary. That prevents treating an audio file plus a successful HTTP response as a convincing human performance.

## Source-stage pipeline

Script and voice character brief -> locked cast profile -> verified per-cue locale, accent and pronunciation -> performance direction -> explicit paid-generation approval outside this module -> multiple dry speech takes -> real audio measurement, transcript/subtitle alignment and artifact digest -> two independent listening reviews (one accent-qualified) -> selected take -> separate mastering -> editorial gate -> publication gate.

A session cue needs a human-approved voice profile with provider ID, identity version, proven commercial rights and consent, exact verified locale, accent, an emotional/performance direction and an optional timing window. Unknown or unsupported inputs are HELD. The profile's perceived gender presentation can be catalogued for casting but must be established by audition, not inferred from demographic labels. Never clone an identifiable person's voice without permission and rights evidence.

## First voice audition matrix (targets, not existing assets)

- English / US: warm female-presenting documentary narrator; confident male-presenting product presenter; warm neutral-presenting conversational guide.
- English / UK: female-presenting and male-presenting storytelling roles, both with human-reviewed region and pronunciation.
- English / Australia: conversational female-presenting host, with verified regional speech rather than a text prompt alone.
- Spanish / Mexico: female-presenting conversational host and male-presenting narrator.
- Spanish / Spain: female-presenting studio host.
- French / France: male-presenting documentary presenter.
- Portuguese / Brazil: female-presenting commercial narrator.
- Japanese / Japan: male-presenting documentary guide.

This is a casting target list only. No provider IDs, cast assignments, audio outputs or verified accent performance are implied by this matrix. More languages and presentations should be added after qualified review capacity exists, including careful code-switch and bilingual cases.

## Minimum real-production quality specification

- Six human scores for each take (1 to 5): naturalness, accent authenticity, emotional truth, intelligibility, identity consistency and fit in the mix. Every dimension must be at least 4, each reviewer must average at least 4.5, and both must explicitly approve. At least one reviewer must qualify for the requested locale and accent. Human evidence is required even when automated ASR or acoustic analysis passes.
- Measure rather than assume: source SHA-256, provider receipt, exact speaker/profile identity, audio duration, sample peaks, subtitle timing, clarity, sibilance, plosive problems and accidental digital clipping. Verify that claimed measurement references actually resolve to measured files.
- Capture or generate dry voice stems and preserve the original take. Use low-distortion time fitting sparingly; if a take misses the window substantially, regenerate with revised phrasing/pacing instead of stretching it into artificial speech.
- Carry pronunciation lexicons by locale with reviewed proper names and terminology. Require approved references for distinctive accent, and do not substitute English phonemes for languages with different vowel/consonant systems.
- Final cinematic master target carried from the existing Fallen cue contract: -16 LUFS integrated, -1.5 dBTP ceiling and initial -6 dB music reduction underneath dialogue, with actual loudness/true-peak measurements and listening QA required. Stems and mixed masters have different targets. Never silently remove speech.
- Test the delivered mix on headphones, phone speaker and laptop speakers. Include subtle breaths, pauses, conversational prosody and emotional range, without synthesizing spurious drama into factual narration.
- Voice identity is stable across series/episodes. New model/voice versions need regression audition against approved reference lines.

## Engineering boundaries

The included tests are offline synthetic fixtures that prove logic only. The Foundry is now wired as an optional strict per-cue preflight inside the ElevenLabs adapter, but is not enabled by existing callers, and there is no verified provider voice roster, provider generation receipt, commercial voice clearance, native-listener proof, deployed endpoint or professional mix proof from this change. In particular, published voice quality is NOT established by the unit tests.

## Next integration steps

1. Connect trusted registry-backed cast data to the new optional `voiceFoundry` adapter configuration. Once provided, every matching speech cue is gated on verified provider binding, actor identity, exact text, region-specific voice/locale/accent, timing, consent and explicit commercial rights **before network calls**. Existing legacy callers remain functional but cannot claim Voice Foundry verification.
2. Make an audition harness that renders multiple authorized performances for one 20-second script, preserving every take and file digest.
3. Build a human A/B audition and reviewer evidence store. Follow with actual native-speaker ratings, subtitle sync checks, physical mastering measurements and provider cost receipts.
4. Admit winning voices into the Series Bible / Systemia voice registry. Reject voice drift on every future scene and respect founder publication approval.

Offline test: node --test tests/media-voice-foundry.test.mjs

No paid provider calls, checkout changes, deployments or public posts are part of this PR.

## October 19–20 source-stage integration receipts

- `audio-provider-elevenlabs.ts` calls `preflightVoiceFoundrySpeech` for speech when a `voiceFoundry` casting catalog is supplied. The bridge refuses unidentified/mismatched voices, changed spoken text, unsupported locale or accent, absent reviewed consent, incomplete production requirements and requests outside the casting window. `allowPaidGeneration` remains required, separate and unmodified.
- `voice-signal-inspector.mjs` independently reads a real local audio file using FFprobe and FFmpeg. Its SHA-256-bound objective evidence includes duration, channel and sample information, integrated loudness, true peak, loudness range, sample peak, digital clipping risk and an optional final-master -1.5 dBTP gate. Signal inspection cannot establish whether audio contains beautiful human-sounding speech.
- `evaluateVoiceTake` now holds every internal QA decision without a matching audio signal-inspection report. The signal report must match the exact take digest, duration and peak value. Evidence references remain declarations until a trusted evidence ledger verifies them.
- `npm run test:voice-foundry` executes unit and mocked provider integration tests. `npm run test:media-studio` includes these offline tests and the FFmpeg signal measurements. Local Node test harness: 21 tests passed, 0 failed. The adapter TypeScript integration suite requires the repository's installed `tsx` dependencies and GitHub checks for independent verification.
- No actual expressive voice, actor recording, voice cloning, provider voice ID or production-ready multilingual capability has been auditioned or approved in this change. No deployment, spend or public distribution is authorized.

## Offline Listening Room (Push 03)

The production repo now includes:

- `voice-audition-kit.mjs`: read a local audition manifest; verify one shared script and same base language; allow multiple regional accents, genders of presentation and delivery directions; inspect real audio using FFmpeg/FFprobe; copy fingerprinted audio into a portable local audition folder; never call providers or auto-publish.
- `voice-listening-room.html`: an offline browser listening interface with blind/revealed cast, controlled side-by-side playback, six distinct subjective axes, reviewer notes, per-take measured signal readings, and an exportable **unverified** reviewer draft. No network, upload, user-account storage, or provider TTS calls.
- `voice-audition-example.json`: example with feminine-presenting US and masculine-presenting UK voice roles. Example audio files and voice IDs are **not shipped**, and names are not auditions or provider endorsements.
- `tests/media-voice-audition-kit.test.mjs`: offline FFmpeg waveform tests for output, source/script/locale mismatch, safe paths, escaped metadata and unsupported/missing recordings. Synthetic tones are not proof of voice quality.

To audition your own approved takes from the source checkout:

```bash
# Keep the media locally; do not commit actual voices or consent forms to public GitHub.
mkdir -p /tmp/evercraft-voices/input
cp systemia/media-studio/voice-audition-example.json /tmp/evercraft-voices/input/audition.json
# Place two real, consenting actor recordings or authorized TTS outputs there:
# /tmp/evercraft-voices/input/warm-feminine-01.wav
# /tmp/evercraft-voices/input/resonant-masculine-02.wav
npm run voice:audition:build -- /tmp/evercraft-voices/input/audition.json /tmp/evercraft-voices/room
# Open /tmp/evercraft-voices/room/index.html locally and listen.
```

Run QA: `npm run test:voice-foundry` or `npm run test:media-studio`. Audio source paths must be relative to the manifest directory, and real paths cannot escape that directory. Keep the resulting listening room local because consent evidence and commercial usage rights still require independent verification. A reviewer JSON download is NOT an independent signed review, consent record, identity match or commercial license.

The next production work requires an authorized voice roster, checked provider terms and spend, actual candidate speech recordings, native/qualified accent listening, captured independent review evidence and a separately approved publishing gate.

## Flagship model audition policy (October 2026)

Provider documentation now describes `eleven_v4` as the current highest-quality content-creation model, with `eleven_v4_turbo` tailored to lower-latency interactive speech. Current adapter default remains `eleven_v3` for compatibility. Authorized audition sessions may opt into `speechModelId: 'eleven_v4'` and compare against their v3 baseline. The adapter test verifies the exact model ID and provenance model tag in its mocked request/receipt. Do not silently switch the production default or generate paid voice takes without explicit authorization.

Each Listening Room candidate now requires a distinct `modelId` (even for consenting human-recorded speech) so A/B rankings can identify the exact engine used. **Reveal the model only after blind scoring.** Verify pronunciation, authenticity and emotional range with qualified listeners. Eleven v4 supports performance audio tags, but do not assume tags always work and do not mix tag text into the canonical transcript without a separate spoken-word check. Eleven v3/v4 do not support SSML break tags; use model-specific controls only after a measured test.

Provider documentation:
- https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech
- https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices
- https://elevenlabs.io/docs/help-center/product/core-capabilities/text-to-speech/how-do-i-select-the-language-and-accent

## Voice engineering push 05: performance preservation and acoustic finishing

- Governed voice generation now limits time-fit to **8% max tempo change**, even when legacy adapter settings permit 20%. The limit applies **after** the provider has generated audio, when duration can actually be measured. Do not confuse a quality hold with avoiding the cost of an already-made provider request. Any attempted governed time-fit retains an untouched `.dry.mp3` and records a source SHA-256 reference for A/B listening.
- `voice-mastering.mjs` creates a **separate** 48kHz mono 24-bit PCM WAV candidate, preserving the original untouched. Two-pass FFmpeg R128 loudness correction targets -16 LUFS, with -1.7 dBTP render headroom to satisfy the -1.5 dBTP admission ceiling, plus gentle 1.6:1 dynamics and highpass filtering. Overwritten files, clipping, large duration drift and loudness mistakes are held.
- Four local **diagnostic synthetic speech** baselines were actually processed (US feminine, US masculine, UK feminine, Spanish feminine). Output integrated loudness ranged from -16.26 to -16.05 LUFS, and measured true peak was at or below -1.69 dBTP. The processing **does not** improve the underlying voice acting, naturalness, accent fidelity or pronunciation and does not constitute customer-ready audio.
- Locale-specific lexicon term matching now prevents Latin-language substring false positives, e.g. 'Evercraft' does not match 'Evercrafting'. CJK text often lacks word breaks; a textual hit **does not verify acoustic pronunciation**, which must be reviewed by a qualified human.
- The baseline A/B comparison is a diagnostic deliverable. This source change makes no paid requests and has no release/publishing authority. Live voice auditions and verified independent listening are still required.

Local regression: `node --test tests/media-voice-mastering.test.mjs`; the test runner is also included in `npm run test:voice-foundry` and `npm run test:media-studio`.

## Push 06: performance expression, voice continuity, and phonetic assets

Status: **source stage**, no live provider audition or generated neural audio in this push. Quality cannot be claimed from passing mocked provider tests.

- Original dialogue text remains locked to the cast cue and its SHA-256. For explicitly human-approved performance direction, `voice-performance.mjs` compiles a small reviewed inline tag (for example `[whispers]`) only for the supported v3, v4 and v4 Turbo models. Its direction contract, plan digest, original script SHA-256 and exact request SHA-256 are distinguishable. Arbitrary inline tags in raw dialogue are blocked. Natural-language `direction` descriptions in a cast remain a human brief and are **not** silently injected into model text.
- `requireVoiceFoundry: true` makes speech fail closed if the adapter is missing a cast. Legacy routes still exist when the flag is not set. Do not interpret a valid declared `evidenceRef` as independent authentication; external consent and review receipts still need a trusted resolver.
- For repeat takes, set `auditionTakeId` to a unique identifier (e.g., `v4-take01`) and do not reuse that ID within the same output directory. The adapter blocks collisions **before** requesting paid audio. Each take retains its own untreated dry recording and content digest for later A/B comparison. A generation already made by a provider can still incur costs if the audio is subsequently rejected for timing or other quality limits.
- The existing per-cue pronunciation lexicon is **not** itself a provider phonetic dictionary. Configure human-approved `pronunciationDictionaryBindings` with a locale, provider dictionary ID, explicit version ID and approval evidence reference. `voice-pronunciation.mjs` selects only exact-region matches, allows at most three dictionary locators, prevents accidental duplicates, and can require a reviewed dictionary for a matched term with `strictPronunciation: true`. Only explicit version IDs go to the provider. Written name matching is not acoustic proof that the generated voice pronounced anything correctly.
- The adapter's provider body contains `pronunciation_dictionary_locators` only when an approved relevant binding exists, and records a request digest for downstream lineage.
- `tests/media-voice-performance.test.mjs`, `tests/media-voice-pronunciation.test.mjs` and ElevenLabs mocked adapter tests cover both passing and rejected requests. The standalone offline Node contract suite was independently executed locally with **23 passing tests and 0 failures**. Full GitHub Actions remain the separate TypeScript/CI gate.

Next milestone: verify model capabilities and speaker license in a real account, obtain explicit permission to generate, audition real neural voices, compare blinded performances on multiple devices, and collect two qualified listening reviews. Do not claim release readiness from this source work alone.

## Push 07: dialogue pacing and character continuity

- `voice-pacing.mjs` is a zero-spend **FFmpeg silencedetect** inspection of real audio bytes, with digest, timestamps, threshold, quiet/non-quiet durations, leading and trailing quiet and editorial warning candidates. It never inserts synthetic breaths, truncates a dramatic pause, recognizes speech, or claims human emotion. A quiet section may be intentional, breathing or noise-gate behavior; it requires human judgment. Defaults: -36 dB, at least 0.18 second quiet, 1.2 second long-pause review threshold.
- `evaluateVoiceTake` now requires a `pacing` report tied to the **same SHA-256 and duration** as the take, and `take.pacingEvidenceRef`. If pacing returns `needs_human_rhythm_review`, a human must set `take.pacingNotesReviewed=true` and provide a `take.pacingReviewEvidenceRef` before the internal QA gate passes. This is a source-stage record declaration, not an authenticated reviewer identity; it **never** grants publication authority.
- The portable `voice-audition-kit.mjs` now includes pacing reports alongside exact, matching signal digests and flags `pacingReviewRequired` for review. A waveform and silence gate do not prove pronunciation, acting, accent authenticity or the presence of speech.
- `voice-continuity.mjs` checks locked declared `speakerId`, `voiceProfileId`, `identityVersion`, provider and providerVoiceId across scenes, plus optional human-approved previous-season casting records. It holds unexpected character voice swaps but has **not** performed speaker embeddings, biometric matching or human listening.
- Diagnostic exercise on the four prior basic synthetic voices: 11.316, 11.757, 10.967 and 9.405 seconds, with respectively 5, 4, 5, and 3 detected quiet intervals. Longest intervals approximately 0.431, 0.464, 0.430, 0.300 seconds. None is claimed to sound natural from this measurement.
- Local offline modules: nine tests passed total (four silence/edge cases plus five continuity tests) against FFmpeg 7.1.5 and Node 22. The adapter and overall media test suites are separately gated by GitHub Actions.
- Draft PR only: no merge, release, paid provider generation or verified high-fidelity neural-voice audition.

### Automatic session continuity admission

All `planVoiceSession` calls now attach a `continuity` audit and hold the session if one speaker changes voice profile, identity version, provider, or provider voice ID within the session or against an optional `previousCast` record. `preflightVoiceFoundrySpeech` checks the **entire** configured cast before billing a single scene; a second scene cannot hide a changed narrator behind a successful first-scene preflight. Prior records currently carry declared approval/evidence fields only; trusted external evidence resolution and actual human listening remain separate obligations. The legacy adapter requires `requireVoiceFoundry:true` for fail-closed admission if no cast is supplied.

## Push 08: listening-room review reconciliation

The downloadable Listening Room produces `evercraft.voice-foundry.human-audition-draft.v1` files. These are **self-reported, unsigned, unauthenticated review drafts**, not evidence that someone listened or that they hold rights. The new `voice-review-reconciler.mjs` connects them to the original offline `audition-report.json`, requiring exact candidate IDs, source audio SHA-256, complete scored candidate sets, distinct claimed reviewer IDs, consistent locale claims and every six-axis score from 1 to 5. A locale-qualified reviewer must be claimed for each candidate. Two or more independently named reviewers are required.

Usage after collecting two independent listening-room exports:

```bash
node systemia/media-studio/voice-review-reconciler.mjs \
  ./audition-report.json ./first-review.json ./second-review.json \
  > ./voice-review-reconciliation.json
```

If scores disagree sharply, any category falls below 4/5, or average is below 4.5/5, the candidate is held for discussion. Rankings are deterministic with explicit model, provider, voice profile, per-axis scores and holds, but are **triage, not final winners**. If any reviewer file fails integrity checks, the **whole editorial shortlist is emptied**. Tampered source reports and alias reviewer IDs also fail closed.

Security and truth boundaries: An audio digest proves the reviewed file was *named consistently* in exported data, not that its bytes were independently re-read or heard at reconciliation time. Draft export fields and claimed accent qualifications are not cryptographically authenticated. Do not treat `eligible_for_further_verified_review` as `passed_internal_voice_qa`; never treat it as commercial-rights consent or publication approval. Trusted reviewer identity and listening evidence need authenticated records outside this offline stage. No real provider generation, cost, deployment, or public release is performed.

## Push 09: real-audio-linked transcription accuracy (ASR observation intake)

New modules: `voice-transcript-verifier.mjs` and `voice-asr-evidence.mjs`. They compare externally generated automatic speech recognition (ASR) transcripts against the exact locked `planVoiceSession` dialogue, using Unicode-aware word segmentation, deterministic edit alignment, word error rate, and review flags for missing named terms. Insertions, substitutions and deletions are exposed. Native language orthography and locale must match the cast; changes in spelling, punctuation or diacritics can require review.

**Important boundary:** there is no provider speech-recognition model installed in this source module. Merely passing a text observation does not demonstrate that real speech was transcribed. `voice-asr-evidence.mjs` hashes a real local audio file before comparing it with an external ASR observation; this independently checks *which file* is being evaluated, but does **not** authenticate the ASR model receipt, prove audible speech, or establish human-like voice quality.

To audit a real recording with an existing, separately obtained ASR result:

```bash
node systemia/media-studio/voice-asr-evidence.mjs \
  casting-session.json cue-001 recorded-take.wav asr-observation.json \
  > voice-asr-evidence.json
```

The ASR observation must include the schema `evercraft.voice-foundry.asr-observation.v1`, `method: automated_asr`, `cueId`, exact `locale`, source `audioDigest`, `engineId`, `engineVersion`, `sourceReceiptRef` and `recognizedText`. The code treats these as declared evidence fields, **not verified credentials**. The file digest comes from the recording's actual bytes. This operation performs zero remote calls and no billable work.

`evaluateVoiceTake` now requires the transcript audit in addition to signal measurement, pacing, independent listening scores and explicit evidence references. Any missing, mismatched or high-WER audit blocks internal QA. If an optional `asrObservationPath` is present in an audition manifest candidate, the offline `voice-audition-kit.mjs` reads it **only from inside the audition project**, limits its file size, binds it to measured audio, includes transcript findings in the report, and holds mismatched candidates. Without it, the report explicitly says `asr_not_provided`; no transcription is fabricated. The Listening Room displays matched, held or absent transcript status per take.

Tests are synthetic and mock **ASR declarations**, plus real generated audio file hashes; they are not proof of a working neural speech recognizer or believable vocal performances. Real independent ASR receipts, careful pronunciation reviews and licensed model auditions remain to be done. The draft PR is not a production release.


## Push 10: locally executable, hash-pinned whisper.cpp ASR

The \`voice-local-whisper.mjs\` runner is a **real local-execution path**, not a provider API mock. It requires an already-installed executable from [whisper.cpp](https://github.com/ggml-org/whisper.cpp), a local model file, a previously admitted Voice Foundry session, a specific cue and a recording. It checks the actual input format/duration with \`ffprobe\`, converts the recording to mono 16 kHz PCM with FFmpeg, runs \`whisper-cli\` against that converted audio, consumes the generated plain-text transcript and feeds it through \`assessVoiceTranscript\`. Audio, PCM, model and binary hashes are recorded. All subprocesses use argument vectors without a shell.

Important admission constraints: recordings are limited to 30 MiB and 150 seconds, model files to 3.5 GiB, transcript output to 64 KiB and the recognizer to a 180-second timeout. Commands fail if the binary, model, input, approved cast or expected binary/model SHA-256 pins are missing. Files are written using create-only flags into an existing output directory; temporary audio is deleted. Local model access and execution must be intentionally configured by the operator. There is no model download, hidden key access, cloud fallback, billed transcription or paid synthesis.

Example (only once whisper.cpp and a lawful/approved model have been installed):

\`\`\`bash
MODEL=/trusted/models/ggml-base.bin
WHISPER=/trusted/whisper.cpp/build/bin/whisper-cli
sha256sum "$MODEL" "$WHISPER"
mkdir -p ./local-asr-receipts
node systemia/media-studio/voice-local-whisper.mjs \
  ./casting-session.json cue-001 ./approved-take.wav \
  "$WHISPER" "$MODEL" ./local-asr-receipts \
  YOUR_APPROVED_MODEL_SHA256 YOUR_APPROVED_CLI_SHA256
\`\`\`

The command outputs a same-cue \`voice-asr-<cue>.json\` observation and a \`voice-asr-audit-<cue>.json\` report. Include the observation as a candidate's \`asrObservationPath\` within an audition folder to display its spoken-script accuracy. Exiting with status 2 means transcription ran but the word-level comparison was held; exiting with status 1 means an execution or validation error.

**Honesty boundary:** no installed whisper.cpp binary or authentic model was available in the development runtime at authoring time, so the new regression tests invoke a clearly labeled test stub executable against **real FFmpeg-generated non-speech audio**. The tests validate subprocess arguments, deterministic hashes, model/binary drift protection, missing-resource holds and absence of false publication authority. The output of a stub is emphatically **not evidence that real spoken words were recognized**. A real model must be installed, run and independently audited before claiming any genuine ASR result. A transcript match from a real model still does not prove naturalness, emotional acting, phonetic pronunciation or commercial usage rights.

## Push 11: first local neural TTS audition lane

Voice Foundry has an executable, zero-cloud Piper-compatible generation lane, but no installed neural model has yet been run in the development environment.

- voice-local-piper.mjs: creates one original WAV from an explicitly installed Piper executable, ONNX model and matching JSON config. Checks SHA-256 pins for all three files, exact model locale and speaker, declared license evidence, controlled pacing parameters and exclusive output files.
- voice-local-piper-audition.mjs: preflights two to six casts, rights declarations, model/binary/config files and SHA pins, locale, speaker and generation settings BEFORE rendering the first take; creates separate WAVs and the existing blind offline Listening Room.
- voice-local-piper-audition.example.json: intentionally unusable placeholders and rightsState unknown until the operator verifies model permissions and file digests. VOICE_LOCAL_PIPER.md is the hands-on guide.

The Piper program and its eSpeak dependencies may carry commercial and redistribution obligations; voice models can have separate restrictive training-dataset licenses. A repository-level MIT label does not prove a particular model or generated voice is commercially cleared. No external network, paid API or model download occurs from these source modules.

The regression tests use an explicitly fake Piper executable that creates real FFmpeg sine-wave WAVs. They verify actual subprocess invocation, matching hashes, portable audio rendering and fail-closed admission, NOT successful neural speech or cinematic acting. A licensed voice model must be installed and listened to before claims of a quality breakthrough.
