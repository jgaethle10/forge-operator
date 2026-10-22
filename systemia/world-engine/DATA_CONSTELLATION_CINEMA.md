# Evercraft World Engine | Original Data Constellation Cinema

A reusable, original WebGPU camera/lighting/geometry scene, **not** a pre-rendered illustration or a new graphics engine. The geometry is synthetic: 75 modeled information nodes, three relay hubs, source-generated relationship geometry and a cinematic target orbit. No third-party reference footage, API subscription, Base44 dependency or external network assets.

## Actual run
```bash
npm install --no-audit --no-fund
cd systemia/evercraft-web/browser-worker && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-audit --no-fund && cd ../../..
npx tsx --test systemia/world-engine/data-constellation-scene.test.ts

CINEMATIC_SCENE=data_constellation \
CINEMATIC_PROOF_OUTPUT=/tmp/evercraft-data-constellation-film \
EVERCRAFT_NATIVE_BROWSER_STATE_DIR=/tmp/evercraft-data-constellation-chromium \
npm run world:cinematic-render-proof
```

Expected output after an **actual successful run**: `evercraft-data-constellation-native-gpu.mp4` (silent H.264, default 640x360, 24fps, 96 decoded frames), `opening.png`, `middle.png`, `closing.png` and a source and frame-hash-bound `receipt.json`. The film workflow checks these independently. This is a native *WebGPU API* path, not a hardware GPU assertion; it may use SwiftShader.

To experiment with a higher native output resolution, set `CINEMATIC_HIGH_RES=1`. This requests 1920x1080. **No high-resolution output is verified until it successfully renders, decodes, passes visual review and has a corresponding truthful receipt.**

## Artistic criteria from owner reference films

This is the **data intelligence** family, distinct from a generic neon reactor. Evaluate purposeful clusters, physical dimensionality, relationship legibility, real perspective, controlled highlight intensity, readable visual hierarchy and camera movement with meaning. Do not overrate simply because the film encodes or the frame digests differ.

The native render CI and code live in draft PR #1570. The separate, tested Visual Floor adapter in PR #1571 consumes its movie and receipt and produces frame-accurate shot dailies using the existing Visual Floor tool from PRs #1568 and #1569. Keep them separate until verified source pixels and review evidence support promotion.

No merchandise, paid production, customer-ready deliverable or automatic social publication is authorized. Source is original synthetic art, not real customer data or evidence of an actual network. Owner review of the **real** footage is mandatory.
