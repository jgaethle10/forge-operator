# RC26 | Female commercial voice: stop forcing excitement into the question

Date: 2026-10-21. Founder direction: "Keep pushing" after explicitly rejecting Chatterbox's default voice for the commercial, approving the female voice family as closer, and repeatedly criticizing the unnatural build-up of the first line of script #1.

## What the experiment actually changes

Two focused alternative **full-script** auditions, two female-presenting existing Kokoro voice conditions (pure af_heart and the research-only 85% Heart/15% Bella blend). Original RC22 audio stays immutable, not regenerated or edited.

- FEELING: "I love that moment when an idea clicks. You can almost see what it could become. You just want to start. Then you open your laptop. Six tabs. Three workarounds. And somehow, you haven't even started. We know that feeling. It's why we're building Evercraft. More time making. Less time getting ready."
- VISUAL FIRST: "Six tabs. Three workarounds. And somehow, you haven't even started. All you wanted was to make something. We know that feeling. It's why we're building Evercraft. More time making. Less time getting ready."

**Important:** "visual first" only works with an actual film/animation/screencast of the idea being conceived for 2–3 seconds *before* narration starts. A raw audio-only playback begins with "Six tabs" immediately. We have a text storyboard, not motion footage or a finished commercial. We deliberately reduced the amount of telling the audience how to feel.

## Actual execution

- GitHub Actions: https://github.com/jgaethle10/forge-operator/actions/runs/39662251305 (success)
- Artifact: 12374870420 (evercraft-rc26-female-openings)
- Four authentic neural WAVs, four MP3 previews, both voices across the two full scripts. Every one of the 8 new audio files independently passed SHA-256 against source evidence.json.
- The offline studio contains the literal original RC22 source WAV/MP3 for problem-H and problem-M from run 39545754923, also independently SHA-256 verified. Not an approximation or fresh generation of the founder's favorite.
- Studio: Evercraft_RC26_Female_First_Seconds_Studio.zip. Includes 4 newly rendered WAV/MP3 pairs, 2 literal RC22 comparison WAV/MP3 pairs, two approximately 47-second same-voice comparison reels, original source receipts, preview page, director review HTML, ratings export and a text-only visual-first storyboard.
- The comparison reels decode the previously normalized MP3s and re-encode concatenations with exactly one second of silence **between complete takes only**, without edited phonemes or splicing inside utterances. All source dry WAVs and original MP3s remain unchanged.
- Completed heavy workflow was returned to manual workflow_dispatch-only after successful rendering.

## Commercial license nuance

The publisher's official Kokoro-82M Hugging Face README says **Apache-2.0** for model weights, describes production deployment as permitted, publishes some training-data source categories and CC BY attribution notes, and provides a model SHA256 digest. This is helpful evidence for evaluating commercial deployment; it is **not** blanket independent certification that every speaker-like voice, training-rights question, output clip, music asset, website script, downstream dependency, or the final advert is commercially cleared. Reproducibility still needs the exact locally resolved model checkpoint/voice pack hashes and the final NOTICE/LICENSE obligations recorded.

Official primary source: https://huggingface.co/hexgrad/Kokoro-82M/blob/main/README.md

## Founder creative approval still open

The model audio has never been rated by the founder for RC26. Positive feeling from earlier female Kokoro auditions is *directional*. No new hook or final ad selected. Human ear must rate (1) spontaneous intimacy of the first phrase, (2) meaningful visual/voice handoff, (3) continuity through "Six tabs. Three workarounds", (4) natural pronunciation of Evercraft, and (5) honest verifiable final customer destination.

No production deployment, public voice demo, outreach with unapproved samples, or charged customer deliverable. All work remains in draft PR #1465 and retains original controls.
