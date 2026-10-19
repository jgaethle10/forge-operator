# Fallen / World Engine | Cinematic Camera Rig RC001

A **real 3D scene camera-plan compiler**, not animation of a screenshot or a second media app. Designed to feed existing digest-verifying World Engine WebGPU rendering and downstream Fallen editorial. This module does not itself draw pixels or export video. That is a later job for the owned GPU renderer and Fallen timeline/Clip.

## Shot controls

`evercraft.world-engine.cinematic-camera-take.v1` has a named **real perspective camera entity** and a visible, renderable target entity. It supports four deliberate camera paths:

- **Dolly:** controlled world-position move toward or away from the subject.
- **Crane:** rising/falling world-position movement (non-zero vertical travel enforced).
- **Orbit:** circular sweep around the actual evolving subject position, with bounded radius/sweep.
- **Follow:** camera offset bound to the actual fixed-step moving subject, not screen-space pan.

Each path has linear, smoothstep, or smootherstep ease, end-to-end focal tracking and bounded field of view and roll. The compiler invokes the existing deterministic World Engine runtime for every frame, then calls the **canonical** `compileVisualFrame` and `compileWebGpuRenderPlan` with real geometry/material/light bindings. The original world data is never mutated. Unsupported frame timing, missing geometry, invisible target, empty/invalid camera paths and unsafe/failing proofs are rejected.

Example `take.json` (requires matching actual world, geometry and textures):

```json
{
  "schema":"evercraft.world-engine.cinematic-camera-take.v1",
  "id":"industrial-hero-orbit",
  "cameraEntityId":"cinema-camera",
  "targetEntityId":"machine",
  "durationSec":4,
  "fps":30,
  "move":"orbit",
  "ease":"smootherstep",
  "orbit":{
    "radius":9,
    "startAngleDeg":-65,
    "endAngleDeg":65,
    "startHeight":1.5,
    "endHeight":3
  },
  "startFovYDeg":48,
  "endFovYDeg":40
}
```

## Input constraints

1. The referenced world must be a valid canonical `evercraft.world-engine.world.v1` with a `visualScene`. The `cameraEntityId` must equal `initialCameraEntityId` and use a perspective camera. `targetEntityId` must be a visible renderable.
2. Camera footage is planned on an exact fixed-step clock: `world.tickRateHz` must divide evenly by 24, 30 or 60 FPS. Run length .5 to 8 seconds, maximum 480 steps plus the ending sample. Positions and identity come from canonical world snapshots.
3. The geometry input is an array of actual `evercraft.world-engine.geometry.v1` entries whose IDs match entity renderables. Textures, if needed, must pass existing WebGPU validated texture contracts. Missing assets block.
4. The resulting plan sequence is **not rendered imagery**, animation proof, or a cinematic-quality rating. If the world only contains low-quality geometry or texture, no camera path makes it photorealistic.

## Export (Node 22, existing tsx repo setup)

```bash
npm run world:cinematic-camera -- \
  /private/actual-world.json \
  /private/actual-take.json \
  /private/geometry-array.json \
  /private/new-render-plan-directory \
  /private/optional-texture-array.json
```

The new private directory contains `manifest.json` with SHA-256 input-file hashes, camera coordinates and frame digests, plus each full, exact `frames/00000.json` WebGPU plan. Source file byte hashes are evidence of integrity, not rights verification or creative acceptance. CLI rejects pre-existing output directories and fails before file emission if any frame cannot be compiled.

## Next quality gates

Run the verified GPU render backend to capture actual output frames, inspect visual image evidence, compose a 9:16 or 16:9 film through Fallen, finish with Action Finish #1452 where appropriate, retain real source/rights state and simulation disclosures, then run the tournament, master QC and founder publication gate.

Tests: `npm run test:world-engine`. Existing World Engine CI provides the authoritative checks; no real commercial rendering or Node002 hardware GPU performance is implied.

Related #1450, #1454 atmospheric-depth, #1443 cinematic coverage, #1449 source intake.
