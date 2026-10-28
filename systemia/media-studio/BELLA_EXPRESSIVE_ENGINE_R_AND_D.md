# Bella Voice Foundry | Expressive Engine Bridge (research-only)

**Goal:** develop an intimate, magnetic, quietly confident Evercraft narration voice that invites listeners deeper without artificial breathiness, forced pitch, or phony flirtation. Original native Kokoro `af_bella` V05 remains the golden reference. The *name Bella* is not a promise that a cross-model adaptation will retain the exact acoustic voice.

## Why this branch exists

The Kokoro experiments in PR #1667 have genuinely rendered private WAVs, preserving the recognizably warm Bella voice. The architecture exposed in this project has limited direct control of emotional acting. More punctuation and EQ is not a genuine acting control.

**Engine R&D candidate:** Resemble AI Chatterbox, *original English 500M model*, offers explicit `exaggeration` and `cfg_weight` controls, with optional audio prompting. This is distinct from Chatterbox Turbo/Nano/Multi V3, which do not share all controls. Official source and examples:
- https://github.com/resemble-ai/chatterbox (code/license MIT visible; README)
- https://github.com/resemble-ai/chatterbox/blob/master/example_tts.py
- Kokoro reference (model-weight documentation): https://huggingface.co/hexgrad/Kokoro-82M

Do not infer individual voice/reference rights or complete third-party dependency compliance from a repository's software license. No downstream use is cleared solely by being MIT/Apache. Chatterbox's watermarking documentation is not independent evidence that a particular clip has a verified watermark.

## Executable workflow

`voice-bella-expressive-chatterbox.py --verify-only` exercises the design without network or neural dependencies.

**A real sample cannot be rendered by default.** For an authorized private demonstration, first supply a 6–20 second *actual dry 24-kHz mono PCM16 synthetic Bella WAV* and a locally held consent/rights-evidence JSON document. Never commit reference audio or private evidence to the public repository.

Example private file `private-bella-experiment.json` (fill with real evidence, do not invent or falsely assert permission):

```json
{
  "schema": "evercraft.bella.reference-authorization.private.v1",
  "referenceKind": "synthetic_kokoro_af_bella",
  "referenceSha256": "<real 64-character file SHA-256>",
  "privateExperimentOnly": true,
  "noPublicationAuthorized": true,
  "permissionToUseReferenceInExpressiveTest": true,
  "evidenceRef": "<real, traceable authorization record>",
  "commercialReleaseRightsVerified": false
}
```

Run preflight first, with no model download:

```bash
python systemia/media-studio/voice-bella-expressive-chatterbox.py \
  --reference /private/bella-owned-dry.wav \
  --authorization /private/private-bella-experiment.json
```

For actual private synthesis on a properly provisioned, authorized machine, install and review `chatterbox-tts` dependencies in an isolated environment, then provide `--output /private/new-empty-output-dir --device cpu` (or an approved GPU). This loads Chatterbox and produces three real native Chatterbox WAVs with the **same script, source, and seed**:
- Control: exaggeration 0.50, CFG 0.50.
- Expressive: exaggeration 0.70, CFG 0.50. (One variable changed.)
- Patient: exaggeration 0.70, CFG 0.30. (One variable changed relative to expressive.)

The specific settings are test hypotheses from the model's README, **not measured sexy/warm output**. Lower CFG and higher exaggeration can alter pacing; this is not pitch control. Each result must pass word-correctness and intelligibility review, real-audio metrics, source-identity assessment, and independent human listening against the original untouched Kokoro audio, at comparable listening loudness.

## Hard holds

- Requires an exact SHA-bound private synthetic-Bella reference and explicit private experiment authorization. The JSON flag is a *caller claim*, not independent legal verification.
- No actual voice cloned or Chatterbox audio produced by the model-free CI tests. Code gate passing is not engine runtime validation.
- A reference fingerprint only proves file integrity. It does not establish voice permission, consent, training data rights, model checkpoint provenance, commercial usage permission, timbral match, or acting quality.
- Never share unapproved reference audio publicly. No customer or social publishing, automatic merge, voice replacement, monetized use, or actor likeness claims.
- Chatterbox weights/dependencies may require download and resource allocation at inference time. Record the precise deployed model/weight digests before promoting production.
- If Chatterbox sounds like someone other than original Bella, this is **not a Bella upgrade** regardless of expressivity. Preserve original voice and evaluate another model or properly consented approach.

## Immediate verification

The workflow `.github/workflows/voice-bella-expressive-preflight.yml` runs test fixtures with *real WAV files containing synthetic test tones*, proves reference integrity and denial behavior, and confirms that CI does not download models or synthesize any cloned voice. It is deliberately not an audio demonstration or a license clearance.

**Status: ENGINEERING_GATE_ONLY, PENDING AUTHORIZED PRIVATE INFERENCE + HUMAN AUDITION.**
