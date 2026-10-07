# Evercraft World Engine

Evercraft World Engine is the owned interactive-runtime layer beneath Fallen and beside Systemia Worldstate.

Fallen creates the world. World Engine makes the world run.

The boundary is intentionally provider-neutral. Evercraft owns the world definition, entity/component state, deterministic tick clock, input ledger, simulation snapshots, replay receipts, Fallen bridge and Worldstate projection. Rendering, GPU backends, physics acceleration, networking and device targets can be replaced without changing the canonical world.

## Runtime status

Implemented in this slice:

- `evercraft.world-engine.world.v1` canonical world definition.
- Deterministic fixed-timestep runtime.
- Entity transforms, rigid bodies, scale-aware box/sphere colliders and a canonical ground plane.
- Deterministic sweep-and-prune broad phase plus sphere/sphere, box/box and sphere/box narrow-phase collision.
- Deterministic impulse response, positional separation, gravity, damping, restitution and input impulses.
- Deterministic entity/component indexing with canonical tag/component queries.
- Scene manifests with explicit bounds, preload radius, dependencies, global entities and stable stream-plan digests.
- Runtime scene activation that stops inactive simulation without discarding entity state.
- Deterministic skeletal rigs, keyframed clips, sampled bone poses and shortest-path Euler rotation interpolation.
- Parameter-driven animation state machines with priority, blend windows and tick-bound transitions.
- Per-tick animation event receipts carried into provider-neutral render frames.
- Streamed-out entities freeze animation time and resume from preserved runtime state.
- Deterministic polygon navmeshes with validated symmetric adjacency and canonical A* tie-breaking.
- Tick-bound navigation targets, path digests and stateful agent locomotion.
- Navigation drives desired horizontal velocity while owned physics remains movement/collision authority.
- Navigation can drive animation movement parameters in the same simulation tick.
- Streamed-out agents freeze path progress and resume from preserved runtime state.
- Canonical PBR/unlit material definitions with texture references, alpha modes and fail-closed bindings.
- First-class renderable, ambient/directional/point/spot light and perspective/orthographic camera components.
- Deterministic camera transition graph with tick-bound camera activation and engine-resolved interpolation.
- Camera layer masks plus scene residency deterministically gate renderables and lights.
- Provider-neutral visual-frame contracts carry resolved camera, sorted materials, visible geometry bindings and active lights.
- Canonical audio scenes reference Fallen-produced/mastered assets through clip IDs and audio asset refs.
- First-class audio emitters/listeners, buses, autoplay/loop state, playback rate and deterministic playhead state.
- Tick-bound play, pause, stop, seek and listener-switch inputs participate in replay truth.
- Deterministic 2D/3D attenuation, listener-relative position and effective bus/listener/emitter gain.
- Streamed-out emitters freeze playback and resume from preserved playhead/loop state.
- Provider-neutral audio-frame contracts let replaceable backends consume spatial playback truth without owning it.
- Versioned transport-neutral replication sessions, hashed input envelopes and authoritative checkpoint packets.
- Digest-verified full snapshot restoration for deterministic rollback.
- Predictive client rollback that discards stale past predictions and replays eligible future inputs in canonical order.
- Bounded rollback windows, idempotent input submission and fail-closed late-authority input handling.
- Packet digests provide deterministic content integrity only; transport authentication/encryption remain separate security adapters.
- Verified visual frames can compile into deterministic `evercraft.world-engine.webgpu-plan.v1` GPU work plans.
- Canonical geometry assets validate positions, normals, UVs, optional tangent vec4 handedness and triangle indices before GPU planning.
- Owned zero-dependency WGSL implements untextured PBR-lite/unlit material paths plus ambient, directional, point and spot lighting.
- The browser WebGPU adapter owns device/buffer/pipeline submission only; visual-frame truth remains in World Engine.
- WebGPU v9 fails closed on missing geometry, tampered visual receipts and more than eight active lights.
- Node CI proves plan/shader contracts; a separate native Chromium conformance lane now requires actual WebGPU adapter/device acquisition, compute-buffer readback and raster texture readback.
- Browser WebGPU conformance classifies SwiftShader/llvmpipe/lavapipe as software execution, preserves ambiguous adapters as unknown, and permits a hardware claim only when adapter metadata reports a non-software hardware signal.
- The browser device receipt retains the exact launch profile, adapter metadata, compute/raster observations and native-browser preflight receipt hash.
- Canonical texture assets carry exact RGBA pixel bytes, dimensions and color format with SHA-256 identity.
- Material sampler state is canonical and normalizes address/filter modes deterministically.
- Base-color, ORM and emissive textures compile into deterministic WebGPU plans with texture digests and explicit binding flags.
- Textured geometry requires UVs.
- PBR normal maps require canonical tangent vec4 data with explicit handedness and linear `rgba8unorm` normal textures.
- Owned WGSL reconstructs TBN from transformed normal/tangent state and applies tangent-space normals before lighting.
- WebGPU execution creates real texture/sampler bind groups and applies ORM channels as occlusion/roughness/metallic inputs.
- Texture residency is budgeted deterministically from required texture IDs and emits load/retain/evict receipts.
- Texture hot reload preserves texture identity, replaces pixel content and invalidates only the affected GPU texture cache.
- Native Chromium reference-frame conformance compiles the exact owned `EVERCRAFT_WEBGPU_WGSL`, renders a known textured frame and verifies mapped pixel readback against an explicit baseline.
- Reference-frame receipts bind the exact shader SHA-256, launch profile, browser preflight receipt and expected/observed pixel values.
- Browser CI watches World Engine renderer changes so reference-frame evidence automatically refreshes when the shader changes.
- Versioned live Studio edit transactions bind to exact world and asset-manifest digests before mutation.
- Human, agent and code edits share the same deterministic world-edit contract and produce SHA-256 receipts.
- Edit receipts carry inverse transactions for semantic undo while world/asset revisions remain monotonic.
- Canonical asset manifests preserve asset identity, content digest, source provenance, rights state and license.
- Geometry hot reload replaces the same asset identity, emits a deterministic receipt and invalidates the WebGPU buffer cache without making renderer state authoritative.
- Live authoring fails closed on stale bases, referenced-material deletion, content changes without asset revision advancement and invalid rights lineage.
- Compatibility-gated live runtime migration carries a running simulation across a newer world revision without blindly copying stale state.
- Runtime migration preserves transform/properties/motion/animation/navigation/audio independently only when each underlying definition remains compatible.
- Authoring transform changes win over runtime position, rigid-body contract changes reset motion, changed audio clips reset playheads and removed/new entities reconcile explicitly.
- Tick-rate changes fail closed, collision contacts reset, scene residency migrates deterministically and every preserved/reset decision is recorded in a migration receipt.
- Deterministic behaviors for spin, constant force and oscillation.
- Input ledger with tick-bound events.
- Stable world-definition and snapshot SHA-256 digests.
- Deterministic replay receipts.
- Fallen Studio World → World Engine compiler.
- Fallen geometry → canonical World Engine geometry importer with explicit right-handed Y-up meter units, provenance/rights receipts and deterministic tangent generation.
- Fallen imports preserve authored canonical tangents when supplied; otherwise they generate deterministic UV/Gram-Schmidt tangents with explicit handedness.
- Degenerate UV/position triangles, implicit unit/coordinate conversion and malformed authored tangents fail closed.
- Fallen geometry import receipts bind source, provenance and resulting geometry SHA-256 digests and feed directly into the normal-map/WebGPU pipeline.
- Fallen animation assets import directly into the canonical skeletal runtime with explicit right-handed Y-up meter units, degree rotations and provenance/rights receipts.
- v17 performs no hidden retargeting: authored bone IDs, hierarchy, clips, states, transitions and event markers must validate directly against the World Engine animation contract.
- Non-semantic rig/clip/state array order is canonicalized deterministically, while authored keyframe time order is preserved and unsorted curves fail closed.
- Fallen animation import receipts bind source, provenance and canonical animation-component SHA-256 digests and prove runtime transition/event execution.
- Worldstate evidence → world projection bridge with evidence state preserved.
- Provider-neutral render-frame contract with sampled skeletal pose/state, navigation/debug handoff, canonical visual subframes and audio subframes.
- Tests for replay determinism, entity collision, ground collision, canonical broad-phase ordering, ECS query ordering, scene streaming/state preservation, animation transitions/blending/events, navmesh pathfinding/arrival/freeze-resume, material/light validation, camera graph interpolation/layer masking, audio playback/loop/seek/listener switching/attenuation, snapshot restore/tamper rejection, authoritative checkpoints/client prediction/rollback convergence, geometry/WebGPU render-plan/shader/failure-boundary contracts, texture/sampler validation, textured plan bindings, texture residency/hot reload, tangent validation, normal-map residency/TBN shading, Fallen geometry import/provenance/authored-or-generated tangents, deterministic/reversible Studio edits, stale-edit rejection, asset-rights lineage, geometry hot reload, compatibility-gated runtime migration/state preservation/reset behavior, input ordering, Fallen compilation and Worldstate projection.

