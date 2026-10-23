# Voice Foundry Cadence Lab 12 | Owner listening feedback and neural prosody experiments

Status: development-only audition. No speaker rights, naturalness, expressive acting or publication authority are inferred from these recordings.

## Owner listening decision (2026-10-20)

- Four initial Piper LibriTTS-high neural speaker clips were played to the owner. Ranking: **A > C > D > B** (A = speaker index 14, C = 217, D = 531, B = 91).
- Qualitative issues remain: artificial / robotic sentence endings; unnatural word-to-word cadence and articulation. This is the primary blocker, NOT mastering loudness.
- A and C are preferred for iteration, **not approved** for commercial narration or production.

## Experiment

`voice-cadence-lab-ci.py` renders eight full real neural takes, four each for original speaker A and C. The same words in the same order are required by `verify_variants()`; changes are strictly punctuation, sentence joining, length_scale and sentence_silence. No music, pitch shifting, synthetic breaths, voice identity swaps, ASR invention, or post-processing except MP3 encoding for playback.

| Variant | Text treatment | length_scale | sentence_silence |
|---|---|---:|---:|
| original | Original short sentences | 1.00 | 0.20s |
| joined | Joins `This is Evercraft. And...` into `This is Evercraft, and...` | 1.00 | 0.20s |
| flow | Same joined final sentence, deliberately more measured words and shorter silent gap | 1.08 | 0.07s |
| connected | Joins opening declarative and question; joins final line | 1.04 | 0.12s |

Fixed-model execution run: https://github.com/jgaethle10/forge-operator/actions/runs/39461855594

Audition artifact: `evercraft-neural-cadence-A-C` (artifact ID `12283422403`), seven-day GitHub retention. It includes eight real model-generated WAVs, eight MP3s, an offline comparison page and `cadence-report.json` with exact WAV/MP3 SHA-256 hashes. Locally verified all 16 audio digests after extracting the CI artifact.

Latest observed durations: A original 7.125s, joined 6.635s, flow 6.514s, connected 6.784s. C original 6.312s, joined 6.565s, flow 6.444s, connected 7.469s. These are *objective times*, not naturalness metrics.

## Methodology cautions

1. The Piper model has stochastic generation; runs are not seed-locked. These are experimental comparisons, not isolation of a single causal variable. Re-run each candidate several times before attributing a result to punctuation or pacing.
2. Lower length_scale speaks faster; higher length_scale speaks slower. Neither implies emotional truth. Intentional context, phoneme durations and sentence-final pitch contour must be judged by listening.
3. Validate word preservation separately from ASR, since correct script text supplied to the neural engine does not prove each word was pronounced faithfully.
4. Try stronger architectures only when attribution, model/voice rights and output ownership are verified; do not imply Piper mastering can engineer true acting capacity out of a limited model.

## Next acceptance gate

Owner listens to A-original, A-joined, A-flow and A-connected, then the C variants, rating two distinct deficits: **sentence-final naturalness** and **word-to-word cadence**. A candidate that improves only speed or loudness does NOT pass. If none qualifies, escalate to a more expressive licensed synthesis model and preserve these waveforms as honest baselines.

Never claim real-world deployment, voice approvals, or publication from this artifact.
