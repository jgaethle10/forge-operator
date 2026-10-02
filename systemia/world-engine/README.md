# Evercraft World Engine

Evercraft World Engine is the owned interactive-runtime layer beneath Fallen and beside Systemia Worldstate.

Fallen creates the world. World Engine makes the world run.

The boundary is intentionally provider-neutral. Evercraft owns the world definition, entity/component state, deterministic tick clock, input ledger, simulation snapshots, replay receipts, Fallen bridge and Worldstate projection. Rendering, GPU backends, physics acceleration, networking and device targets can be replaced without changing the canonical world.

## V1 nucleus

Implemented in this slice:

- `evercraft.world-engine.world.v1` canonical world definition.
- Deterministic fixed-timestep runtime.
- Entity transforms, rigid bodies, box/sphere colliders and a canonical ground plane.
- Gravity, damping, restitution and input impulses.
- Deterministic behaviors for spin, constant force and oscillation.
- Input ledger with tick-bound events.
- Stable world-definition and snapshot SHA-256 digests.
- Deterministic replay receipts.
- Fallen Studio World → World Engine compiler.
- Worldstate evidence → world projection bridge with evidence state preserved.
- Provider-neutral render-frame contract.
- Tests for replay determinism, ground collision, input ordering, Fallen compilation and Worldstate projection.

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

1. ECS storage and scene streaming.
2. Broad-phase + narrow-phase entity collision.
3. Skeletal animation state machines.
4. Navigation meshes and agent locomotion.
5. Materials, lighting and camera graph.
6. Audio scene graph.
7. Multiplayer replication and rollback.
8. WebGPU / native renderer adapters.
9. asset hot-reload and live Studio editing.
10. Saban simulation tournaments and deterministic QA at scale.

## Test

```bash
npm run test:world-engine
```

## Proof

```bash
npm run proof:world-engine
```
