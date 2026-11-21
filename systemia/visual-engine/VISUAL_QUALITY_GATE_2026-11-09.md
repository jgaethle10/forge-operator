# Evercraft Visual Engine: Visual Quality Gate

**Review date:** 2026-11-09
**Source:** founder's visual review of real native v3 frames at t=0 and t=4
**Branch:** `visual/aircraft-flyover-benchmark-2026-11-03`
**Scope:** cinematic/film-quality preset, not the baseline World Engine capability
**Decision:** **NOT ACCEPTED FOR CINEMATIC OUTPUT**. Engineering pixel proof passed; art direction and visual fidelity did not.

## Observed on the actual screenshot frames

1. **Aircraft:** low-polygon toy-like fuselage/wing and visible simplistic black propeller. No meaningful panel seams, rivet/fastener surface variation, convincing glass/cockpit, thickness, landing/engine detail or high-frequency normal detail. The camera can show it, but the asset itself lacks fidelity.
2. **Terrain:** oversized smooth green shapes with nearly uniform flat materials and abrupt geometric shorelines; no vegetation, rocky cliffs, erosion, material layers, or detailed coastal silhouette.
3. **Water:** uniform teal plane with insufficient wave-scale variation, surface normals, horizon reflection, sun glints, foam or shoreline interaction.
4. **Atmosphere:** constant flat-blue sky and white elliptical cloud silhouettes. Current cloud geometry adds some mass but not cloud illumination or depth; no horizon haze, depth/fog, sky gradient or aerial perspective.
5. **Light and camera:** minimal dynamic range; sun direction and cloud/terrain shading do not establish a cinematic time of day. No clear contact shadows, self-shadowing, reflected light or physically motivated highlights.
6. **Presentation:** image reads as a basic prototype or early game blockout rather than the target production still. Correct technical execution and improved anti-aliasing do not change that judgment.

The screenshots are a visual review, not a pixel-precise instrument. The native CI test's 4× MSAA, image SHA-256, draw counts and SwiftShader classification are **engineering** evidence and cannot satisfy this release gate.

## Correct engineering pivot

**Do not continue indefinitely adding primitives in `atmospheric-flyover.mjs`.** Prioritize the authored-asset and physically plausible shading pipeline as reusable World Engine capabilities.

### Gate A: asset fidelity (blocking)

- Import a genuinely high-detail, **Evercraft-original or explicitly rights-verified** aircraft mesh with cockpit glass, separated materials, correct orientation, normals, tangents, UVs, and LODs.
- Confirm provenance, polygon/vertex counts, source checksum, material references and GPU budget. Render an unlit turntable first to test silhouette independently of shading.
- Establish a terrain/shoreline asset path using mesh/heightmap detail, distinct rock/ground/vegetation layers and far-distance LOD. Do not claim a geographically accurate real coastline.

### Gate B: world rendering (blocking)

- Build physically motivated sky gradient with atmospheric depth/fog and sun-relative colors; keep current flat-color preset as an intentional stylized option.
- Implement scalable ocean surface shader with animated multiscale normals, roughness-dependent reflections and horizon response; add shoreline foam only when coastline/shore geometry supports it.
- Add direct-light shadow maps or another proven visible shadowing method, with softness bias and artifacts measured; add tone mapping/exposure, sky fill and specular highlights.
- Integrate high-quality volumetric/sky clouds or a perceptually convincing layered alternative. Avoid flat white ellipsoid stand-ins.

### Gate C: visual film and performance proof (blocking)

- Same exact reproducible sequence at t=0, 2, 4 seconds in 16:9, plus a 9:16 crop. Camera must show aircraft silhouette, atmosphere, water and terrain at once.
- Capture **actual** PNG/video output in headless Chromium and on the user's owned NextGen hardware when connected, declaring backend and never falsely claiming hardware proof from SwiftShader.
- Record frame time, GPU memory budget, frame hashes, temporal consistency, output dimensions, and failed/unsupported adapter states.
- Manual review of the produced frames against a **rights-safe reference board**, across asset fidelity, lighting, materials, composition, and motion. Require founder acceptance before marking cinematic-ready.
- A passed WebGPU/CI proof does not imply the scene meets these gates.

## Priority

1. **Next implementation:** a reusable high-detail mesh and texture ingestion adapter with provenance receipts, tangent-space normals, texture channels, and LOD, inserted into canonical World Engine.
2. Then physically plausible sky/ocean shading and shadowing.
3. Then art-direction tuning plus tested 4–8 second film export, not more isolated screenshots.
4. Keep low-poly and mobile-friendly presets as options, never as the overall visual quality ceiling.

**Commercial/launch state:** HOLD. PR remains draft. No photorealism claims, no cinematic-quality promise, no film release, no advertisements based on these frames.
