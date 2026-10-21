# Relay native mobile-camera acceptance test

**Date:** October 19, 2026
**Release:** INTERNAL / NOT APPROVED FOR PUBLICATION
**Scope:** Fallen graphics-engine QA; not a cinematic advertisement or a live Relay launch.

## Source identity

- Pilot: actual responsive Relay v0.1 owner UI with fictional Morgan Chen and Alex Rivera meeting records.
- Mobile source: 390 x 3170 PNG.
- Source SHA-256: `03284c0b801e9835a14e00607be1deedc63f58445a718c97cace0d64c9e54268`
- Do **not** commit or circulate original private invite tokens or participant access URLs.
- Local input capture was not committed into the repository.

## Rendering evidence

An exact copy of `render-worker/runtime.mjs` from passing GitHub render CI was downloaded from that run's source artifact. The production `buildStageHtml(stage)` generated Chromium HTML for a verified local screenshot; the real `__evercraftRenderFrame(frame)` entry point was called for each frame in local Chromium. The authorized image endpoint was served from local bytes, not the public network.

- Native stage: 1080 x 1920 @ 30fps, 6.0 seconds, 180 rendered frames.
- MP4 SHA-256: `dfc586c16ee87bf04ce85dca1c6f8fb7662733af9c84c3cdd0a87fa617d91d59`
- Five screenshot timestamps: 0.0, 1.5, 3.0, 4.5, 6.0 seconds; verified distinct moving/source positions where expected.
- One source crop with intentional static reading holds: two independent interpretations, deterministic contradiction warning, human-confirmation form.
- No music or voiceover. No audio-quality or professional film production claim.
- No browser console errors observed.

This is **runtime parity evidence**, not a claim of invoking the secured `/v1/render` HTTP production worker for the customer screenshot. The separate CI synthetic pixel test does verify the secured worker API end-to-end.

## Review findings

1. Native portrait capture is far more viable than shrinking the wide desktop screenshot. Earlier original screenshot comparison projected 14px source copy at approximately 5.0px from the desktop crop versus 13.2px from the mobile crop at a 390px phone.
2. Even an exact camera path needs editorial reading holds. Slow constant motion can clip text during the moment the viewer is reading.
3. The built-in observed-data badge remains a rough technical proof element and needs conscious product-label styling for a commercial.
4. The one-source proof still lacks acting, genuine environment footage, scene continuity, synchronized sound design, and a cinematic storytelling arc.
5. Final phone-scale text readability requires an actual device and human review. Crop geometry and source glyph estimates are not a substitute for reading comprehension testing.

## Remaining acceptance gates

- Bind this source-specific review case to a documented, privacy-safe local asset and verified stage receipt.
- Incorporate protected reading intervals and source glyph metadata on each deliberate hold.
- Capture/inspect final phone-size frames from the actual final video file, not only the stage.
- Connect the real camera proof into the authorized Fallen finishing process, apply branding, and obtain creative owner approval.
- Verify any Kennedy Space Station handoff separately.
- Do not present this as an AI semantic-inference demo. The pilot compares structured date/milestone fields.

No spend, production deployment, commercial publication, outreach or merge is authorized by this note.
