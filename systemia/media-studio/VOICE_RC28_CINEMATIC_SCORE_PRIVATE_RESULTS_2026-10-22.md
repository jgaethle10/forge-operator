# Voice Foundry RC28 | Original cinematic audio-scoring audition
Date: 2026-10-22
Status: PRIVATE RESEARCH, NOT FOUNDER-APPROVED, NO AD PUBLICATION.

## Creative context and locked voice sources

RC26 finalists #2 (feeling) and #3 (visual-first) earned favorable founder feedback; the rejected sentence "We know that feeling" was cut from both and re-rendered successfully in RC27. The founder has not yet confirmed hearing/approving the RC27 transition, so the entire RC27 narration is treated as an intact audition, not a production cast.

Source: GitHub Actions run 39691755428, audio artifact 12388978327, with 4 full original female Kokoro WAVs and their companion MP3 files. They are unchanged and separately preserved in the packaged source ZIP. RC28 deliberately introduces NO new speech generation, new ad copy, phoneme changes, speaker swaps, or publication claims.

## New production experiment

Four original, privately scored cinematic audio previews were rendered locally from the verified RC27 WAVs:
- feeling-heart (18.145 sec)
- feeling-nearheart (18.145 sec)
- visual_first-heart (15.050 sec)
- visual_first-nearheart (15.250 sec)

The visual-first cuts feature a 2.25-second INSTRUMENTAL INTRO before the voice. This represents a time allocation for a real opening visual; there is no produced video here. The feeling cuts start narration after .22 sec.

The newly composed underscoring uses deterministic procedural oscillators and filtered noise only. No commercial stock audio, pre-recorded sample library, vendor sound pack or third-party song was used. Sparse felt-like synth notes, restrained ambient chord pads, original Bm to Gmaj7 to Dadd9 to Asus4 to D resolution. It is a demo SCORE to be reviewed by the founder, not an approved final music selection.

Music stays stereo; a gentle 78-Hz high-pass filter is applied to the derived voice channel. The dry original RC27 WAV remains untouched and included. Score level is ducked under narration, with smooth ramps and a balanced tail. No words cut or regenerated; the only changes to derived speech are 2x resampling to 48 kHz, EQ and 12-ms full-clip edge fades.

Final masters: 48-kHz stereo 24-bit WAV. MP3 audition copies. Two-pass FFmpeg EBU R128 normalization target -16 integrated LUFS, -1.8 dBTP. Actual measured results:
- feeling-heart: -16.06 LUFS, -1.80 dBTP
- feeling-nearheart: -16.12 LUFS, -1.80 dBTP
- visual_first-heart: -16.09 LUFS, -1.80 dBTP
- visual_first-nearheart: -16.08 LUFS, -1.80 dBTP

QA: all 4 original source WAV hashes verified against the GitHub run evidence, all 4 mastered WAV and preview MP3 hashes verified, all 8 music/voice stems verified. The founder-rejected sentence remains absent in all scripts. Verified no voice audio appears in first 2.20 sec of visual-first derived voice tracks. Stereo 48-kHz signed PCM24 checks passed. Two matched-dry A/B reels built using untouched source words, to allow equal-loudness comparisons.

## Portable private package

Packaged as Evercraft_RC28_Cinematic_Audio_Foundry.zip (about 50.3 MB) including:
- 4 finished private audio-preview MP3s and corresponding 24-bit PCM masters
- 4 full-duration voice-only stems and 4 original-score stems
- 2 loudness-matched dry reference WAV/MP3 pairs, 2 dry-first-versus-scored A/B reels
- SOURCE_RC27.zip, SHA-verified evidentiary reference
- REPRODUCE_RC28.py and MAKE_COMPARISONS_AND_QA.py (Python source and QA)
- RC28_EVIDENCE.json (per-track SHA and R128 measurements), LISTEN.html and README_FIRST.md

ZIP SHA-256: fde50f419564fbaa4d61abefa5f2b21dbf9ffa9313a935c75ea69a785e26256b.

The full reproducible code is included INSIDE THE GENERATED PRIVATE PACKAGE, not represented as merged repository code. This documentation records its provenance and editorial status.

## Holds and next action

Listen to the clean-versus-scored comparisons for each selected Heart take. Founder may reject, revise or prefer bare voice; there is NO approved music direction. Build a real demonstration film with rights-cleared graphics and live product proof once the audio direction is approved. Confirm a real reachable CTA/checkout URL and all music, model, voice, software, graphics and release rights before public or paying-customer use. No public deployment, no releases, and no customer representations were made in this run. Keep PR #1465 draft and unmerged.
