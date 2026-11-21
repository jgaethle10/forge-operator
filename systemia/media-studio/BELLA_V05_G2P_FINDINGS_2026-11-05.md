# Bella V05 | Original Kokoro lexical stress inspection

**2026-11-05 • Native G2P, model and audio generation disabled • Private review only**

The unmodified Kokoro 0.9.4 English front end completed on the same 46-word Evercraft narration used in the magnetic-presence audition. The evidence file contains one grapheme/phoneme chunk and **54 native tokens**. GitHub Actions run `42113086204` completed successfully. This was a real text-to-phoneme pass, **not** a synthesized audio or a perceptual diction test.

## Useful candidates for a narrow corrective investigation

| Word | Native Kokoro phoneme output | What to investigate |
| --- | --- | --- |
| Evercraft | `ˌɛvəɹkɹˈæft` | Native G2P puts **primary lexical stress on “craft”**, with a weaker stress earlier. This is a plausible brand-word pronunciation concern. **Desired brand pronunciation has not been independently confirmed**. Do not automatically rewrite it. |
| that | `ðˈæt` | Native output marks this function word as stressed in “You know that moment”. Actual audible sentence emphasis must be checked before calling it wrong. |
| That's | `ðˈæts` | The first word of “That's what we're building at Evercraft” receives primary lexical stress. May be natural contrast or unwanted prominence. Requires timed listening. |
| attention | `ətˈɛnʧən` | Ordinary primary stress in the second syllable. No direct defect established. |
| to | `tu` | No lexical stress mark at final phrase ending, so if audio draws out this word, the behavior likely lies in **predicted duration/phrase-final prosody**, not the G2P stress marker alone. |

These are **G2P frontend observations**, not judgments of the rendered audio. Lexical stress marks are different from sentence-level emphasis, and the model can apply additional F0/intensity/duration choices during synthesis.

## Engineering consequence

1. Keep the exact original `af_bella` voice untouched and retain phoneme audit receipts for every proposed correction.
2. Inspect **actual predicted token/phoneme durations and the waveform** at the highlighted words, with approved timed alignment. Prioritize the word “Evercraft” and conspicuously stretched sentence endings.
3. Review a minimal targeted word-context comparison with a human listener before changing the front end. Do not overwrite phonemes, force IPA, pitch-shift the audio or truncate candidate vowel regions automatically.
4. If the problem is generated duration or sentence-level prosody, fixing the spelling/phoneme dictionary alone will not solve it. Investigate duration predictor and expressive controls separately.

**Release state:** No human-approved pronunciation changes, no new audio, no production update. The full reproducible evidence is in `Bella_V05_Original_Kokoro_G2P_20261105.json`; source code in `voice-bella-g2p-inspection.py` and workflow in `voice-bella-g2p-inspection.yml`.