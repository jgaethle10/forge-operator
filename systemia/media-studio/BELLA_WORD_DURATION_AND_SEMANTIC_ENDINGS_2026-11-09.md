# Bella V05 | Verified native durations and semantic-ending intervention

**November 9, 2026 | REVIEW ONLY | Kokoro 0.9.4 `af_bella`**

## Exact evidence completed

GitHub Actions run [42760835749](https://github.com/jgaethle10/forge-operator/actions/runs/42760835749) completed successfully with genuine Kokoro speech and valid model-derived word timestamps. The private artifact `bella-native-model-word-durations-private-review` was independently downloaded and its source WAV hashes validated. Both model outputs contain **46 matched words**. Original dry WAV: **16.175 s**; connected-punctuation dry WAV: **16.025 s**. The unchanged original G2P phoneme hash matches `b609c9bb842a59167dd2eb0319d3e9cabfce0ccdc56a060ef71e456581dac70d`.

This data is from the actual **native predictor**. It is **not** an external forced alignment, not a confirmed word boundary, not a measured vowel phone, and not a listening preference. No alleged naturalness improvement has been established.

| Target word / token | Original predicted seconds | Connected punctuation predicted seconds | Reason to listen |
|---|---:|---:|---|
| sentence-final `to` after `attention` | **0.338** | 0.337 | low-content function word elongated near phrase boundary |
| final `to` after `back` | **0.338** | 0.338 | same behavior on closing line |
| interior `to` before `make` | 0.100 | 0.100 | meaningful reference for the same spelling |
| interior `to` before `come` | 0.088 | 0.088 | same reference |
| `clear` | 0.713 | 0.587 | 126 ms duration difference with punctuation context |
| `go` | 0.525 | 0.650 | 125 ms difference, opposite direction |
| `Evercraft` | 0.938 | 0.863 | brand articulation needs timed human review |
| `that` in the opening | 0.225 | 0.225 | lexical stress mark detected; **not** proof of incorrect semantic emphasis |

In the original native reading the two terminal `to` tokens are **3.60×** as long on average as the two internal uses of `to`. A sentence ending can legitimately lengthen a word, but that repetition is an excellent candidate for the human-noted drawn-out vowel behavior. Do **not** automatically trim either word.

## Intervention under test

The writing itself places weak function words at the end of both closing thoughts:

**Original:** “Something worth paying attention to. Something you'll want to come back to.”

**Contrast:** “Something worth your attention. Something you'll want to revisit.”

The five earlier sentences are **identical**. Original native model, voice ID, speed 1.00 and seed 1701 remain unchanged. **The closing words differ intentionally, so this is not a same-words acoustic experiment**. It asks whether changing the information structure makes Bella land on content words with more natural, engaging sentence endings. Audio evidence remains a private audition pending a human decision; brand pronunciation is unchanged.

Source: `voice-bella-meaningful-endings.py` and `test_voice_bella_meaningful_endings.py`; workflow `.github/workflows/voice-bella-meaningful-endings.yml`. Original paired 46-word timings: `Bella_46_Word_Timing_2026-11-09.csv` in the private Bella V05 Drive audition folder. Original generated WAVs remain in that private archive, not public production.

## Mandatory release checks

- Listen to both complete performances at comparable loudness, on the same device and preferably headphones.
- Confirm accurate `Evercraft` articulation, clear consonants, natural vowels, meaningful emphasis and credible sentence endings.
- Reject any improvement that reduces the original Bella voice identity.
- Independent ASR may reveal candidate misheard words, but no single system's WER is a definitive pronunciation or prosody judge.
- Preserve exact source hashes, model version, user preference and human review evidence.
- **No automatic commercial publication, voice substitution, phoneme forcing, waveform stretching or final sign-off.**

**Status:** Source timing inspection PASSED. Copy-change auditory superiority NOT yet established.
