# Voice Foundry | Micro-Prosody Push 14, 2026-10-20

## Founder and independent household feedback
The owner prefers Kokoro V02 (`af_heart`) and V05 (`af_bella`) for their naturalness; V06 (`am_michael`) is the strongest masculine-presenting voice so far. Nikki independently noticed a **remaining slight robotic feeling in word pronunciation/delivery**. This is qualitative *listening feedback*, not an acoustic measurement, formal MOS score, or professional voice-acting review. The three voices remain the shortlist, with no commercial publication authorized.

## Root-cause hypothesis
Kokoro produces materially better neural speech than the previous Piper candidates, but weak accents and evenly rendered local stresses can reveal synthesis. Phrase-final boundary tones and reductions also matter. A final-wave fade will not repair lexical stress, weak coarticulation or semantic emphasis. We need experiments that touch actual phoneme and prosody input, not merely mix/mastering.

## New engineering tools
- `voice-kokoro-microprosody.py` builds nine private real neural audition takes from the existing three favored voice IDs. It compares the original exact sentence, an *experimental lexical-focus stress-token intervention* on “only”/“beginning”, and an alternative ellipsis boundary. Underlying segmental phonemes are preserved, and every stress alteration (original and modified IPA-like phonemes) is logged; a no-op intervention fails.
- `.github/workflows/voice-microprosody.yml` is an isolated Python 3.11/CPU Kokoro 0.9.4 rendering workflow. No paid provider calls. Its artifact includes original lossless WAV, playback MP3, exact hashes and offline listening room.
- `tests/media-voice-kokoro-microprosody.test.mjs` ensures fixed speaker identifiers, unchanged words, explicit edits, honest quality/rights boundaries, and CI runner validation.

These phoneme experiments are **not claims of linguist-approved stress placement or a better sound**. The public Kokoro `KPipeline` includes `g2p` and `generate_from_tokens`, which allow experimenting with resolved phoneme tokens:
https://github.com/hexgrad/kokoro/blob/main/kokoro/pipeline.py
https://github.com/hexgrad/kokoro/blob/main/examples/phoneme_example.py

## Important release boundary
Correct pronunciation requires a reviewer who actually listens to the audio, preferably a trained voice director or regional dialect reviewer. A synthetic stress marker may have an undesirable audible result; the point is controlled causal investigation. No performance score or automatic production approval. Model weights and individual voice rights still require independent provenance and attribution. PR stays draft.

## Next learning gate
Listen blindly to three variants for each candidate and answer two questions separately: do **word-to-word connections** feel less manufactured, and does **the sentence finish naturally**? Keep the best *individual* take for a scene; do not force one stress strategy globally. In a later iteration combine recorded actor/reference beats, verified phoneme alignment and expressive model conditioning if accessible.

## Correction from actual real-model receipt

The **first** nine-take experimental run passed technically, but the phoneme audit caught a **linguistic regression**: original Kokoro phoneme sequence for 'beginning' was bəɡˈɪnɪŋ (stress correctly on the middle syllable); the experiment changed it to bˈəɡɪnɪŋ (incorrect first-syllable stress). The 'only' sequence ˈOnli remained unchanged. Hence first-run 'lexical_focus' clips are REJECTED NEGATIVE CONTROLS, NOT an improvement. They stay as private debug evidence only.

Revised experiment: twelve private real-Kokoro takes across baseline, soft pause, completed thought and gentle speed 0.96, for V02/V05/V06. G2P original phoneme strings are measured, NOT altered. Source words identical. This is a listening experiment, not guaranteed naturalness.

Lesson: phrase-final intonation cannot be repaired by moving lexical stress to the wrong syllable. Don't generate guessed word stress until linguistically reviewed. Longer-term answer is a model with genuine expressive/discourse control, not invalid phoneme surgery.
