# Kennedy Space Station: independent spatial ingress candidate

**Status:** isolated engineering candidate, not production admitted.

This module is an **original bridge** that converts an already-adjudicated, locally measured KSS layout into 3D triangle meshes using the existing `evercraft.fallen.geometry.v1` contract. World Engine's existing `geometryFromFallenAsset` is the intended downstream consumer. No live end-to-end import or GPU render is claimed.

Original generic KSS spatial solver, render profiles and PDF compiler currently reside in the SYSTEMIA Marketing Agency Base44 application. They are **not** copied or moved by this branch. The independent spatial core candidate and fully synthetic benchmark input were archived privately to the owner's Google Drive.

## Verify

```bash
node --test systemia/graphics-command/kss-spatial-ingress.test.mjs
```

Nine isolated tests passed in the Base44 shell on 2026-10-17.

## Truth boundaries

- All authored test geometry is synthetic. No RIVET, VDOT, AliEV, or other partner-specific drawings, reports, imagery, customer lists, credentials, or data migrated.
- Licensed inputs require explicit derivative-use approval. Rights classifications must be independently substantiated before any real-world use.
- Geometric checks are conservative. No survey, ADA certification, professional engineering, permitting, or construction-grade claim is made.
- Rendering and publication remain separately gated. No app deployment, publication, or revenue attributed to this extraction.
- Legacy hard-coded service-token fallbacks in RIVET/AliEV/KSS cross-app bridges require rotation and managed secrets before reusing those services.

## Next: actual engineering extraction

1. Inventory ownership and prove the reusable, non-partner provenance of the generic KSS solver and profile modules.
2. Move the spatial solver, neutral render profiles, sheet renderer and QA into a separately versioned private KSS service, with relative paths, pinned dependencies and reproducible test fixtures.
3. Prove `compileKssWorldHandoff` output imports into `geometryFromFallenAsset`, then run a real World Engine/WebGPU preview.
4. Prove a clean-room synthetic site renders S-0/A-0 plus a 3D Fallen scene, comparing independent QA and shot alternatives.
5. Route through Systemia mission admission; require signed stage receipts through Visual Desk and Clip. Do not claim auto-publishing from queue existence.

Tracker: https://github.com/jgaethle10/forge-operator/issues/1361
