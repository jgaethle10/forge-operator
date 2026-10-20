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
