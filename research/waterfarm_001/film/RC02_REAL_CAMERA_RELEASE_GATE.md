# FILM RC02 | Real-camera-first correction | 2026-10-25

## Owner creative review
Owner rejected V1 procedural water imagery. **Do not market V1 as an acceptable Aqua trailer.** Film lane has been changed to REAL-FOOTAGE-ONLY; no AI stills, AI-generated video, CGI impersonating field footage, simulated equipment shots or animated slideshow in the release candidate. Respect prior iPhone playback failures by requiring a decoded, device-compatible MP4.

## Local work completed this session
- Working **Python + FFmpeg** editorial compiler `film/build_film.py` exists in user-visible local RC02 source package, with source manifest and original instrumental score reference.
- Target is 5 source-camera shots, 27 seconds total, 1280×720 @ 24 fps H.264 constrained Baseline + AAC LC stereo, fast-start metadata.
- Five footage slots: natural water ripples, irrigation, greenhouse, irrigation detail, water end card. Minimal editorial typography: WATER IS ALWAYS MOVING / EVERY DROP HAS A PATH / WHAT IF WE COULD MEASURE IT? / RECOVER WHAT MAKES SENSE / EVERCRAFT AQUA. End card: RESEARCH IN PROGRESS, NOT DEPLOYED.
- Clip intake requires source URL, attribution, documentary real-camera review, individual commercial license approval, downloaded media, and exact SHA256 of each video file. Missing/invalid clips: HOLD. Directory-traversal attempts: HOLD. No library-sourced AI imagery as substitution.
- **QA result**: 12 new local safety/science unit tests passed. The film compiler was additionally exercised end-to-end using a 10-second SYNTHETIC VIDEO TEST FIXTURE inside the private working directory; its output was not released as real footage. Media decode confirmed H.264 constrained Baseline, 1280×720, yuv420p, AAC LC and correct 10.0 s container duration.
- The production package is locally created as `Evercraft_Aqua_RC02_Engineering_and_Film_Production.zip` in this ChatGPT session. Not hosted publicly in this GitHub repository; do not assert a public streaming link.
- Commercially usable clip candidates identified from individual pages at Mixkit and Pexels; **NO candidate camera clips have been downloaded into the editor and NO finished live-action master has been rendered**.

## Example proposed source pages, subject to rights and media-bytes validation
1. https://mixkit.co/free-stock-video/water-drops-creating-ripples-106/
2. https://www.pexels.com/video/watering-a-farm-8166769/
3. https://mixkit.co/free-stock-video/greenhouse-and-the-sun-2946/
4. https://www.pexels.com/video/aerial-view-of-agricultural-irrigation-system-34830665/
5. https://mixkit.co/free-stock-video/water-ripples-568/

Use stock only as **illustrative B-roll**; never claim the filmed irrigation represents Evercraft-owned engineering, equipment, local Yakima fields or a partner pilot. Mixkit also has RESTRICTED clips: verify each exact item's license before edit.

## Release gates
- Raw real-camera source bytes + immutable checksums for all five, source-specific commercial right grants and releases where appropriate.
- Editor compiles final live-action cut, verifies representative frames and normal iPhone playback, audio levels and source ledger.
- User approves actual rendered film and any publication; publishing requires platform-visible receipt.
- End text remains research disclosure until hardware and experiment prove performance.

**Status: film editor built and encode tested; live-action film NOT finished.** No footage downloads, purchases, outreach or public release have occurred.
