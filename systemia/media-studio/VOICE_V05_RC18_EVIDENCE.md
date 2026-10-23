# Voice Foundry | RC18 fixed-seed control audit | 2026-10-20

## Actual GitHub receipts
Repository: jgaethle10/forge-operator, draft PR #1465.
- Native pipeline versus unmodified-token diagnostic: GitHub Actions 39525580471, success, produced three fixed-seed sentences with **identical** output between the normal KPipeline and untouched generate_from_tokens path. The failed pronunciation experiment was NOT shown to be a token-path effect.
- V05 blending initial trial: GitHub Actions 39525580681, success, 12 actual Kokoro WAVs + MP3s. Repeated pure Bella controls were highly correlated but not identical (0.99747 and 0.99722), so inference variation could confound small blend effects.
- V05 blending fixed-seed repeat: GitHub Actions 39530342905, success, artifact 12314759553. 12 actual WAVs + MP3s. All 24 SHA256 matches validated from downloaded ZIP. Random seed 1701 reset before each take.

## Evidence from fixed-seed trial
- Two scenes: original tagline and commercial script.
- Six conditions per scene, fixed text/voice factors and phonemes: Bella, 5% Heart, 10% Heart, 20% Heart, Heart, Bella repeat.
- Tagline duration: A/F 3.725s, B 3.700s, C 3.700s, D 3.625s, E 3.425s.
- Commercial duration: A/F 10.300s, B 10.275s, C 10.250s, D 10.200s, E 9.700s.
- Duplicate pure Bella controls: **sample-for-sample identical** in both scenes, 1.0 waveform correlation and identical WAV hashes. This provides a stable experimental control. It does NOT prove anything about subjective naturalness.
- All 12 recordings are genuine Kokoro neural generation; no fake tone or voice cloning.

## New architecture comparison
Added original Chatterbox English zero-reference default-voice auditioner to explore a model with expressive-generation controls. Source: https://github.com/resemble-ai/chatterbox, MIT license listed; model card https://huggingface.co/ResembleAI/chatterbox. Exactly two identical-tagline attempts: default exaggeration/cfg 0.5/0.5 and expressive 0.7/0.3, fixed seed 1701, CPU inference. Private workflow: .github/workflows/voice-chatterbox-expression.yml. Do not claim neural audio until its workflow actually passes. No voice-cloning reference or customer/user voice recording is supplied.

## Founder listening gates
Owner preference remains V05 pure Bella, V02 Heart second, V06 Michael masculine-presenting. A previous 12-take Evercraft vowel/stress mutation trial was rejected by the owner. Nikki separately detected a residual robotic quality.
1. Blind listen to fixed-seed V05 blends in both scenes. Rate brand-name vowel/coarticulation, intention, cadence, and whether identity still matches preferred V05.
2. Audio integrity, comparable playback loudness and realistic duration are necessary but do not mean the sound is approved.
3. Reject all blends if they do not improve human perception or cause unacceptable timbre drift. Keep original first-liked V05 unmodified until explicit owner approval.
4. Distinguish cross-model Chatterbox different speaker from V05 same-identity improvements.

No production voice profile update, no merge, no commercial licensing endorsement, no Evercraft Clip publishing.
