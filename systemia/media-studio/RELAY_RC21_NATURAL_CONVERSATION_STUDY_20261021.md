# Relay RC21 | Natural Conversation Voice Study | 2026-10-21

Status: **actual RC21 film exports rendered and QA-tested locally; new native neural takes NOT yet verified; unpublished private review.**

## Research and acting findings
- Speech communicates information structure using pitch accents, prosodic phrase boundaries, amplitude, timing and pausing, not merely the pitch direction of its last syllable. Hirschberg, Oxford Handbook of Language Prosody (2021); Daniel Büring, Intonation and Meaning (2016).
- PNAS/PMC 2025 observational work in spontaneous conversation finds recurring intonation-unit pattern sequences not mirrored in scripted speech: https://pmc.ncbi.nlm.nih.gov/articles/PMC12054737/
- SAG-AFTRA Foundation on *Voicing Commercials to Picture*: audience, message, on-screen action, and voice acting intention determine cadence: https://sagaftra.foundation/programs/19349/
- Distinct Relay intentions: normal observation → surprising inconsistency → contrasting plans → understated warning → solution/relief → collective decision → confident quiet promise. No seven matching announcer endings.

## What was actually produced
**RC21 full 31.033333-second video**, 1080×1920 and 720×1280, 30fps, H264 video stream bit-for-bit identical to RC20. Re-edited 7 original native Kokoro `af_bella` recordings from RC16 against previously approved-looking *Driving Ambition* music arrangement. Timing and gain curves vary per phrase; NO new neural take, synthetic breathing, phoneme editing, new voice, formant shift, or post-synthesis pitch warping.

- 1080p review video SHA-256: `ac0aca054aef67b1ab1d21f3e0cecc463b0469c67bfc8a8014f86010b71c463e`
- 720p review video SHA-256: `a13abf1df08889a92375e4a977bb526b8cc07a54366f40e0f18b4543f532333e`
- Film H264 video bitstream hash same as RC20: `463b4790a8104ddd5c23b636f518b2884037cb5e743a6ac3de172ba7cab592c4`
- Both videos decode. 1080p integrated loudness about −16.8 LUFS and true peak −1.7 dBFS.
- Creative acceptance still pending.

## Engineered actual native re-recording path
New GitHub files committed on branch `feat/relay-voice05-film-audition-20261020`:
- `systemia/media-studio/relay-voice21-native-study.py`: 7 original line texts and 7 conversational punctuation variants, exactly the same spoken words, original `af_bella`, natural G2P, fixed seeds, two per-line model speeds, SHA-256 WAV receipts.
- `.github/workflows/relay-voice21-conversation.yml`: eligible private runner, installs Kokoro 0.9.4 and validates fourteen newly generated source WAV files if its job actually runs and succeeds.

**No GitHub Actions run ID or output artifact was independently confirmed at the time of this note. Do not claim fourteen new performances are complete, or splice them into the release film without retrieval/listening review.**

## System/rights boundaries
Evercraft Fabric read-only capability-match probe returned an SSE 429 error; no executed AI Boardroom council is claimed. Human creative direction and offline production were actually performed.

Featured Relay pilot compares *fictional structured meeting fields requiring human confirmation*, not proven unrestricted semantic conversation understanding. Actors are illustrative stock. Music underlying composition **Driving Ambition** is by **Ahjay Stelino via Mixkit**; Evercraft Music contributed mixing, not authorship. Base synthesized voice is **Kokoro af_bella**, directed/integrated by Evercraft Voice Foundry.

## Publication holds
Requires founder listening judgment, actual permission/clearance for intended media placements, tested public pilot contact route, exact posting account and approved payload. No website upload, marketing publication, customer outreach, payments, or new model deployment performed. The private production zip was made as a conversation download, not committed to GitHub.

Creative next gate is blind, loudness-matched A/B listening of any genuinely new native WAV artifacts *to film* and comparison against RC16, RC20, RC21. Reject artificial rise/fall decoration and any timbre damage.
