# Bella Actor Lab | Voice Foundry | 2026-10-26

## Purpose

Improve the acting of Bella while protecting the timbre the owner already prefers: original Kokoro 0.9.4 af_bella (formerly V05). This is a private audition, not a new model, final commercial voiceover, or production promotion. Earlier attempts to force the Evercraft vowel and stress sounded worse, so those interventions remain disallowed.

## One controlled comparison

The dedicated workflow produces an artifact named bella-actor-lab-three-blind-takes-private, containing:

- index.html: a three-player listening room. Score without reading evidence.json first.
- take-01.wav / take-02.wav / take-03.wav: original native 24-kHz mono WAV, with no blending, cloning, pitch shifting, EQ or compression.
- evidence.json: exact scripts and variant mapping, native speed, seed, SHA-256 digests, real-file acoustic metrics and conservative release holds.

All candidates have identical spoken words. Punctuation and modest native speed changes are editorial hypotheses; the design does NOT isolate which of these caused a difference. Blind order is fixed and can be revealed in evidence, so reviewers who have seen the code are not fully blinded. Never overwrite the original V05 golden audio.

Preflight without model:
python systemia/media-studio/voice-bella-actor-lab.py --verify-only
python -m unittest discover -s systemia/media-studio -p test_voice_bella_actor_lab.py -v

Real synthesis requires the original Kokoro 0.9.4 runtime and model.
python systemia/media-studio/voice-bella-actor-lab.py ./NEW-EMPTY-OUTPUT-DIR

## Listening scorecard

Using matched listening volume, give each category a score from 1 (unacceptable) to 5 (excellent):
1. Human rhythm: one connected intention, without repeated resets.
2. Meaningful emphasis: key words have weight without shouting.
3. Emotional credibility: sounds like a person, not a voice system reading a script.
4. Sentence endings: no robotic glide, arbitrary rising pitch or abrupt cutoff.
5. Brand pronunciation: listen especially to the vowel and stress in Evercraft.
6. Speaker identity: does she still sound like our original Bella?

Separately flag hard defects: skipped/added words, mispronunciation, artificial syllables, audible clipping, or broken timing. Report the timecode and phrase. If the original golden control wins, retain the golden control. RMS, speed and waveform hashes are NOT perceptual quality ratings.

## Next experiments and release gates

After the first human listening verdict, isolate punctuation and speed in separate experiments with same words, model and seed. Then repeat with real long-form documentary, quiet conversational dialogue, and commercial scripts to check generalization. Add actual ASR word fidelity evidence and a human pronunciation panel. No auto-retuning of model/IPA, no fallback narrator, and no speculative claims of better quality.

Keep release blocked until founder review, rights/model-source checks, client copy approval where applicable, and a reviewed video/audio mix. Workflow success means the synthesis and waveform checks ran, not that Bella sounds better or is commercially cleared.
