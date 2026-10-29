# Evercraft Voice Foundry | Magnetic Male Counterpart to Bella

**Status:** Audition-engineering contract. No candidate voice has been rendered, selected, or approved.
**Profile:** evercraft-male-magnetic-audition-v1 (temporary audition identity, not a provider voice ID).
**Owner:** Fallen / Voice Foundry, with human casting and creative approval.

## Artistic target

Bella's equal, not a lower-pitched copy. Natural chest resonance, thoughtful timing, warm confidence, subtle amusement, beautiful diction and emotional intelligence. He sounds interested in the story, not sexually interested in the listener. No forced bass, conspicuous inhalations, whisper-rasp, trailer-announcer voice, or generic TTS cadence. Attraction is an audience response, never a pitch-shifting preset.

The same male voice should sound credible in three different original readings: **curiosity**, **trust**, and **wonder**. Don't lock the identity from one captivating opening line.

## Audition workflow

1. Generate a deterministic casting brief:
   node systemia/media-studio/voice-foundry-audition.mjs plan /absolute/path/audition-plan.json

2. Have an authorized, verified provider or private/local TTS engine make at least two *distinct* male voice candidates performing all three exact test scripts. Keep dry source recordings. Carry source-rights evidence, consent, provider/model ID, and an actual SHA-256 of each audio file. No vendor/model or commercially usable voice is presumed from a text description. Don't commit sensitive voice assets or secrets to the public repository.

3. Recruit at least six blind listeners per candidate, with anonymized IDs. Request at least two self-identified women and two self-identified men; other/undisclosed reports remain welcome. Do not infer participants' gender. Score keep-listening, naturalness, intelligibility and discomfort on integer 1–5 scales, where 1 is *no discomfort*.

4. Assemble private-review.json using schema evercraft.fallen.voice-audition-review.v1, the exact planDigest, and each candidate's file paths, SHA-256s, matching script texts, rights source, and listener ratings. See the tests for a synthetic schema fixture. Never reuse synthetic test ratings as real listening results.

5. Run:
   node systemia/media-studio/voice-foundry-audition.mjs review /absolute/path/private-review.json /absolute/path/review-result.json

A candidate can advance to *human director review* only with a source file for every read, correct audio-byte hashes, truthful voice provenance attestations, a minimum two-candidate field, adequate listener coverage, and enough positive listener reaction. Minimum provisional mean scores: keep-listening 4/5 overall and individually in both requested audience groups, naturalness 4/5, intelligibility 4/5, discomfort at most 1.5/5 overall and individually in both groups.

## Listening direction

- **Curiosity:** The first sentence should feel discovered mid-conversation, with a restrained smile. Let the thought breathe but never manufacture a sensual breath.
- **Trust:** Quiet authority and genuine reassurance. No bravado or artificial urgency.
- **Wonder:** Warm invitation to notice more. Not whispered, creepy, or romance-coded.

Listen first without music, then on headphones, mono phone speaker and with a restrained score. Re-render a poor performance instead of overprocessing it. Once a real audition passes creative approval, preserve the chosen voice identity through Fallen's existing voiceProfileId and production receipts. Final mixing and commercial-audio QC must still occur for each delivered master.

## Boundaries and confidence

The audition engine verifies local audio file presence, SHA-256 and FFprobe metadata, planned script identity, profile identity, panel coverage, numerical score thresholds, and declared rights evidence. It cannot independently tell if the clip sounds human or contains speech, verify a real license, authenticate individual raters, or establish attractiveness from acoustic metrics. These are design guardrails, not a scientifically validated predictive model. Human listening and proof of rights remain essential.

No paid TTS generation, provider registration, automatic voice locking, credential use, public release or publication is performed by this change. Neither Bella nor existing voice routing is modified.

## Proof

node --test systemia/media-studio/voice-foundry-audition.test.mjs

Tests use deliberate **non-speech sine-wave fixtures** to prove gate operation, including tampered audio rejection, missing rights, identity mismatch and underperforming listener cohorts. Passing these tests never means an actual voice was synthesized or artistically approved.


## Local Kokoro render bridge (V2)

The first owned/local rendering adapter is `voice-foundry-kokoro-render.py`. It requests candidate voices directly from an **existing locally installed** Kokoro engine and writes independent dry WAV stems plus SHA-256 evidence and `REVIEW-INCOMPLETE.json` into a private output directory. It makes no paid-provider requests, forces Hugging Face/Transformers offline flags, and does not fetch missing model weights.

On an authorized machine with the Kokoro package and weights already installed/cached, create the audition plan with:

```bash
node systemia/media-studio/voice-foundry-audition.mjs plan /tmp/evercraft-male-audition-plan.json
python3 systemia/media-studio/voice-foundry-kokoro-render.py \
  --plan /tmp/evercraft-male-audition-plan.json \
  --out "$HOME/evercraft-private/voice-male-audition-01" \
  --voices am_michael am_fenrir bm_fable
```

The adapter intentionally defaults to `commercialUseVerified:false`, `consentedToVoiceUse:false` and an empty ratings panel even after successful audio rendering. It does not establish legal or model rights for a recording. An authorized operator must inspect rights evidence and verify voice-use authorization; listeners must independently score actual clips before the separate voice-admission review can advance.

Use `python3 systemia/media-studio/voice-foundry-kokoro-render.test.py` to check the adapter's **mock wave** receipts without a model or external API. CI runs these contract tests but **cannot prove the quality of a real voice**.

This first casting panel deliberately spans American conversational and grounded voices and British storytelling delivery. All identities remain provisional. Do not create a production lock or present any voice as Evercraft's male narrator until real listening and founder creative approval are recorded.
