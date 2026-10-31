# Evercraft Aqua Live-Action Film RC02

**Important:** This is a **real-camera-footage movie compiler**, not a rendered live-action movie yet. The source bytes have not been obtained in this runtime. It cannot render until five licensed clips are provided, independently reviewed and SHA-256-pinned. It intentionally rejects procedurally generated video, AI images, animation stand-ins and clips with unresolved rights.

## On NextGen or another machine with Python and FFmpeg

1. Download the real-footage source clips from the five canonical pages recorded in `manifest.json`, verifying each is a real-camera recording under a current license permitting edited commercial films. Some sources (including Mixkit) have individually restricted licenses, so do not rely on site-wide claims.
2. Save those 5 MP4s under `film/assets/` with names from `manifest.json`.
3. Verify license and human/brand releases as applicable, inspect for AI or CGI footage, calculate each source SHA-256, and set the 2 review booleans to true only after independent review.
4. From `film/`, run `python build_film.py --validate-only`; resolve HOLD conditions.
5. Then `python build_film.py`. A 1280×720/24fps H.264 Baseline/AAC fast-start MP4 and a JSON source receipt will be generated. Nothing is uploaded or published by this script.

## Creative edit (27 seconds)

0–5s real water droplets | "WATER IS ALWAYS MOVING." | 5–10s active irrigation | "EVERY DROP HAS A PATH." | 10–16s greenhouse interior | "WHAT IF WE COULD MEASURE IT?" | 16–21s irrigation detail | "RECOVER WHAT MAKES SENSE." | 21–27s water film and title "EVERCRAFT AQUA" + "RESEARCH IN PROGRESS | NOT DEPLOYED".

### Limits

- Film uses stock shots as *illustrative footage*, never as Evercraft pilot evidence or Yakima-site documentation.
- Original digitally synthesized audio from the prior previsualization is a reference bed. Review final loudness and replace if commercial music quality is not acceptable.
- Water recovery is not yet a validated product. No extrapolation of performance or endorsement.
- The file isn't an output-ready commercial until filmed clips, licensing and edit reviews pass.
