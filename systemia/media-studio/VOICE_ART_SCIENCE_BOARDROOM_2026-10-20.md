# Voice Engineering as Art & Science | Evercraft AI Boardroom Research Packet
**Date:** 2026-10-20  
**Review status:** Evidence-backed technical research prepared by ChatGPT. Submitted to the **real Evercraft AI Boardroom** as `BoardSession 6ad79ff4c64a66cb131d55de`, `BoardRunRequest 6ad7a031022b9f768acf2ce2`. Request initially **queued** with **zero verified independent adviser responses**. No adviser votes, critiques, committee consensus, production deployment or model approvals claimed.  
**Implementation:** Voice Foundry draft PR #1465 in `jgaethle10/forge-operator`, not merged. Systemia is canonical for mission authority.

## The user’s sound verdict is the highest-priority input
The first legitimate LibriTTS Piper auditions ranked A (speaker 14) > C (217) > D (531) > B (91), but none achieved the user's desired naturalness. The later A-joined and A-flow takes *both* require extensive work. Defects: **robotic sentence-final resolution** and **unconvincing word-to-word cadence**. Do not equate FFmpeg objective audio checks with performing arts. Preserve A/C originals as baselines, not selected actor assets.

## Root cause map: what is actually missing?

1. **Intention, subtext and phrase structure.** An actor delivers a thought to a listener, chooses a focus word, may redirect intention and ends with a purposeful resolve. A plain text TTS model infers much of this from punctuation, which is ambiguous. Narrative direction therefore needs a *performance score* before synthesis: subtext, intended listener, pragmatic function (announcement/question/discovery), contrastive stress, intended phrase boundaries and concluding tone. **Never substitute arbitrary bracket tags or literal direction words into spoken script.**
2. **Phonology, coarticulation, prosody and phrase-final contour.** Prosody is not merely speed. Pitch/F0 and energy move with discourse focus, phrase accents/boundary tones, reductions, lexical stress and final syllable lengthening. ToBI phonology explains why a final pitch movement and lengthened stressed syllable can signal completion or expectation. The end of a line can be technically unclipped yet sound robotic due to intonational planning.
3. **Model architecture ceiling.** Repeatable timing and punctuation experiments with Piper are useful causal tests, but cannot add expressive latent controls that the model does not expose. Evaluate another architecture, not endless mastering. StyleTTS2 investigates learned style diffusion and duration modeling. ProsodyFM targets explicit phrasing and intonation control. These are research inspirations, not a promise every checkpoint is legal or works on our hardware.
4. **Performance continuity.** Different recorded lines must preserve actor identity while allowing varied emotions and intonation. Keep voice identity (speaker/style seed/config), emotional intensity and intended discourse moves separate; run multi-line consistency tests and blind voice identification. No covert voice cloning or unauthorized speaker samples.
5. **Comparative listening evidence.** Audio loudness, peak and silence are objective engineering measures; naturalness, sentence ending and drama are subjective. ITU-T P.800 family distinguishes and reports subjective MOS carefully. Do not label a small home audition as an official MOS study.

## Source backbone (primary, verifiable)

