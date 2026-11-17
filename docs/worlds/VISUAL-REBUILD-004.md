# Evercraft Worlds | First verified original glTF model in scene
The source module `public/worlds/assets/mossmere-weathered-stone-generator.mjs` deterministically constructs a real glTF2 binary GLB from original authored vertices, normals, triangles and a rough limestone material. Source-controlled code is the immutable authoring record; the GLB is generated in memory on startup and can be exported to disk independently for later 3D editing.

The fixed reviewed rights manifest is `mossmere-weathered-stone.rights.json` with SHA-256 `ff95fccd4ad06e4ef50caf06952da6db0f7dc0f4225e7c6a409580f87d67a38d`. Admission uses the existing owned GLB parser and WebCrypto digest check; corruption, unsupported features and unauthorized rights fail closed to the prior spheres.

The renderer instantiates 20 pond stones from the approved original mesh, with no external asset CDN or new scene/save schema. This is the first complete **authored geometry → real GLB → fixed integrity check → WebGL2 mesh** path. Its original source code avoids fragile binary Git uploads.

Testing:
- `node --test tests/worlds-owned-glb.test.mjs tests/worlds-owned-scene-asset.test.mjs`
- Browser conformance checks `window.__worldsAssetTelemetry` on desktop and mobile emulations and fails if the intended original geometry wasn't actually loaded.
- Real Chromebook/iPhone performance and visual art review are still required before live deployment. The current shader is not full PBR.

Do not infer final graphics quality from the GLB/geometry test. Substantive materials, textures, authored foliage, character rigs and shadows are still ahead.
