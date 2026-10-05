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
- Deterministic behaviors for spin, constant force and oscillation.
- Input ledger with tick-bound events.
- Stable world-definition and snapshot SHA-256 digests.
- Deterministic replay receipts.
- Fallen Studio World → World Engine compiler.
- Worldstate evidence → world projection bridge with evidence state preserved.
- Provider-neutral render-frame contract with sampled skeletal pose/state handoff.
- Tests for replay determinism, entity collision, ground collision, canonical broad-phase ordering, ECS query ordering, scene streaming/state preservation, animation transitions/blending/events, input ordering, Fallen compilation and Worldstate projection.

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

1. Navigation meshes and agent locomotion.
2. Materials, lighting and camera graph.
3. Audio scene graph.
4. Multiplayer replication and rollback.
5. WebGPU / native renderer adapters.
6. Asset hot-reload and live Studio editing.
7. Animation authoring/import bridge for Fallen character assets.
8. Saban simulation tournaments and deterministic QA at scale.
9. Physical memory eviction / asset residency behind the logical scene activation contract.
10. Broad-phase acceleration upgrades for very large worlds.

## Test

```bash
npm run test:world-engine
```

## Proof

```bash
npm run proof:world-engine
```
