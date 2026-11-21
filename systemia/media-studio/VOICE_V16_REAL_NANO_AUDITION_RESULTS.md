# Evercraft Voice Foundry V16 | Real expressive-model A/B audit

**Milestone:** First separate, real CPU speech model rendered via owned Voice Foundry canary; NOT a verified improvement in conversational acting.

## Independent evidence
- Successful [GitHub Actions Nano render and QA #39548051991](https://github.com/jgaethle10/forge-operator/actions/runs/39548051991). Initial #39543775394 successfully generated three WAVs but failed at independent QA due missing `ffprobe`; corrected by installing FFmpeg/FFprobe before verification. Final successful job uploaded `evercraft-voice-foundry-nano-expression-private-auditions`, artifact #12322473154.
- Three actual complete mono 24kHz audios; human-owner line "Wait. You sent it? I said draft." (neutral); the same spoken words plus model-native `[chuckle]` reaction; separate matter-of-fact agent line "I already sent it.". Each independently SHA256-bound and probed. No human voice cloning/reference supplied.
- **Successful run actual durations:** neutral 2.28s; with `[chuckle]` 3.36s; agent 1.24s. The tagged take is 1.08s longer, **not evidence that a genuine chuckle occurred or that acting is more appropriate**.
- Checkout of official upstream resemble-ai/chatterbox code is recorded as `5de7a54aa4e5e2baadb0182dde554908b48b85c2` in the actual receipt; **model weight revision is not pinned**, repeated runs can differ due to stochastic synthesis. Underlying source/model MIT claims come from upstream; proper commercial brand/voice use still requires verification.
- The listener comparison assembled in session `Evercraft_V16_Real_Voice_Reaction_ABCD.mp3`: A Nano neutral owner, B Nano tagged reaction, C existing V15 Kokoro direction owner, D Nano neutral agent. All use same speech RMS (-27dBFS within 0.01dB), 12ms fades and 0.9s silence between; none of the words are rewritten or time stretched. Original unmodified WAVs are in `Evercraft_V16_Real_Audio_Comparison_Kit.zip`, with source hashes and local reproducibility script. Both generated files are **conversation artifacts, not GitHub/Drive uploads**.
- This is NOT an audition of the same actor voice across engines: no voice identity continuity proven. Comparing acting naturalness and pronunciation is valid as a first screen; judging final casting equivalence is not.
- No evidence of prior-turn audio conditioning; Chatterbox Nano native nonverbal tags do not make it a multi-speaker conversation model. Nano is an externally pretrained backend used under Evercraft control, **not proprietary Evercraft weights**.

## Rigorous gate before editing into the commercial
1. Hear A/B/C blind, at equal level, rate **word accuracy, believable surprise vs inappropriate giggle, speaking intention and naturalness** (not merely ability to make a noise).
2. Check D separately for calm agent performance and voice consistency across 7 scene turns, not a single sentence.
3. Only if human listening favors the candidate: pin weights and random seeds; re-render repeatability samples; test scene context, turn timing, interruption, speaker consistency and approval recognition.
4. Track licenses/consent, official brand, university enrollment, Fallen media admission, visual truth and founder approval before any public ad. No voice/commercial publishing currently authorized.

## Product decision
**Voice Foundry adapter: research-only.** This experiment validates CPU synthesis and independent file QA. It does **not** establish a new commercial-quality voice, natural conversation, or a better film.
