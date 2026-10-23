# Voice Foundry | RC21 commercial finishing | 2026-10-20

## Founder signal and scope
After hearing the actual RC20 three-scene neural audition, the founder reported: "Fam wtf that's incredible! 🔥 a little bit of work and that shit is ready for commercials and shit 😭".
This is **positive listening direction and a request to continue engineering**, NOT explicit permission to merge, commercially publish, charge clients for a specific voice, or skip rights verification. Existing V05 Bella, V02 Heart, V06 Michael and RC19 Heart-near/RC20 identity experiment remain as originally generated.

## Actual technical work
Using the downloaded RC20 run 39539295439 artifact 12318951455, and checking the 24kHz original WAV SHA256 against its real evidence.json, a fully offline zero-cloud, non-destructive two-pass mastering audition generated ten **48kHz 24-bit mono PCM** mastered WAVs with separate MP3 previews.

Input recordings: commercial-H, commercial-M, conversation-H, conversation-M. For each, both a clean level-matched reference and a light-color/presence version. The latter uses a gentle 70Hz highpass, -0.8dB near 270Hz, +0.8dB near 3.3kHz, and a 1.35:1 compressor before loudness normalization. Those adjustments are a controlled *experiment*, not proven to be more natural. Two additional reference-only US television-style quieter masters of the commercial reads were generated.

The offline script, the unmodified RC20 WAVs, ten mastered WAVs, ten MP3 previews, exact hashes, output loudness receipts, and an HTML A/B listening page are in the user-delivered RC21 package. The source script is reusable on a new RC20 zip. No model weights or provider API calls are needed.

## Measured results from actual files
Each entry lists measured integrated loudness / measured true peak in dBTP (mono dual-mono EBU R128 FFmpeg measurement):

| Record | Clean online | Presence online | Quieter US TV reference |
|---|---|---|---|
| commercial Heart | -16.40 / -1.95 | -16.31 / -1.95 | -24.00 / -5.97 |
| commercial 85% Heart blend | -16.35 / -1.97 | -16.32 / -1.97 | -23.95 / -8.32 |
| conversation Heart | -16.24 / -2.00 | -16.30 / -2.00 | n/a |
| conversation 85% Heart blend | -16.00 / -2.60 | -16.24 / -2.00 | n/a |

All ten WAV and ten MP3 SHA256 values were rechecked from the generated files. The two-pass FFmpeg processor documents whether it selected **dynamic** normalization or **linear**, and does not claim an EQ coloration caused a perceptual quality gain. Two ad A/B reels compare clean first and colored second with a 650ms silent gap between *different entire performances* and zero edits within words.

The online review target is -16 LUFS / ceiling -2 dBTP. The US TV loudness reference targets -24 LKFS / -2.3 dBTP. These are **engineering targets for isolated voice files**, not guaranteed platform compliance of a final mixed advertisement. Delivery platform requirements, final music+dialogue integrated loudness, channel configuration, surround/downmix, true-peak after lossy codec, and legal acceptance must be separately checked.

## Committed evidence gate
- systemia/media-studio/voice-commercial-qa.mjs: verifies RC21 receipt schema and hold flags, original source SHA256s, all ten WAV/MP3 SHA256s, loudness and true peak measurements, and 48kHz/24bit WAV format via ffprobe.
- tests/media-voice-commercial-qa.test.mjs: positive and negative automated unit gates. Green CI verifies the code, not subjective acting or full advertising release.

## Work not yet done
Founder has not compared RC21 before/presence samples. Do not identify a mastering winner without listening. No music mix, final picture lock, customer ad order, licensed narrator rights, actor-consent evidence, or complete model/voice provenance approval exists from this RC21 test. The checkpoint remains unpinned. No production voice profile was changed or released; no customer was billed. PR #1465 remains draft. Publication and end-customer authorization remain false.

Source rendering and model rights must be verified independently before any revenue-facing delivery, even if a sample sounds genuinely human.