## Architectural contract

```
Systemia
   |
   +--> Fallen / Media Studio ------> authored assets, canon, characters, environments
   |
   +--> Worldstate -----------------> observed / inferred / modeled reality context
   |
   +--> Evercraft World Engine -----> state + time + simulation + behavior + replay
                                      |
                                      +--> renderer adapters
                                      +--> game/runtime clients
                                      +--> film previz
                                      +--> digital twins
                                      +--> interactive journalism
                                      +--> training/simulation
```

The engine does not gain publication authority, payment authority, emergency authority or autonomous real-world decision authority from either bridge.

## Next engine layers

The V1 contract is deliberately small enough to prove ownership before expanding. The next compatible layers are:

1. Navigation corridor smoothing / dynamic obstacle avoidance.
2. Server-side rollback policy for explicitly admitted late inputs.
3. Shadow-map / reflection / post-process contracts behind the visual-frame boundary.
4. Spatial panning / occlusion / reverb-zone contracts behind the audio-frame boundary.
5. Collaborative edit merge / conflict-resolution contracts.
6. Saban simulation tournaments and deterministic QA at scale.
7. Cross-frame texture retention / broader physical memory eviction for very large worlds.
8. Native/WebGPU reference images across multiple material and lighting fixtures.
9. Geometry import optimization for large authored scenes without weakening canonical receipts.
10. Explicit retargeting profiles for intentionally mapping animation between different authored rigs.

## Test

```bash
npm run test:world-engine
```

## Proof

```bash
npm run proof:world-engine
```