- Prosodic phrase and final lengthening, accent and intonation: Macquarie University, [Introduction to ToBI](https://www.mq.edu.au/faculty-of-medicine-health-and-human-sciences/departments-and-schools/department-of-linguistics/our-research/phonetics-and-phonology/speech/phonetics-and-phonology/Intonation-tobi-introduction).
- Speech synthesis markup formal controls and engine-dependent behavior: W3C [SSML 1.1](https://www.w3.org/TR/speech-synthesis11/).
- Specific word-level stress control: [Interspeech 2024 paper](https://www.isca-archive.org/interspeech_2024/korotkova24_interspeech.pdf).
- Phrasing + intonation controllability: [ProsodyFM](https://arxiv.org/html/2412.11795v1).
- Learned expressive style diffusion: [StyleTTS2 primary paper](https://arxiv.org/abs/2306.07691).
- Objective versus subjective labels and MOS report requirements: [ITU-T P.800.1](https://www.itu.int/ITU-T/recommendations/rec.aspx?lang=en&rec=12972), [P.800.2](https://www.itu.int/itu-t/recommendations/rec.aspx?id=12973).
- Commercially relevant second architecture: [Kokoro-82M model card](https://huggingface.co/hexgrad/Kokoro-82M) describes 82M parameters and Apache-2.0 weights. Audit voice/dataset/dependencies/attribution and current model revision before any release.
- Noncommercial pretrained checkpoints risk: [official F5-TTS code](https://github.com/swivid/f5-tts) MIT, **published pretrained checkpoints CC-BY-NC**. Not a default commercial production candidate. A demo or experiment is not permission to sell derived speech.

## Boardroom roles and questions (requests, NOT actual seat replies)

**Voice acting director:** Where is the beat change? Which word communicates the promise? Does the last word indicate completion, wonder or apprehension? Ask for a performance annotation and human actor comparator.  
**Phonetics/linguistics:** What is the intended intonational phrase boundary, tonic stressed syllable, final pitch contour, reduction and phrase-final duration? Which phenomena are accent-dependent rather than universally human?  
**Audio/psychoacoustics:** Was the original dry recording clean? Were the candidate levels matched for audition? Does any added fade/room sound mask the defect? Report only objectively measurable features; do not build an automatic acting grade from pitch or quiet thresholds.  
**Model engineer:** What expressive controls are *actually supported* by Piper, Kokoro and alternative architectures? CPU/memory/latency, model-license chain, inference reproducibility, exact hashes and model voice provenance?  
**Contrarian/commercial:** Are we perfecting the wrong model? Should the next dollar go to a qualified performer/reference audition or a better model? What is the smallest blind listening proof that justifies further engineering?  
**Rights/security:** Distinguish code license, model weights, voice data and speaker consent. No unapproved identity imitation, paid calls or voice deployment.  
**Systemia/operations:** Preserve failures, provenance, tests, model/source IDs, real GitHub actions, review decisions, work owners and founder gates; no fabricated agent execution.

## Directly applied source changes in this push

**`voice-model-shootout-ci.py` + `.github/workflows/voice-model-shootout.yml`**: private, isolated **cross-architecture audition** against the actual problematic final line `This is Evercraft, and this is only the beginning.`. Piper speaker 14 and 217 retain the user's A/C baseline identities; Kokoro introduces four different pretrained voices as distinct candidates, not clones of A/C. Six total candidates get unmodified WAVs, standardized MP3 listening volume, blind ID names, audio hashes, model/voice provenance flags, a scorecard on four separate perceptual axes and local listening JSON export. Human review and rights remain unverified. If CI fails, no positive model-quality claim may be made.

**Mandatory regression `tests/media-voice-model-shootout.test.mjs`** confirms exact source text and A/C speaker IDs, no silent promotion, expected audio receipts and locally runnable preflight.

## Prosody + model learning roadmap

**Experiment A: whole-line phrase endings.** Listen to original A/C against Kokoro voices on *the same final sentence*, with loudness controlled. Forced-choice winner and separate 1–5 ratings for (a) final-word landing (b) natural rhythm (c) semantic stress (d) overall likeness. Do not unblind before scoring. If none meaningfully improves, investigate licensed architectures beyond Kokoro rather than smoothing Piper waveforms forever.

**Experiment B: beat-direction score.** For each short line encode listener, intention, subtext, phrase groups, focus, closing attitude and approved pronunciation. Render neutral vs directed variants only on models *known* to accept that control; unsupported directions remain text for a human director and must not be faked as synthesis features.

**Experiment C: sentence-final acoustic inspection.** For objectively voiced samples derive time-normalized F0 contour, energy trajectory, word/phoneme durations from a *real* ASR/forced alignment source; report measurements with uncertainty, *not* binary classifications of naturalness or accent. Detect audio truncation separately from intonation.
  
**Experiment D: actor-like multi-line performance.** Narration, reassurance and discovery scene should preserve a character voice while varying thought, focal stress, breath placement and emotional energy. Build verified human/consented reference comparisons if available. Qualified listeners and a dialect reviewer make the final calls.

## Required quality release gates

1. Model and voice rights + attribution independently checked, version pinned, provider and recorded performer identity not misrepresented.
2. Audio synthesized from the exact approved script, actual ASR, pronunciation and timing verified against exact bytes; no fictional transcript.
3. Blind human listening across realistic lines and the problem sentence. At least two reviewers where feasible; any dissent recorded and surfaced rather than averaged away.
4. Demonstrable advantage over the owner's A/C baselines, both in final-word resolution and word cadence; objective loudness improvements alone insufficient.
5. Founder-approved Systemia release; until then all WAVs, reports, votes and tasks remain research/draft, not production or customer assets.

## Status and provenance

This research packet is **not a simulated multi-agent consensus**. Independent Boardroom `ask_all` has been submitted but provider-backed seat results and synthesis must be verified from actual `BoardMessage` and `BoardRunRequest` receipts before anyone labels a conclusion as the council's finding. Draft GitHub source is a delivery of engineering exploration, not an authorization to spend or launch.
