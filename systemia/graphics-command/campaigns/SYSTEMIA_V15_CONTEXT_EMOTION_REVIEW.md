# V15 | Evercraft Voice Foundry context and emotion engineering

**Status:** Actual neural audition and local audio/movie A/B completed. Draft code review only. No commercial/public voice clearance or publication.

## Why V14 still sounded disconnected
A text-to-speech call given only "Wait, you sent it?" cannot infer from preceding audio that the speaker expected a draft, trusted the agent, and is now discovering a permission error. Likewise, a generic "emotion: surprise" marker does not convey who was surprised, why, and what they intend to do. Previous versions improved gap timing, spatial EQ and mix but did not supply context to the voice-generation model.

## Interdisciplinary research review (not a live Fabric/Boardroom meeting)
- Writer: every turn must change a belief or answer the preceding speaker.
- Acting director: actor motivation before the line matters as much as the line.
- Conversation analyst: hesitation before repair can be meaningful, not a fixed 200 ms rule.
- Speech scientist: a model must condition on previous dialogue/speaker and acoustic local cues to render truly context-dependent emotion.
- Music director: music should support the action, not replace the vocal performance.
- Editor: spoken reactions follow visible events and approved setting changes.
- QA: verify source identity, measured contours and blind listening before subjective claims.
- Legal/truth: pretrained Kokoro is not independently Evercraft-trained or currently independently rights cleared.

Research:
- https://doi.org/10.1016/S0167-6393(02)00084-5
- https://pmc.ncbi.nlm.nih.gov/articles/PMC4357221/
- https://ojs.aaai.org/index.php/AAAI/article/view/29833
- https://aclanthology.org/2025.findings-naacl.38/
- https://aclanthology.org/2025.findings-acl.101/
- https://doi.org/10.1007/s42761-025-00317-w

## Actual code in this draft PR
- `systemia-v15-emotion-context-plan.json`: seven scene facts, speaker beliefs, cause-event, appraisal, actor goal, intensity, exact text & timing.
- `systemia-v15-context-performance.py`: deterministic context-to-directed script audition. Existing Voice Foundry/Kokoro 82M synthesizes new WAVs; **does not receive previous dialogue audio or actual emotion conditioning**.
- `systemia-v15-context-performance.test.py`: negative gates against flat emotional states, broken cause chain, role swapping, word-surgery, excessive speed, pre-permission acknowledgment, fabricated publication rights.
- `.github/workflows/systemia-v15-emotion-context.yml`: real local/offline-capable neural synth evaluation workflow, no paid service calls.

## Verified execution and qualitative limits
GitHub Actions proof: https://github.com/jgaethle10/forge-operator/actions/runs/39540886780 **SUCCESS**.
Fourteen newly synthesized full WAV takes (seven baseline, seven context-directed); SHA256 bound, 24 kHz/mono input. No acted performance, rights or listener acceptance certified.

A/B film masters created in conversation working container:
- `Systemia_V15_baseline_Emotional_Context_Review.mp4`
- `Systemia_V15_context_directed_Emotional_Context_Review.mp4`

Actual film QA: both 1600 × 900, 24 fps, 564 frames, 23.5 sec, stereo AAC 48 kHz, -16.7 LUFS integrated, -1.5 dBTP peak. The entire video stream SHA256 is identical: `3ffc94e3236b0b16128da2131d20b95620a684c82b820f600dbeaba63eafd264`; all take windows fit without pitch/time surgery.

Objective differences: directed performances are between 0.2% and 4.9% longer. Pitch/energy contours differ slightly and inconsistently. The correction/reaction ("Wait, you sent it?") is about 3.3% longer, with about +0.63 semitone change in *estimated* pitch range; the explanation line changed by less than 1% duration. These are measured acoustic differences, NOT validated emotional acting. No human blind listening scores have been collected. Therefore **we cannot claim to have solved contextual emotional speech**.

The A/B editing source, actual dry takes and media, objective profiles, score and effects stems, and a truthful release-hold receipt are in the conversation production kit, not yet committed or admitted through Fallen. Neither film is public.

## V16 research gate
A context-aware expressive model needs (a) prior turn audio/text and speaker identity, (b) explicit actor goals and appraisal with local emphasis control, (c) voice identity continuity, (d) rights-cleared weights/data and audio sources, (e) genuine human listening A/B tests and (f) post-generation timing/release gates. A model that exposes expressive controls but not prior utterance context still does not satisfy the full goal. Any upstream open source model must be reviewed before use; do not call it a proprietary Evercraft-trained model. No new model or third-party provider has been installed through this V15 evaluation.
