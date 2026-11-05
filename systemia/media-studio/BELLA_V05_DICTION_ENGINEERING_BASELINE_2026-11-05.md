# Bella V05 | Diction & Prosody Engineering Baseline

**Date:** 2026-11-05  
**Status:** Private, evidence-gated R&D. No voice replacement or release authorization.  
**Voice:** Untouched Kokoro-82M `af_bella`, version 0.9.4.

## Direction from listening

The five repaired-gap performances were broadly comparable in quality. Improving the silence gaps alone did not solve the founder-observed defects: unclear diction, unnaturally extended vowels and emphasis on the wrong words. No A–E option should be promoted as the winner solely on timing, polish or loudness.

## Verified real-source inspection

The new CLI inspected **five original dry neural WAV sources** from two independently retained, SHA-verified private audition archives. It did not inspect MP3 edits or mastered previews as though they were original synthesis. All five are 24-kHz, mono PCM16.

| Dry source | Duration | RMS dBFS | Longest 10ms-frame voiced run detected | Word timing |
| --- | ---: | ---: | ---: | --- |
| Original punctuation / 1.00 speed | 16.175s | -23.83 | 0.53s | Unavailable |
| Original punctuation / 0.98 speed | 16.350s | -23.81 | 0.54s | Unavailable |
| Connected punctuation / 1.00 speed | 16.025s | -23.81 | 0.55s | Unavailable |
| Connected punctuation / 0.98 speed | 16.350s | -23.79 | 0.55s | Unavailable |
| Original continuous scene, independently recovered | 16.175s | -23.83 | 0.53s | Unavailable |

Technical findings:
- A 2% slower native speed added only **0.175 seconds** to the original-punctuation, full-scene recording. This is not evidence that it improved vowel naturalness.
- The 10ms Praat F0 analysis identified several **sustained voiced runs, roughly 0.49–0.55 seconds**. Such a run can span phonemes or syllables. **It is not evidence that a particular vowel was too long.** Do not automatically time-compress, delete or “correct” these regions.
- Original and connected punctuation shifted pause placements but did not remove the underlying similar voice texture. No evidence yet demonstrates more appropriate semantic stress.
- Existing original clips contain substantial between-phrase silences, but pauses are now tracked separately from phoneme/syllable performance.
- Original-source WAV SHA-256, source ZIP SHA-256, review-only flags and format checks are captured in `Bella_V05_Diction_Acoustic_Audit.json`.

**Current hard limitation:** We have **no trustworthy word-to-audio timestamps** from independent speech recognition or phonetic alignment in this run. Therefore the code deliberately produces **no named mispronounced words, wrongly emphasized function-word accusations or vowel-length verdicts**. The founder’s qualitative report is the real listening signal; machine flags are candidate locations for human review, not a replacement.

## What was built

1. `voice-bella-diction-audit.py`: SHA-verifies untouched native Bella recordings and their source receipts; computes 10ms acoustic RMS, pause regions, and F0 voiced candidate windows using Praat; accepts an exact script-matching word alignment only if evidence is provided; emits a private JSON review template without granting release authority.
2. `voice-bella-asr-diction.py`: opt-in `faster-whisper` word-time transcription adapter. It preserves actual ASR text and computes token edit distance against the locked script. **If recognition differs, it does not secretly substitute the intended words or invent forced timestamps.** No independent ASR was run in the current container because its model weights/runtime are unavailable.
3. Ten deterministic tests exercise source tampering, invalid voice/release state, exact script matching, chronological word timings, candidate function-word prominence, ASR disagreement, and non-approval safeguards.
4. GitHub Actions workflow exercises synthetic fixture tests and syntax checks without downloading private voice audio or model weights. See PR #1667; the workflow status must be verified separately.

## Next production-quality gate

In order:

1. Run actual local or private runner ASR with word timestamps on each **dry original** take. Save ASR model/version and transcript source hashes; validate alignment against exact approved script. Treat ASR substitutions and proper-noun failures as *candidates*, not proof of mispronunciation.
2. Give a human listener a word- and time-coded defect sheet. Capture the exact heard pronunciation or unnatural stressed token and whether the flaw appears in several takes. Score **diction, vowel shape, semantic emphasis, endings and Bella identity** independently.
3. For each confirmed defect, investigate the actual phoneme/duration modeling in the voice engine, model text handling and word-context conditioning. Never automatically truncate detected voiced spans or perform destructive generic pitch/time stretching.
4. Compare against a reference human performance only if recording rights, speaker consent and usage scope are secured. Any replacement expressive engine must reproduce Bella’s identity without drifting into a different speaker.
5. A new release candidate must improve **clarity and semantic emphasis**, have no serious vowel artifacts, and preserve the unmistakable Bella identity. Promotion stays manual.

## Limitations & evidence boundary

Automatic F0 tracking can make octave errors, and 10ms RMS flags do not distinguish vowels from nearby voiced consonants. Machine word timestamps are approximate and may be wrong at transitions. WER from a single ASR system is not proof of articulation quality. No synthesized audio, customer ads, or public production changes are authorized by this report.

**Decision:** keep existing Bella golden V05, stop advertising pause manipulations as upgrades, and invest in evidenced word-level timing/clarity and semantic prosody.