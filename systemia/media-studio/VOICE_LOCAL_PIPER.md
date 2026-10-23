# Evercraft Voice Foundry | Local neural audition operator guide

This is an **internal audition**, not a release, voice approval, commercial use clearance, or guarantee that a model sounds human. It makes no network requests or paid-provider calls. Piper and any model must be installed by the operator in advance. Model-specific licenses differ; verify permission for the intended use before creating a take. Do not impersonate a real person without their authorization.

## What this enables

Run a local Piper-compatible executable with explicitly pinned ONNX models and their JSON configs. Every candidate produces a separate WAV, exact SHA-256 provenance, acoustic signal report and pacing report. Once two or more takes are generated, Voice Foundry builds a **portable offline blind Listening Room**, ready for humans to compare naturalness, accents, emotional delivery, pacing and pronunciation.

## Prepare

1. On your chosen Evercraft worker (prefer a computer with enough memory and CPU), install a trusted Piper binary and lawfully obtained voice model(s). For each model retain its matching `.onnx.json` config and license/attribution evidence. The original open-source CLI supports `--model`, `--config`, `--output_file`, `--speaker`, `--length_scale`, `--noise_scale`, `--noise_w`, `--sentence_silence` and text via standard input.
2. Confirm all three real files exist and record: `sha256sum /absolute/path/to/piper /absolute/path/to/voice.onnx /absolute/path/to/voice.onnx.json`.
3. Copy and edit the example JSON at `systemia/media-studio/voice-local-piper-audition.example.json`. Replace all placeholder paths and SHA-256 pins. Use *two to six* candidates. All candidates must speak the exact same script and use the specified BCP-47 locale. Match the locale to each model config's `language.code` (e.g. `en_US` corresponds to `en-US`).
4. Make a fresh empty output folder and run `node systemia/media-studio/voice-local-piper-audition.mjs /path/to/your-private-plan.json /path/to/new-output-folder`.
5. Open `/path/to/new-output-folder/listening-room/index.html` locally and compare the takes. The `audition-manifest.json` and private per-take receipts stay in the output folder. No takes are auto-published.

## Review and limitations

Each candidate records the operator's declared `licenseEvidenceRef` but does **not** authenticate license permissions. Confirm all rights and consent independently. Piper may sound considerably better than the basic synthetic diagnostic voices, but subjective performance quality is unknown until actually heard. No model in this codebase is shipped or preapproved.

Use the separate ASR and blind-review reconciliation pipeline for real word accuracy and human comparisons. Silence measurements do not identify natural breaths, and a favorable transcript match does not establish acting quality. Commercial release requires independent accent/rights review, performance approval, and Systemia editorial release.

## Engineering verification

`tests/media-voice-local-piper.test.mjs` and `tests/media-voice-local-piper-audition.test.mjs` run FFmpeg with an explicit **fake Piper CLI** and fake ONNX file. They verify subprocess wiring, exact byte hashes, non-overwrite safety and portable room output. These tests contain **no actual neural speech**. To claim a real voice audition, someone must install and run a legitimate neural model, play the result, review it and record the evidence.
