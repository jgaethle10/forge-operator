# Evercraft Fallen | Three Visual Delivery Lanes

This is an **executable review-video composer**, not a new world renderer or publication service. The existing World Engine supplies real GPU pixels. Fallen already owns timeline editing, cinematic audio mastering and master QC. This module takes a *rights-declared*, SHA-256-matched source video and creates three actual H.264 internal previews.

## Outputs and constraints

- **Cinematic:** hero/story treatment, default widescreen with synthetic visualization disclosure when applicable.
- **Educational:** a real burnt-in teaching annotation with the words ILLUSTRATIVE RECONSTRUCTION and NOT AN OBSERVED HISTORICAL RECORD when the source is synthetic. Every factual claim must supply external evidence references and a separate fact-review reference. References are provided by the caller, not automatically authenticated by this tool.
- **Commercial concept:** brand/title treatment and vertical format with INTERNAL CONCEPT / NOT A CLIENT AD wording. The tool refuses sales CTAs for unapproved concepts, and customer-brand projects require a permission reference.

Each cut may choose 16:9, 1:1 or 9:16. The compositor fits the source without cropping it. If the image occupies under 60% of the frame, both the receipt and the actual rendered video say CAMERA REFRAME REQUIRED. This prevents a widescreen 3D shot from being quietly passed off as a good vertical advertisement.

## Invocation

Supply a JSON input with schema evercraft.fallen.visual-lanes-request.v1, unique id, source path, actual SHA-256, rights (owned or licensed), evidenceState (synthetic_visualization, modeled_visualization, observed, licensed_source or product_capture), sourceRefs, brand name and state, and a cuts array with exactly cinematic, educational and commercial entries. See systemia/media-studio/visual-lanes.test.mjs for a working request and tamper tests.

Run:

    node systemia/media-studio/visual-lanes.mjs /absolute/request.json /new/output/directory

The output directory must not already exist. On success it contains three MP4s, three actual decoded middle-frame PNGs, a source provenance and media-probe receipt with per-video SHA-256, educational claim declarations, audio policy, frame-occupancy warnings and hard release denial. Failed partial work is cleaned up.

Execute the real FFmpeg tests:

    node --test systemia/media-studio/visual-lanes.test.mjs

GitHub workflow Fallen visual delivery lanes runs and stores decoded video evidence without third-party model costs. Its CI fixture uses a generated moving color-bar video. The separate founder-review demonstration also uses the actual Evercraft World Engine battleship MP4, not an invented image.

## Release boundaries

Source file hashes establish byte identity, NOT legal ownership. Rights and client permissions are only declared, and must be verified independently before paid work. This tool cannot independently verify historical claims or get a client signature. Audio is silent unless preservation is explicitly chosen and the source has rights-cleared audio. The default 640x360 review output does NOT establish native 1080p production quality.

All output is explicitly internal review-only. No publication, client sending, checkout, payment, CRM contact, or paid cloud action. Existing creative evaluation, Fallen master QC, source truth checks, contract authorization and the founder's approval must happen later.

P0 follow-ups: actually rendered aspect-specific 3D cameras, 1080p original sources, motion graphics anchored to 3D entities, consented client brand assets and a real sound-audition and production editing lane. Graphics mission #1450; review PR #1472.
