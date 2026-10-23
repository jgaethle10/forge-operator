# Voice Foundry | Push 16 | Baseline recovery and V05 identity lab
Date: 2026-10-20. **Private research only. PR #1465 stays draft.**

## Founder acceptance gate
V05 Kokoro af_bella is preferred. Founder rejected the prior 12-take brand pronunciation/stress experiment. Nikki independently heard robotic word-level phrasing. Preserve original V05 unchanged. Passing CI or producing an audio file is not a human-audible improvement.

## Evidence-backed diagnosis
Original V05 came from voice-model-shootout-ci.py using normal KPipeline(text, voice='af_bella', speed=1.0). Rejected variants in voice-v05-brand-stress-lab.py intercepted G2P MTokens, edited vowel/stress, then called generate_from_tokens.

Upstream Kokoro English normal and token generation use the same tokenization and inference machinery. No evidence shows that the token API itself caused the failure. Editing lexical input changed the model's timing and prosody, with a negative founder listening verdict.

Downloaded and inspected actual PCM audio from artifact 12283983840 (first six-voice shootout) and 12310232975 (rejected stress/vowel run):
- Original V05 and later unchanged tagline-model_original each contain 89,400 frames at 24 kHz, or 3.725 seconds. Unaligned sample correlation ~0.99779 but WAV SHA-256 hashes differ.
- Stress-modified tagline WAVs each have 87,600 frames, 75 ms shorter than the original. Vowel-only experiment retained 89,400 frames.
- Direct sample correlation is extremely sensitive to tiny shifts and cannot identify the perceived defect or prove a localized vowel repair.
- These objective findings document synthesis differences, not a naturalness improvement.

## A different experimental lever
Previous micro-prosody audition already tested punctuation and speed. This run does NOT repeat it. voice-v05-timbre-lab.py instead retains original words, Kokoro's G2P, sentence-level synthesis, and speed. It varies only the embedding between two already-shortlisted voices, Bella and Heart.

Within each of two scenes: A pure original V05; B 95% Bella and 5% Heart; C 90% Bella and 10% Heart; D 80% Bella and 20% Heart; E pure Heart; F repeat pure original V05. Six variants times two scenes equals 12 actual neural WAV/MP3 samples in a successful run. No IPA edits or global replacements.

The blended voices are NOT automatically the same performer or acceptable regional accent. Offline listening room, dry PCM, normalized MP3 previews, SHA-256 evidence, original brand G2P, and a duplicate-control consistency result are generated. No model/voice commercialization rights are claimed.

## Acceptance
Founder and a second independent listener should score blind for naturalness, brand consonant/vowel transitions, meaning, cadence, and *identity preservation*. Pure Bella stays preferred unless another take is clearly superior without unacceptable timbre drift. If none wins, reject all mixes and consider genuine expressive conditioning with an authorized actor reference, not another phoneme hack.

## Provenance and holds
- Original: https://github.com/jgaethle10/forge-operator/actions/runs/39464600851
- Rejected: https://github.com/jgaethle10/forge-operator/actions/runs/39519729914
- Pipeline source: https://github.com/hexgrad/kokoro/blob/main/kokoro/pipeline.py
- Workflow: .github/workflows/voice-v05-timbre.yml
- Original V05 casting unchanged: YES.
- Owner quality approval: NO.
- Model checkpoint and human voice talent rights independently verified: NO.
- Commercial release, default profile promotion, Evercraft Clip publishing: NO.
