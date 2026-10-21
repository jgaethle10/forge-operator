# Voice Foundry | Push 20: From phoneme correctness to performed intention

Date: 2026-10-20. Research and private audition only. Keep PR #1465 draft.

## Founder signal

After hearing the verified RC19 7-take, Heart-near pronunciation comparison, the founder said: "Fam this is incredible 😭 I love it! Keep pushing". This is **enthusiastic acceptance of the overall direction and experience**, not an independently recorded selection of one take, a voice-contract approval, a model license review, or permission to release. The earlier exact clue remains: RC18 E (pure af_heart) was *close* to the intended 'a' in Evercraft. V05 af_bella remains the original holistic favorite unless the founder explicitly ranks specific RC19 takes.

## Engineering response

Implemented a new **scene-performance RC20** in systemia/media-studio/voice-rc20-performance.py and .github/workflows/voice-rc20-performance.yml. Twelve real neural samples are planned across three scripts: documentary, commercial, and spontaneous conversational performance. Four cast conditions keep the exact same words per scene:

- B: untouched original af_bella
- H: untouched af_heart
- M: 85% Heart / 15% Bella identity interpolation (explicitly research-only)
- V: untouched favorite masculine-presenting am_michael

Each new take uses full-text KPipeline with Kokoro 0.9.4, speed 1.0, fixed seed 1701 reset before each take, no G2P phoneme changes, no cloned or user reference audio. Model-intended director briefs are **only shown to listeners, not passed to the synthesizer**. Original 24-kHz 16-bit dry WAVs remain protected, with separate level-matched MP3 previews, exact audio SHA-256 receipts, sampling and quality gates, and an offline listening page.

## Acceptance

Listen in context for (1) credibility of the emotional thought, (2) the sound and coarticulation of Evercraft, (3) authentic pacing and word-to-word connection, (4) natural sentence-final/question tones, and (5) recognizable persona. A strong performance in one scene is not automatically the right voice in every scene; cast per scene. Never infer that changed embedding automatically improved pronunciation, that audio hashes prove human likeness, or that a green workflow equals founder approval.

A private package builder additionally generates offline scoring cards and longer per-voice scene reels from downloaded, independently SHA-verified WAV+MP3 artifacts. The long reel contains intentional pauses **between scenes only**; no artificial breaths, phoneme edits, or hidden speech corrections.

## Governance

The voice catalog is still private experimentation, not a rights-cleared commercial voice product. Model checkpoint SHA pinning and underlying model voice/training rights remain open. Do not merge PR, change production defaults, deliver customer voice acting, publish the audition audio publicly, or deploy through Evercraft Clip without explicit approval and the proper rights review.
