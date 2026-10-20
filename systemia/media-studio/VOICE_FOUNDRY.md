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

The included tests are offline synthetic fixtures that prove logic only. The Foundry is not yet wired into the current ElevenLabs runtime, and there is no verified provider voice roster, provider generation receipt, commercial voice clearance, native-listener proof, deployed endpoint or professional mix proof from this change. In particular, published voice quality is NOT established by the unit tests.

## Next integration steps

1. Integrate planVoiceSession into audio-provider-elevenlabs.ts on its preflight path without weakening the existing allowPaidGeneration flag, rights gates or continuity receipt.
2. Make an audition harness that renders multiple authorized performances for one 20-second script, preserving every take and file digest.
3. Build a human A/B audition and reviewer evidence store. Follow with actual native-speaker ratings, subtitle sync checks, physical mastering measurements and provider cost receipts.
4. Admit winning voices into the Series Bible / Systemia voice registry. Reject voice drift on every future scene and respect founder publication approval.

Offline test: node --test tests/media-voice-foundry.test.mjs

No paid provider calls, checkout changes, deployments or public posts are part of this PR.
