# Evercraft Voice Foundry | RC19 founder-guided Heart-near articulation experiment

Date: 2026-10-20. Status: private audition; no spoken-word improvement or commercial approval yet.

## Founder listening result
The founder listened to the RC18 fixed-seed six-take tagline reel. Exact feedback: "That second to last one was pretty close to the a sound in Evercraft that we are looking for. This is fun fam keep pushing." The second-to-last was E: pure Kokoro af_heart (heartWeight 1.0); F was the repeated af_bella control. This is a positive partial pronunciation-direction clue, NOT a claim that the whole E performance is perfect. The preference for V05 Bella remains the protected all-around baseline, while Heart's brand vowel realization deserves study.

## Question
Does moving from Bella toward Heart give a closer 'a' in Evercraft, without losing the preferred character or full-sentence naturalness?

Seven letter-labeled conditions across original tagline and commercial line in voice-heart-near-rc19.py:
A = 80% Heart, B = pure Bella, C = 60% Heart, D = pure Heart, E = 90% Heart, F = 40% Heart, G = pure Heart duplicate control.

Same script per scene, ordinary Kokoro full-text KPipeline, no IPA edits, fixed seed 1701 reset before every take, fixed speed. The label order deliberately is not sorted by Heart weight. Two pure Heart controls must be bitwise identical, or the render fails. The receipt contains mapping and WAV/MP3 hashes.

## Listening
Founder evaluates naturalness of the 'a' in Evercraft and transitions into and out of that vowel, then overall cadence, meaning, and retention of V05 Bella identity. Evaluate both tagline and commercial. Another listener can provide an independent opinion. No objective metric or completed CI run can certify perceptual improvement.

If Heart-near sounds better only because it changes speaker identity, treat it as an alternate casting direction, not a silent replacement of Bella. All experimental voice mixes remain private and unapproved.

## Cross-model status
Chatterbox reference-free expressive trial completed successfully in Actions run 39530759233 and produced two source WAV/MP3 pairs. Those are not the same voice as V05 and are separate from this controlled Heart-near experiment. No recorded actor voice or unauthorized reference was used.

## Guardrails
Draft PR #1465; never merge, publish, alter canonical V05, claim verified speaker/weights rights, or commercialize without explicit approval.
