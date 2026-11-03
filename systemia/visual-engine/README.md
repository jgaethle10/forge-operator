# Evercraft Visual Engine | Aircraft Flyover Benchmark

**Status: source fixture and deterministic render-plan tests. Not a shipped render, a photorealistic claim, or a deployed customer product.**

This benchmark is one selectable graphics mode for Evercraft, not a mandate to build flight games or a ceiling on visual fidelity.

## Ownership and placement

Systemia directs the mission. Evercraft Graphics Command selects the treatment; Fallen / World Forge produce or import assets; World Engine owns camera/material/render state and compiles canonical WebGPU plans; independent render workers produce inspectable frames; Fallen / Clip may assemble films. No autonomous publication or production access is created by passing a graphics test.

This slice adds an **original synthetic aerial flyover**, authored without external models, texture downloads, third-party hosted runtimes, or real-world evidence claims.

## Implemented

- flyover.mjs: procedural triangulated aircraft fuselage, wings, tail and canopy; ocean and coast surface meshes; deterministic follow camera; original material and lighting configuration; canonical world/geometry schemas.
- flyover.test.mjs: geometry, replayability, time-input bounds, asset isolation and provenance checks.
- world-engine-integration.test.mjs: validates each geometry against the owned WebGPU validator, runs the canonical World Engine snapshot and visual-frame compiler, verifies the authenticated GPU render plan at 1280×720, and rejects modified plan content.
- Scoped CI workflow: validates commits/PRs modifying this benchmark.

## Run

From the repository root with dependencies installed:

    node --test systemia/visual-engine/flyover.test.mjs
    node --import tsx --test systemia/visual-engine/world-engine-integration.test.mjs

The tests verify contracts and planning. **They do not measure real raster quality, GPU throughput, reflections, shadows, atmosphere, texture fidelity or actual rendered frames.** Those require a native browser/GPU evidence run with captured reference frames.

## Quality gates toward cinematic output

1. **V0 source integrity:** original asset provenance, geometry validation, repeatable frames, fail-closed visual/render-plan digests. Passing this gate is not a statement about photorealism.
2. **V1 real pixels:** execute on a native WebGPU-capable browser, capture frames at 0 s / 2 s / 4 s, record adapter class, browser profile, shader digest, pixel dimensions and image hashes. Classify software adapters explicitly.
3. **V2 art direction:** replace low-poly procedural airframe with a rights-verified original high-detail mesh; implement physically plausible ocean, terrain, clouds, atmosphere, moving control surfaces, motion blur, shadow maps and reflection/post-process stages. Never relabel a plan as a completed frame.
4. **V3 benchmark tournament:** score composition, edge quality, texture stability, camera continuity, exposure, color, artifacting, and motion readability from real footage. Review both 16:9 and 9:16 crops, on mobile and desktop.
5. **V4 production readiness:** repeatable export, asset rights audit, performance/device receipts, bounded resource use, Fallen/Clip handoff, rollback and human-audited aesthetic acceptance.

The footage that inspired the request is a quality reference, not source footage to copy, an asset license, or a promise that these first primitive meshes already match it.

## What this enables

One provider-neutral foundation for commercial shots, Evercraft Worlds, historical reconstructions, product visualization, simulations, and future graphics styles from simplified illustrations through cinematic 3D. Visual quality is an option per project, not a game-specific requirement.
