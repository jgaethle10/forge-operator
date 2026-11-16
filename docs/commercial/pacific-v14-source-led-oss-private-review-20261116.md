# Pacific V14 | Source-Led Story Revision & Open-Source QA (private review)
**Date:** 2026-11-16
**Owner decision:** Founder rejected V13's "The right tools, the right experience..." copy and several rough/repetitious shots.
**Status:** PRIVATE OWNER REVIEW ONLY. No client acceptance, media rights, broadcast readiness or public delivery.

## Creative execution
- New 6-part Bella narration, synthesized natively as Kokoro v0.9.4 `af_bella` in GitHub Actions run 43909187406; audio files and SHA-256 evidence packaged privately.
- Opening: "Car trouble never asks if you've got time."
- Then: "A strange noise. A warning light. A day that suddenly goes sideways."
- "So we get in there. Find out what's happening. And get to work."
- "Brakes. Engines. Bodywork. The details you see, and the ones you don't."
- "At our Yakima shop, or right where you are."
- "Pacific. Let's get you moving."
- Footage chosen from **three distinct original owner-provided screen recordings** plus three photographic cutaways. 11 total visual segments including the closing contact card.
- 900 frames @ 30fps, 720×1280 H.264/AAC vertical review.
- Original Facebook audio completely muted; no new captions/titles on technician shots; fixed crop around selected content, no automatic photo zooms or ghosted dissolves.
- 579 / 900 frames (64.3%) moving source video, 165 frames (18.3%) stills, 156 frames (17.3%) client contact end card.
- Music remains HoliznaCC0 "Classic" CC0 for comparison, mixed under Bella with audible ducking. This is NOT a final creative music approval.
- Final decoded completely, ~−16.4 LUFS, −1.5 dBTP.
- HD SHA256 faf08b2f4571828d42e433ef1792c2eee62e04d800f7cb71d18792714c7298dc.
- iPhone H.264 Baseline 540×960 MP4, 900 frames, exactly 30 seconds, fully decoded. SHA256 16fa8cf1235f5f054f040b6accdea6827dac2534a839b237c976f8f8025be275.

## What genuinely ran
- PySceneDetect v0.7.3 (Breakthrough/PySceneDetect, BSD-3-Clause) installed from pinned GitHub Actions verified wheel artifact #14245949782, used locally on four 4fps low-resolution proxies for public social UI/reel scene boundaries.
- OpenCV used for source motion and image sharpness inspection and frame-level review montage.
- FFmpeg local offline execution for actual cropping, color-matched individual shot conformance, H.264 assembly, native voice + independent CC0 music mix, encoding and full media decoding.
- AcademySoftwareFoundation/OpenTimelineIO Python v0.18.1 installed from previously verified GitHub action wheel. Native editable 2-track / 11-visual-clip OTIO written, read back and verified to 900 frames. Separate reference mix track plus six audio stems in portable kit.
- Project kit includes original source-provenance SHA-256, raw reel in-points, conformed media, Bella WAVs, music source/licensing receipts, original shot selection/ffmpeg script and scene-detection receipt. OTIO does NOT encode the final ducking/color/crop edits; these are baked into conformed media with source metadata preserved.
- No ComfyUI / ACE-Step / Blender / GPU generation executed; their GitHub repo integrations alone do not establish active commercial capability.

## Owner-private delivery
- Full vertical: https://drive.google.com/file/d/1I4wtH3gXxADr69m2nEQXUdWbYQFgRkah/view
- iPhone: https://drive.google.com/file/d/1LfgfLexTu5Rl98zaOg5ngsXC6QMATgx2/view
- Editorial kit: https://drive.google.com/file/d/1faELoJKCfPdJEoCXGet73EKd84x4ggD4/view
- Standalone native OTIO: https://drive.google.com/file/d/1aHYleG9aZ_brjXDEYB4zWAfKo1QwsvLf/view
- Contact sheet: https://drive.google.com/file/d/1O9Q2a5KEoyqRf4iFXIxF_yX0fQ2G50KZ/view

## Unresolved gates
- Original footage is 512×1108 mobile screen recording with source quality limitations, NOT original camera files.
- The end card still requires client validation for phone numbers, social handles, address and email.
- Customer and identifiable-participant commercial footage authorization; music and Bella broadcast-use legal compliance; station's actual technical/format instructions all pending.
- Owner has not listened/watched/approved V14, and no claim of broadcast-ready quality is made. No client delivery, publication or spending.
