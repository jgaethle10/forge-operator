# Evercraft Visual Floor v2 | Shot Dailies

**Goal:** replace "the video encoded, so it must be good" with a real review of each authored shot. This integrates with the **existing** Graphics Command / Visual Floor v1 work order. It does not introduce a new authoring/render engine.

## Input contract

`shot-dailies.py --video <path.mp4> --jobpack <production-jobpack.json> --out <directory>`

Requires `evercraft.graphics-command.production-jobpack.v1`, its embedded `visualFloor.workOrder` from `planFloor`, the canonical `visualFloor.workOrder.digest`, ordered `shots[]` IDs matching the work order, exact `startFrame`/`frameCount` coverage, FPS, size, and total frame count matching the **fully decoded media**. The SHA-256 of the encoded file and exact jobpack bytes bind the dailies.

No missing ranges, duplicate shot names, altered work orders, unauthorized publication flags or mismatched media can be silently accepted. Frames at 15%, 50%, and 85% of **each authored shot** are decoded from the actual MP4. A review board and hashed JSON receipt include each sampled frame's original decoded pixel hash and video timecode. A title/intent accompanies every beat. Brightness/clipping/stillness statistics are heuristics, not artistic quality scores.

## Run locally

```bash
python -m pip install -r scripts/visual-floor/requirements.txt
python scripts/visual-floor/shot-dailies.py \
  --video /path/to/actual-master.mp4 \
  --jobpack /path/to/production-jobpack.json \
  --out /tmp/evercraft-dailies
python -m unittest discover -v -s scripts/visual-floor -p 'test_shot_dailies.py'
```

Requirements include Python 3, numpy, OpenCV, Pillow and FFprobe. This reads local media and does not send data to any provider. Run on material owned/licensed by the relevant production; never upload private third-party benchmark clips to GitHub.

## V4 proof, and why this matters

For a private audition we made a **clearly labeled illustrative four-phase allocation**, `ignite / build / event / resolve`, over the previously rendered 300-frame Photon Forge V4 clip. This demo allocation is **not** the authoritative Graphics Command production timeline. The resulting board made the problems visible at a glance:

- **Ignite:** far too dark/empty, small machinery occupying the center;
- **Build:** repetitive cyan/violet rings, shallow physical detail even when motion works;
- **Event:** the 7.70s shock goes pale/overexposed and hides mechanical form;
- **Resolve:** clean central wordmark but insufficient typographic sophistication, a tiny secondary line, and a generic background.

It is a technical **preview** and has not reached the user's reference visual floor. We deliberately do not claim a perceptual score or automatic artistic approval.

## Production boundary

- This module creates *review dailies*, not final approval. Reviewers inspect the **full-resolution video and actual movement**, not the JPEG alone.
- Run source rights and visual truth checks independently. No reviewer identity is authenticated simply because JSON says it is.
- `customerReady:false` and `publicationAuthority:false` are immutable. Only the established commercial release authority can clear final publication.
- The original WebGPU Pixel-to-MP4 pipeline exists on World Engine PR #1459; shadows and GGX are in other review branches. Connect their **actual final video + real jobpack** as input here, rather than wasting time on isolated CPU demos. Hardware GPU claims still require device receipts (browser software fallback does not count).
- The V4 jobpack and user-provided reference videos are **not committed** to the repository. The board is a user-visible local artifact for internal review only.

## Next creative engineering work

Consolidate the existing native World Engine geometry, material, sky, camera, water, shadow, actor and post pipelines into a verifiable single rendering lane. Then create domain-specific design systems: expressive product UI/typography, cinematic abstract agents, navigable data constellations and physically convincing 3D. Run actual MP4 dailies against *each style* and require founder visual sign-off on actual pixels before any customer claims.
