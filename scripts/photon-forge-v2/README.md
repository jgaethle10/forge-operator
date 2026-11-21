# Photon Forge V2 | Owned cinematic VFX canary

This is an **experimental owned Evercraft shot stage**, not another graphics department. It exercises a 10-second / 300-frame cinematic reactor sequence. Production source is in `stage.html`; no external assets, network imports, credentials, subscriptions, or audio.

## Current evidence (October 21, 2026)

- Browser test: Canvas 2D **software projected-3D fallback** executed at 960×540, sampled at 1.2, 3.4, 5.3, 7.7 and 9.3 seconds without JS errors.
- Offline audition: 300 exact-time frames encoded into a 10.000-second H.264-only MP4 at 30fps and 960×540. FFprobe verified decoded frame count. The video/receipt are audition artifacts, not deployed files.
- Shader source: WebGL2 SDF raymarching of animated toroidal reactor geometry, lighting, Fresnel response, camera dolly, beam convergence, event shockwave and tonemapping. **WebGL2 was unavailable in the test container**, so GPU compilation, native GPU device classification and rendered quality remain unverified.
- Software preview fallback: animated projected 3D ring geometry, parallax, beams, optical glows, electric-particle motion and a branded reveal. `data-graphic-backend` and `__evercraftStageInfo().method` identify the actual backend.
- No sound is included. Prior Photon Forge music/SFX was rejected and cannot be presented as an Evercraft-approved sound master.

## Exact-frame compatibility
```js
window.__evercraftRenderAt(5);          // render at 5 seconds
window.__evercraftRenderFrame(150,30);   // exact 30 FPS midpoint
window.__evercraftStageInfo();          // schema, backend, rights/authority
window.__evercraftExportPng();          // composited PNG data URL of current frame
```

These entrypoints match the existing deterministic browser-renderer pattern used by Fallen/Visual Desk. The stage reports `publicationAuthority:false`, `audioIncluded:false`, and synthetic content.

## Run
```bash
python3 -m http.server 8765 --directory scripts/photon-forge-v2
# open http://localhost:8765/stage.html
node --test scripts/photon-forge-v2/stage.test.mjs
python3 scripts/photon-forge-v2/render-video.py --output /tmp/photon-v2.mp4
```
Exporter dependencies: Python 3, Playwright with Chromium, FFmpeg and FFprobe. The renderer handles offline HTML through browser set_content and never fetches third-party assets. Use `--require-webgl2` to fail if only the software preview is available. It does **not** claim to have exercised World Engine.

## Megazord handoff

This branch is stacked on the unmerged Graphics Megazord PR #1498. The canary is intentionally under `scripts/`, outside Graphics Command's fail-closed capability baseline. Promotion into `systemia/graphics-command` requires an explicit baseline/profile update and a bound production-jobpack shot ID. Next route: **Graphics Command shot work order → World Engine canonical visual-frame/replay → native GPU or approved backend → rendered frame hashes → Fallen timeline/audio → master QC → Visual Desk/Clip only with explicit human publishing approval.** No execution gate may be flipped just because the canary renders. GPU and World Engine bridges remain to be implemented.
