# EIX-001: World Engine Replay Bridge (candidate)

This module is an **internal, review-only source adapter** between canonical Evercraft World Engine `evercraft.world-engine.render-frame.v1` snapshots and an inspectable lesson player. It does not create or replace a graphics engine, ship a customer file, publish a public demo, or prove an observed event.

## Source to experience

1. The existing World Engine produces a deterministic world snapshot and its `compileRenderFrame` output.
2. `buildEixWorldReplay({frames, teaching_cues})` validates a finite, strictly ordered frame sequence and binds stable entity IDs, 3D positions, camera names, animation states, original ticks and optional visual-frame digest references.
3. The UI can use `seekEixWorldReplay(replay, timeMs)` and `inspectEixWorldEntity(replay, timeMs, id)` for playhead and tap-to-inspect. Seeking selects the most recent **real supplied sample**. It does not fabricate interpolation.
4. Authored teaching cues retain their claimed evidence state and source references, but never upgrade model output to real-world truth.
5. Actual WebGPU rendering still belongs to World Engine and its verified provider adapter. This module returns presentation data, not pixels.

## Truth boundaries

- All World Engine position/movement replay is labeled `modeled`. A projected gauge whose data state is `observed` remains an observed *datum inside a modeled world*, never observed excavation, flood propagation, or aircraft motion.
- The `visual_digest` field is a provenance **reference** copied from a canonical frame; this adapter does not recompute or authenticate it. Verify frame receipt/hash upstream under World Engine's existing contract before release.
- Data marked `observed`, `public` or `licensed` without source refs is demoted to `unknown`; authored cues making those claims without source refs fail closed.
- The adapter has no release, delivery, payment, outbound contact, or publication authority. Existing Systemia admission, Customer Gauntlet, exact-output, Shipping Department and Evercraft Payments gates are unaffected.
- No sensitive real files, patient/athlete/customer data, emergency prediction, or external distribution without prior authorization.

## Verification

```sh
node --test systemia/experience/world-frame-eix-adapter.test.mjs
npm run test:world-engine
```

The first suite covers seeking, identity, source labels, malformed/tampered metadata, copied output and authority boundaries. The new integration test under `systemia/world-engine/world-frame-eix-integration.test.ts` runs as part of the existing world-engine test glob and constructs **native** World Engine frame outputs including a Worldstate projection fixture.

## Next steps

Review via Systemia preflight and dedupe. Integrate a *single* existing Gravity/Fallen authored world or consented source record through this bridge, then use the owned renderer and browser QA to judge visual fidelity on physical Safari. Map the browser player to this contract instead of substituting independent canvas illustrations. Bring ForensiScope's real delivery receipts into a separate adapter with honest sender/recipient verification. Keep EIX preview and public/payment authority separate until verified.

## EarthWorks source-connected implementation

`earthworks-world-replay.ts` reuses `earthworks-autonomy/fleet-controller.mjs` for the machine dispatch, loading, payload, haul, dump and STOP ALL state. That simulator feeds explicit tick-bound `teleport` and `set_property` inputs to the **existing World Engine**, whose `compileRenderFrame` outputs are transformed by EIX-001. Inspectable machine state is a deliberate five-field allowlist, not the complete internal machine record.

The scene's coordinates are a **fictional authored site layout**. It is genuine EarthWorks controller output driving real World Engine frames, but it remains a software simulation. It is not surveyed 3D geometry, real machinery telemetry, a native WebGPU image, a safety-certified control system or a customer-ready Gravity rendering. This projection has no equipment actuation interface.

The existing World Engine CI now runs `earthworks-eix-integration.test.ts`. Tests check movement from controller state, source/motion labels, inspectable state, and that a **simulated** STOP ALL freezes projected positions and zeroes speed. The GitHub branch still requires CI, visual-worker, Systemia admission and source-rights review before any public or partner claim.

The next UX integration should load the produced `evercraft.experience.world-replay.v1` as a versioned scene cartridge and render the actual supplied frames, with empty/unavailable visual geometry shown as wireframe or inspection mode, never as a fake photoreal reconstruction.
