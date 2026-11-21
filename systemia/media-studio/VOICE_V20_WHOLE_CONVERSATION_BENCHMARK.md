# Voice Foundry | V20 whole-conversation model benchmark

**State: SOURCE/RESOURCE PREFLIGHT ONLY. No new speech has been rendered and no voice candidate is approved.** This is an engineering response to the founder rejecting both V19 edits.

## Why this is a meaningful change

V13–V19 primarily used independently synthesized lines, text punctuation, pitch correction and word stretching. That cannot prove the agent and owner perceive each other's reactions. The earlier full-scene review guard is now green, but it is intentionally *fail-closed*, not a speech generator.

This V20 bridge assembles an authentic multi-turn seven-cue request directly from:
- `systemia-v15-emotion-context-plan.json` (roles, dialogue, initiating event, state transitions and actor goals)
- `systemia-v19-founder-rejection.json` (both takes REJECTED)

It preserves exact owner/agent roles as `[S2]` and `[S1]` and the original script order. It explicitly separates director metadata (beliefs/appraisal/goals) from the supported model inputs (text plus previous audio), avoiding claims that a model consumes arbitrary emotional JSON.

Source: `voice-dialogue-benchmark.mjs`. Tests: `voice-dialogue-benchmark.test.mjs`. CI: `voice-dialogue-whole-scene-benchmark.yml`.

## Candidate: genuine dialogue-conditioned speech

First research candidate: **Nari Labs Dia2**, Apache-2.0-listed external pretrained models (Dia2-1B, Dia2-2B). Official source: https://github.com/nari-labs/dia2

Official code describes:
- Two-role tagged dialogue with `[S1]` and `[S2]`.
- Previous-audio conditioning via `--prefix-speaker-1` and `--prefix-speaker-2`.
- Streaming and word-level timestamps; voice consistency remains variable.
- The documented high-performance path uses CUDA 12.8+ and GPU; CLI also supports CPU with the proper dtype, but no practical CPU feasibility has been proven here.

**Never mistake a previous audition WAV for a consented/rights-cleared prefix**. The benchmark requires both reviewed speaker identities, byte-matched SHA-256 WAV files and separate rights-evidence references. Existing V02/V06/Nano takes have not satisfied those conditions. An explicit founder rejection never becomes a positive model score.

## Operating sequence (all gates, no silent shortcuts)

1. **Current completed step:** generate `dialogue.txt`, a held benchmark JSON receipt and a read-only available-GPU audit. It downloads no model or samples.
2. **Outstanding:** verify a machine with suitable GPU, CUDA/driver stack, memory and enough free disk. The runner on GitHub Actions is a *test machine*, not proof about the Chromebook or HP. Do not provision a paid GPU.
3. **Outstanding:** select the source Dia2 checkout SHA, pin the model checkpoint revision and seed, verify the specific license/model card.
4. **Outstanding:** supply rights-cleared, consented agent/owner reference voice WAVs; verify source SHA and identity by independent review. Don't automatically use voices from previous experimental recordings.
5. **Future private controlled synthesis:** run the exact `dialogue.txt` as one multi-speaker sequence with both reviewed prefixes in a sandboxed local model runtime. Measure hallucinated/missing words, timing drift, voice identity consistency, context-appropriate reactions, and naturalness compared to the **recorded** V15/V19 baselines.
6. **Full-scene blinded human listening:** at least two genuine independent reviewers must listen to the same uninterrupted complete dialogue and provide external/verifiable review evidence and intelligibility, emotional truth, responsiveness, character consistency ratings. In-chat strings are not authentic reviewer identity proofs. Founder retains final artistic veto.
7. **Release:** even a winning model test is **not** voice, film, curriculum, customer or public launch approval. Actual commercial rights, canonical Fallen asset acceptance, live University enrollment path and founder publication gate remain separate.

## Evidence truth

As of this change, the test is a reproducible audition REQUEST with state `held_missing_two_authorized_voice_prefixes`. No Dia2 model download/inference occurred. `audit-runtime` uses local `nvidia-smi` read only. A CI runner reporting no GPU does not prove the founder's HP or other physical machines lack a GPU.

The team should **not** present another single-word pitch tweak as V20 success. V20 succeeds at the first stage when the benchmark reproduces the complete context and rejects fabricated actor approval. V20 reaches the next stage only when a new actual whole-dialogue model audio file and legitimate blind listener evidence exist.
