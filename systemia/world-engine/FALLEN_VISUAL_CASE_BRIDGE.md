# FALLEN RC13 → World Engine visual pipeline

**Status: internal engineering candidate, draft review. No public deploy, real-time feed, operational simulation or verified commercial checkout.**

This pipeline now has two distinct, tested layers, both inside the existing Evercraft World Engine:

1. `importFallenVisualCase(caseJson)`, in `fallen-visual-case.mjs`, validates FALLEN RC13 `fallen.visual-case.v1` disaster and sports exports and creates a SHA-256 sealed `evercraft.world-engine.visual-evidence-handoff.v1`.
2. `sceneFromFallenVisualHandoff(handoff)`, in `fallen-visual-scene.mjs`, builds a native `evercraft.world-engine.world.v1` definition, a camera, unlit material palette, a canonical triangle mesh and actual renderable facility/route/marker entities. The world can be consumed by `EvercraftWorldRuntime`, `compileVisualFrame` and `compileWebGpuRenderPlan`. It returns a sealed visual scene projection receipt with `verifyFallenVisualSceneReceipt`.

## Data fidelity

- Original RC13 design-screen pixel coordinates are normalized to [0,1] only for **abstract schematic presentation**. World coordinates are presentation units, not meters, GIS, calibrated athletic-field yards or body tracking.
- Response: facility points become colored square presentation markers, with existing name, kind, priority, source note and evidence label retained as entity properties.
- Sports: route polyline segments become thin rendered quads in the owned render plan. Player/defense markers are visible renderables; authored player colors remain in properties, while display uses a controlled palette.
- Display labels, map backgrounds and real terrain are **not** newly rendered here. This is intentionally not a replacement for the FALLEN RC13 HTML client.
- Each projection is a static visual scene. Native player path playback and incident timeline interpolation are future reviewed enhancements, not claimed here.

## Truth and rights

All projections stay `release_state: human_review_required`, `source_rights_state: unverified`, `publication_authority: false`, `decision_authority: false`. No incoming self-labeled `observed` field verifies a real-world observation.

No real flood, weather, emergency, sports-film, personal location, player tracking, payments or live systems are connected. A valid SHA-256 digest verifies local data integrity only, not truth, ownership, external source authorization or an authentic publisher identity. No inference of physical/hydraulic validity or field accuracy.

## Verification

The existing `.github/workflows/world-engine.yml` automatically runs tests on the proposed source change:

```sh
npm run test:world-engine
npm run proof:world-engine
```

Coverage:
- RC13 synthetic response and sports JSON input validation and tamper detection.
- Deterministic projections and scene integrity receipts.
- Native World Engine scene-definition validation and repeated simulation snapshot determinism.
- Actual `compileVisualFrame` and `compileWebGpuRenderPlan` generation, including geometry and material linkage.
- Explicit non-authority and non-physical source metadata.

**A successful WebGPU render-plan test is not proof of raster output on a real GPU or Safari.** Hardware-backed screenshots, source geometry rights, live data calibration and Systemia public release approval require separate tests and receipts.

## Roadmap

1. Native rendered-frame pixel readback and screenshot QA across browser/GPU environments.
2. Time-bound path and phase animation using existing World Engine tick-bound state, without misrepresenting authored motion as observations.
3. Geometry source/rights clearance, real coordinate frames and external data ingestion as separately approved tasks.
4. Fully verified browser → customer intake → payment → deliverable path before external commercial launch.

## RC13 deterministic authored motion

The existing native World Engine scene has a **bounded, human-authored timeline**.

- `buildFallenVisualMotionLedger(handoff, projection, {ticks})` creates canonical Engine `teleport` inputs for 1 to 240 ticks at 60 Hz.
- Sports play markers follow the *authored* RC13 route polylines at constant speed measured only in schematic presentation space; these are **not** real player tracking data, physical trajectories, field yards or athlete evaluations.
- The response scene includes an explicitly fictional `rc13:scenario-front` strip that advances through the schematic display; it is **not** flood water, inundation forecast, hydrology, danger zone, evacuation advice or real incident status.
- Native `EvercraftWorldRuntime.run(ticks, ledger.events)` produces snapshots that feed `compileVisualFrame` and, in turn, the existing WebGPU render planner. Both motion and source-projection receipts must verify before use.
- The motion ledger has deterministic content hashes and immutable truth-boundary assertions: `sourceMotionClass: authored_schematic_not_observed`, `release_state: human_review_required`, and both authority flags `false`. A hash alone does not authenticate an external supplier.
- Tests check mid-play/end-play positional change, visual-frame digests, deterministic replay, schematic constant arc-length, tampering, wrong-projection rejection and frame budget limits.

**Still outstanding:** hardware-rendered pixels and Safari validation, physical/geodetic calibration (where appropriate), licensed real sources, media rights, user privacy/security, and customer-facing deployment. Existing Systemia outreach holds remain active.
