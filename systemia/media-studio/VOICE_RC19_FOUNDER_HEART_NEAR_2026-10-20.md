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


## Actual RC19 outcome (verified neural generation)
- First run 39535338281 stopped at preflight because a seven-candidate plan retained a uniqueness assertion for six entries. No inference was executed in that failed run. Fix commit: 868ddf8e8bbe90a5ee4cf6128008a1a9b083e98f.
- Retried GitHub Actions run: https://github.com/jgaethle10/forge-operator/actions/runs/39535480068, **success**.
- Artifact 12317024082: evercraft-rc19-heart-near-audition. All fourteen WAV and fourteen MP3 files were checked against the corresponding evidence.json SHA256 receipts after download.
- Repeated pure Heart takes D/G are bit-identical in both scenes, and exactly reproduce prior RC18 pure Heart E WAVs in both scenes. Pure Bella take B is identical to RC18 Bella A WAVs for both scenes. These are byte-for-byte comparisons, not correlation estimates.
- Tagline durations by take: A 3.450 s, B 3.725 s, C 3.525 s, D 3.425 s, E 3.425 s, F 3.575 s, G 3.425 s. Durations alone cannot identify an improved vowel.
- Offline listening studio and rating/export scorecard created with validated source hashes. New blind listening results **not yet supplied**. No winner or deployment claimed.
- The RC19 heavy neural workflow is now manual dispatch only after this successful test, avoiding repeated inference on unrelated PR commits.

**Decision hold**: founder has identified pure Heart as closer on the target vowel, but whether any RC19 blend beats that known reference and preserves preferred overall delivery remains pending human listening. Original V05 remains the approved control, NOT a cleared commercial voice.
