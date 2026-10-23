# V05 First | Evercraft /craft/ Vowel Laboratory

Owner hearing feedback, 2026-10-20: **V05 / Kokoro af_bella is now preferred over V02**. V05 overall very good but the **'a' vowel in the 'craft' of Evercraft** has a detectable slightly robotic or unnatural quality. This overrides earlier hierarchy V02 > V05. V06 am_michael remains preferred masculine-presenting voice. Nikki also independently noticed subtle synthetic individual-word delivery on shortlisted Kokoro voices.

## Exact experiment

`voice-v05-craft-vowel-lab.py` / `.github/workflows/voice-v05-vowel.yml` creates 9 private, genuinely synthesized Kokoro af_bella takes. Three different scripts each have one Evercraft token; three pronunciation conditions are generated via `KPipeline.generate_from_tokens` using the **same token API** to eliminate default-versus-custom API confounding:

- `original`: Kokoro's unmodified G2P. Keep it as control.
- `short_a`: /æ/ vowel, often the vowel in American English 'craft'. Experimental, not universally correct.
- `open_ah`: /ɑ/ alternative, more like a broad/open 'ah'. Could be distinctly wrong for some American accents.

Only the vowel immediately before `ft` inside the precisely identified Evercraft token is allowed to change. Consonants, token text, word order, and lexical stress markers must remain unchanged. If actual Kokoro phonemes do not have a uniquely isolated suitable vowel, the job FAILS CLOSED and engineers must inspect the raw G2P output, not guess. Every candidate logs `original`, `candidate`, vowel and source WAV+MP3 digests. Model checkpoint itself still needs independent pinning.

## Why this is not a pronunciation fix yet

The difference between English /æ/ and /ɑ/ is **phonetic as well as regional**. The user identified a synthetic quality in a particular vowel, not necessarily a wrong dictionary spelling. One or both alternatives can sound objectively less correct. Human judgement of the full word, transitions into /f,t/ and coherence of af_bella's surrounding vowels will decide. Do not automatically deploy the alternative based on its symbol or a single acoustic metric.

## Listening acceptance

Have the founder and Nikki listen to all nine takes with model/variant names initially concealed where practical. Ask (a) does Evercraft sound more human? (b) does the changed vowel sound like the same speaker/accent? (c) does the sentence flow better? (d) do other surrounding words degrade? Keep the best audition **per context**, don't globally replace vowel until a trained accent reviewer approves the intended pronunciation. Human acceptance/rights/publishing remain held.

Source: upstream Kokoro `KPipeline.generate_from_tokens` supports preprocessed MToken phoneme sequences: https://github.com/hexgrad/kokoro/blob/main/kokoro/pipeline.py . Original Kokoro model card: https://huggingface.co/hexgrad/Kokoro-82M .

Status: code and private CI audition only. No real candidate improvement, voice-cloning consent, legal commercial rights or deployment may be claimed from test existence.

## Owner rejected V05 vowel/stress test, 2026-10-20

Owner report: 'That didn’t work at all lol the idk what’s going on'. This is unambiguous negative feedback about the attempted result **unless the owner clarifies a player-loading failure**. No take from the experimental pronunciation or stress trials has been approved.

**Disposition:** Reject all `ever_primary`, `ever_relaxed`, and `open_a_only` experimental variants for casting or production. Freeze these generated files as negative-control research evidence. Do **not** apply raw IPA stress movement or broad /æ/→/ɑ/ substitution globally to V05. Keep Kokoro af_bella and its original input/output as the working voice reference.

**Observed evidence**: baseline `V05.mp3` from the first Kokoro-versus-Piper shootout and later `tagline-model_original.mp3` decode to exactly 89,400 samples at 24 kHz and have cross-sample Pearson correlation approximately 0.99690 (one-pass MP3 decoder outputs). The changed stress WAVs showed near-zero direct raw-sample correlation with their corresponding unmodified WAVs over full take, but raw-sample correlation alone cannot diagnose perceived naturalness or isolate the word. Therefore these are not proven localized repairs.

**Root-cause insight**: manually modifying phoneme stress within a whole utterance changes synthesis behavior and can alter duration and contextual prosody outside the targeted vowel. Good orthographic/IPA intentions do not establish better articulation. A token-path 'original' audit must always be referenced to a real `KPipeline(text, voice='af_bella')` control and not labeled an identical waveform without verification.

**Better next gate**: (1) restore the founder-liked V05 full script as the reference; (2) capture a phonetic/accent director's precise target vowel and intended brand stress, including country/dialect; (3) only then test provider-supported lexicon/markup pronunciation on the same sentence, matched loudness, with blinded A/B listening. Prefer more expressive architectures or trained human actor reference if pronunciation still sounds unnatural. Nothing automatically selected, published or approved. If user reports audio player itself did not work, investigate HTML/relative-file playback before further modeling.
