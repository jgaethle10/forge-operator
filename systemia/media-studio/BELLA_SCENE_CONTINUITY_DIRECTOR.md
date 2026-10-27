# Bella V05: Magnetic Scene Continuity | October 27, 2026

## Founder intent

Bella should be borderline sexy in the sense of **magnetic**, with an intimate, conversational pull that deepens interest as the narration unfolds. She must remain commercially credible and emotionally natural. Avoid breathy caricature, exaggerated flirting, forced register shift, hiss, synthetic sighs, random pitch lowering and overcompression.

## Experimental question

Previous actor and magnetic-presence experiments varied sentence punctuation, native speed and two post-processing chains. That work demonstrated genuine source synthesis and technical QA, **not subjective improvement**. The next unanswered question is **prosodic continuity across multiple thoughts**: does giving Kokoro the entire story produce better emotional flow than deliberate scene segmentation?

Compare **exactly identical spoken words** in these treatments:

| Treatment | Native speech rendering | Added pauses | Identity |
| --- | --- | --- | --- |
| Continuous control | one complete Kokoro KPipeline take | none | af_bella |
| Three beats, tighter | same three individual Kokoro takes | two 140 ms inter-beat silences | af_bella |
| Three beats, spacious | reuse exact same three individual Kokoro takes | two 260 ms inter-beat silences | af_bella |

8 ms fade edges on separated beats prevent discontinuities from splicing. This is a **signal edit**, not a generated natural breath. All dry source files are preserved separately. The two segmented candidates differ **only in gap length**, enabling a useful relative pause comparison. The full continuous candidate differs also in generation context and seed sequencing, so comparison against it **cannot isolate pauses alone**. The MP3 previews apply the same nominal listening loudness filter and retain source hashes; human listening remains necessary.

The locked dialogue is split into three authored thoughts; no script wording changes are allowed. Three audio audition candidates and four dry source renders are published only as **private GitHub CI review artifacts**. No marketing, model identity, licensing, acting or customer-release claims are automatically granted.

## Listening criteria

Use headphones, avoid jumping directly between only first seconds of clips. Evaluate:
1. Does the voice make you want to hear the *next* sentence?
2. Is the warmth credible through the middle of the script rather than limited to the first line?
3. Do scene transitions sound natural rather than like a reset between separately synthesized files?
4. Does the ending feel intentional, never falsely enthusiastic or robotic?
5. Are all words intelligible, especially Evercraft, without altered G2P?
6. Does it unmistakably sound like the same original Bella V05?

Choose a winner only after a human listening review, with timecoded issues and independent reviewer perspective where possible. Any candidate with spurious word errors, clipped phonemes, strong identity drift, hard boundary click, artificially sexualized performance or pronunciation defects remains held. A production promotion requires owner sign-off and independently resolved model/voice commercial rights.

## If no candidate wins

**Stop adding random punctuation variants.** The current model's controls are limited. Pursue a separately rights-reviewed comparison of an actual expressive-control architecture and a consented human acting reference, while using original Bella as the sonic regression anchor. An architecture with an emotional-style input is not proof of a better commercial voice, and changing base voice identity requires an explicit new creative decision. Do not claim that the existing Kokoro speed parameter implements emotion.

## CI and human-review boundary

Workflow: .github/workflows/voice-bella-scene-continuity.yml
Source: systemia/media-studio/voice-bella-scene-continuity.py
Tests: systemia/media-studio/test_voice_bella_scene_continuity.py

GitHub Actions status must be read for the **exact commit**. A queued job is not a passed synthesis run. Digital signal checks, hashes and test green status are **not human listening judgments**.

**Release state: REVIEW_ONLY**.
