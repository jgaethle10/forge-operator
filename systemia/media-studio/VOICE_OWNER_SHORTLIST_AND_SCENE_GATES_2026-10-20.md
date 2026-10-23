# Voice Foundry | Owner neural audition verdict and next casting gate
Date: 2026-10-20. Source: founder's first-hand listening feedback, not a synthetic quality score.

## Six-voice blinded architecture shootout
Real source: GitHub Actions https://github.com/jgaethle10/forge-operator/actions/runs/39464600851
Model trial: Piper LibriTTS-high A/C vs Kokoro (four voices). Actual generated WAV/MP3 audio was reviewed by the founder. Candidate identities, after unblinding:

| Blind ID | Engine | Actual voice | Founder verdict |
|---|---|---|---|
| V02 | Kokoro | `af_heart` | “amazing”; current standout |
| V05 | Kokoro | `af_bella` | “dope”; another strong candidate |
| V06 | Kokoro | `am_michael` | best masculine-presenting choice, qualified by “I think” |
| V01 | Piper | speaker 14 | not marked bad |
| V03 | Kokoro | `am_adam` | not marked bad |
| V04 | Piper | speaker 217 | not marked bad |

The founder reported that none of the six were bad. This differs meaningfully from the older owner feedback: Piper-only A/C scene-end and word cadence versions still needed substantial work. **This does NOT mean a commercial voice has been legally licensed, independently quality certified, chosen for all roles, or released.**

## Engineering direction
Do NOT use older A>C>D>B ranking as an absolute ranking over these new voices. Freeze current candidate identifiers and original audio digests. Treat V02, V05, V06 as the **voice-casting shortlist**, with intended voice presentation and character context still to be verified by human listening.

Next code experiment: `systemia/media-studio/voice-top3-scene-auditions.py` plus the existing private GitHub Actions `voice-model-shootout.yml`. Render three distinct scripts, each spoken by all three shortlisted models, for nine neural samples. Tasks:
1. Evaluate longer-form documentary narration for sentence-final resolve and rising/falling emphasis.
2. Evaluate close conversational reassurance for pace and unnatural word connections.
3. Evaluate restrained commercial persuasion for stable identity and clarity.

The director's notes in the output manifest are human **listening guidance** only, NOT controls actually transmitted to Kokoro. Preserve the dry WAV, level-match MP3 comparison outputs, and record which checkpoint/voice were used while explicitly noting that Kokoro model weights remain unpinned in this workflow. No human quality proof or model/voice dataset rights verification is implied.

## Pass/hold gate
Owner listens across all three contexts. Distinguish sample appreciation from a proven reusable voice. If one voice sounds unnatural in a specific context, keep it as a role-specific candidate rather than forcing it into every Evercraft documentary, educational visualization and commercial. Ask the voice-directing experts to compare phrase-final pitch, vowel duration, weak-function-word reductions, and thought-to-thought rhythm to good human actor references. Systemia founder remains publication and spend gate. Boardroom Ask All is queued, not real independent adviser replies.
