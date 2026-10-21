# Evercraft Relay RC18 | private launch-candidate seam repair

**Date:** 2026-10-21  
**Status:** Rendered and frame-checked. Founder creative review / publication held.  
**Input:** `Relay_RC17_Product_Clarity_Private_Pilot_1080p_REVIEW.mp4` (31.033 s, 931 frames).

## Actual production correction

The RC17 cut inherited a split-screen optical experiment immediately before the genuine light Relay UI. At output frame 491 (16.367 s), the edit abruptly switched from a dark construction/paper split to a near-white product screenshot. The discontinuity looked like a glitch even when the H.264 file decoded correctly.

RC18 is a **picture-only** repair, not a redesign:

- Frames 0–374: approved live-action footage unchanged.
- Frames 375–485: real document scene rebuilt from source frames 375–444 at a slower editorial rate; old split-screen frames 445–490 discarded.
- Frames 486–496: 11 frame-blended images join the physical white document to the actual light UI.
- Frames 497–930: original Relay pilot story, human confirmation, and closing sequence unchanged.
- Original Voice 5 Kokoro `af_bella` and the complete RC17 mix are copied as AAC packets, without recomposition or regeneration.

## Measured output

- RC18 1080p master SHA-256: `bbd2fef0365f5029af55663688be985cd26bbeaee4c7e4bec747f5c79cc62af1`.
- RC18 iPhone 720p SHA-256: `0707f611a2c9f72b2c0cea58e484418c1e7bb3888b255ab089fb2fc427403ef3`.
- Both: 931 decodable frames, 30 fps, 31.0333 s, H.264 `yuv420p` + stereo AAC.
- Original/RC18/phone AAC packet SHA-256: `8f3019ab73419b12118fbf177e6fc99a9fd1b6f4cb4b665001faf497c6d1ccbf`.
- Mean absolute grayscale frame change around frame 491, measured at 90×160 on comparable 720p output: **110.51** (RC17) → **17.26** (RC18), an 84.4% reduction. This is a technical discontinuity proxy, **not** creative approval.

## Source and rights boundaries

- Live-action Mixkit stock footage is illustrative, not verified customer footage.
- Underlying soundtrack: **"Driving Ambition" by Ahjay Stelino**, obtained through Mixkit. Evercraft Music edited/mixed it but did not compose or own the source music.
- Kokoro native `af_bella` is the foundational voice model/identity; Evercraft Voice Foundry directed and integrated performances.
- Relay currently shows a fictional structured private-pilot discrepancy requiring **human confirmation**, not independent general semantic understanding of all meetings.

## Publication gates still held

1. Founder watches RC18 and approves **this exact** cut and credits.
2. Verify a working lead destination; launch-page `mailto:` is a draft, not a backend form, and no actual inquiry receipt has been tested.
3. Confirm use of the publicly listed Evercraft contact address for this particular campaign.
4. Review actual footage/music/voice rights and channel terms before publishing.
5. Publish only to authorized company channels; retain verified live URL and provider publication receipt.
6. No publication, public-page deployment, PR merge, or paid campaign authorized by this review.

Local reproducible source, 11 bridge frames, phone/master files and frame QA are in `Relay_RC18_Launch_Day_Private_Review_Package.zip` delivered privately for founder inspection. The repository record is evidence, not a claim that these video bytes were committed or released.
