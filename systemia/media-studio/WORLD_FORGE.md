# Fallen World Forge

**World Forge** is Fallen's native spatial creation layer: Evercraft's owned answer to the all-in-one 3D creation workflow.

It is not a Blender skin and it is not a new disconnected product. It lives inside `systemia/media-studio` so the same world can move through story planning, continuity, spatial authoring, cinematography, Shot Tournament, timeline editing, delivery and Evercraft Clip without a destructive export/import chain.

## Product thesis

Traditional 3D packages are built around a person operating an application. World Forge is built around a persistent creative world that can be operated by people, agents, automation and code through one canonical scene contract.

The target is Blender-class breadth with an Evercraft-native operating model:

- one durable scene graph for objects, cameras, lights, materials, procedural graphs, animation and simulation;
- GUI actions, code actions and natural-language actions resolve to the same typed operations;
- every agent edit is bounded, versioned and receipt-backed;
- destructive edits require explicit authority;
- locked objects are respected;
- asset rights, evidence state and source lineage travel with the asset;
- the scene digest is deterministic and suitable for continuity/provenance receipts;
- the project stays editable after rendering;
- Fallen continuity and identity locks can bind spatial assets and performances;
- Shot Tournament can judge camera/lighting/render candidates instead of only generated video clips;
- Saban can fan out modeling, lighting, animation, layout, simulation and QA work against one scene version;
- World State, TOWI, FAIE and Evermaps can become real spatial layers rather than flat cards;
- the same scene can produce film shots, product visuals, simulations, interactive worlds and data-driven explainers.

## V1 kernel

`world-forge.ts` establishes the canonical project schema `evercraft.fallen.world-forge-project.v1`.

The first kernel includes:

- scene hierarchy and parent/child cycle detection;
- mesh, curve, text, volume, camera, light, armature, empty, media-surface and particle-emitter node classes;
- metric world units and full 3D transforms;
- primitive, asset-backed and procedural geometry sources;
- non-destructive modifier stacks;
- PBR materials and texture bindings;
- procedural node graphs for geometry, materials, simulation and compositing;
- keyframed animation channels;
- rigid-body, cloth, soft-body, particle, fluid, smoke and hair simulation domains;
- camera/render intents with ACES or sRGB output policy;
- owned/licensed/public-domain/restricted/unknown rights states;
- observed/licensed/generated/modelled/inferred/unknown evidence states;
- validation and deterministic SHA-256 project digests;
- versioned mutation operations with inverse operations for undo;
- locked-node protection;
- explicit authority requirement for destructive mutations;
- render-plan compilation that fails closed on restricted or uncleared assets;
- no false execution claim before an actual 3D renderer is selected and verified.

## What makes this better for Evercraft

World Forge should beat conventional 3D software on **coherence**, not by recreating every historical menu.

### 1. LLM-native, not LLM-added

A command such as “move the camera two meters left, add a soft key light, make the desk less glossy and animate the world wall waking up over 18 frames” should compile into the same operations a human would create in the UI. The agent never gets a secret destructive back door.

### 2. One world, many outputs

A canonical room, character, product, vehicle, terrain or simulation should be usable by:

- feature-film and episodic production;
- Week in Motion and Journal explainers;
- RIVET/AliEV product storytelling;
- interactive learning;
- virtual production;
- immersive worlds;
- still renders and advertising;
- engineering visualization;
- data-driven geographic/time simulations.

### 3. Provenance is structural

Rights and source state are fields in the project, not paperwork attached after the fact. A render cannot silently consume a restricted or unknown-rights asset.

### 4. Agent collaboration has receipts

Saban and Studio Agent work should become scene operations against an expected version. Each accepted mutation has a before digest, after digest and inverse operation set. Concurrent work can therefore reconcile instead of overwriting the world.

### 5. Continuity becomes spatial

Fallen already protects canon, character identity and voice. World Forge extends that idea into geometry, rooms, props, material identity, camera anchors, lighting grammar and recurring locations.

## Interactive editor

The first browser editor now lives at `/fallen/world-forge`.

It is not a disconnected mockup. The editor fetches a validated starter scene from the World Forge HTTP boundary and submits every scene change through the same `applyWorldForgeOperations()` contract used by CLI and agent workflows.

The first editor slice includes:

- WebGL2 GPU viewport;
- orbit and zoom navigation;
- viewport object picking;
- scene outliner;
- transform inspector for position, rotation and scale;
- bounded axis nudges;
- add-object operations;
- canonical locked environment objects;
- server-side version conflict and scene validation;
- visible project version and digest;
- mutation receipt history;
- undo driven by receipt inverse operations;
- explicit publication-authority-off status.

This establishes the critical invariant: a human edit and a future natural-language/agent edit use the same scene mutation language.

## Viewport manipulation

World Forge now has direct viewport transform tooling rather than relying only on inspector fields and command text.

- the selected object renders X/Y/Z translation handles in world space;
- pointer hit-testing uses the authored viewport projection, not fixed screen buttons;
- dragging is projected back onto the selected world axis;
- movement snaps through deterministic grid increments from 0.01 m to 1 m;
- the viewport previews the snapped transform during drag;
- release emits one typed `set_transform` mutation instead of a stream of partial writes;
- when Stage mode is active, gizmo moves join the staged ChangeSet rather than mutating the canonical world;
- staged transform state is reflected back into the viewport before commit.

The viewport also supports **Frame Selected** and **Camera View**. Camera View is driven by the authored World Forge camera component, including perspective focal length/sensor geometry or orthographic scale, rather than a disconnected editor-only camera.

## Modeling kernel

World Forge now has explicit editable-mesh topology with deterministic validation and receipt-backed edit operations.

Current edit-mode capabilities include:

- cube primitive → editable vertices/faces;
- face extrusion with connected cap and side-wall topology;
- face inset with a connected inner cap and ring;
- selected-vertex movement;
- explicit-authority face deletion;
- explicit-authority vertex welding;
- finite-vertex, invalid-index, duplicate-face-index and degenerate-face validation;
- boundary-edge, orphan-vertex and non-manifold-edge accounting;
- core protection against topology shrink through raw `set_geometry` operations without destructive authority;
- receipt-generated inverse geometry operations with explicit undo authority;
- WebGL rendering of the actual edited topology;
- deterministic command grammar for `make editable`, `extrude face <index> by <distance>`, `inset face <index> by <amount>`, and `move vertices <ids...> by <dx> <dy> <dz>`.

Destructive weld/delete commands remain unavailable through the command bar. They require an explicit destructive UI or workflow authority path.

This establishes the edit-mode architecture for loop cut, bridge, knife, bevel, proportional editing and sculpt/retopology work.

## Owned native preview renderers

World Forge now has two render paths owned by the Studio rather than a provider.

### `evercraft-native-wireframe-v1`

Deterministically projects canonical 3D geometry and editable mesh topology through the authored World Forge camera into SVG. It is useful for topology, blocking and camera verification.

### `evercraft-native-solid-v1`

Projects filled scene faces, applies authored material base color, evaluates basic scene-light diffuse contribution, performs back-face culling and camera-depth ordering, and emits a digest-bound SVG render receipt.

Both renderers are intentionally **preview-only**. They refuse production render intents and unsupported geometry instead of pretending those features rendered correctly. Neither renderer grants production-render or publication authority.

The editor exposes separate **Wireframe** and **Solid Render** controls. This is the first owned renderer ladder, not a claim that World Forge has reached final offline-render quality.

## Atomic ChangeSets

World Forge now supports digest-bound multi-operation ChangeSets for human and agent collaboration.

A ChangeSet records the target project ID, base version, base world digest, author identity, explicit destructive authority state, ordered operations and its own tamper-evident digest. Application is atomic:

- the project ID must match;
- the project version must match;
- the base world digest must match;
- the ChangeSet digest must verify;
- destructive operations require explicit ChangeSet authority;
- every operation must pass normal World Forge mutation validation;
- if any operation fails, none of the batch is committed;
- an accepted batch produces one project version and one normal mutation receipt.

The browser editor exposes **Stage mode**. Natural-language edits can be queued, bound to the current world version/digest, then applied as one ChangeSet. This is the first collaboration primitive for Saban/human concurrent scene work without last-write-wins corruption.

CLI and HTTP surfaces support separate ChangeSet creation and application so proposals can be reviewed before execution.

### Safe concurrent rebasing

ChangeSets now fingerprint the scene nodes they actually depend on. This allows World Forge to distinguish a globally stale world from a true resource conflict.

A stale ChangeSet may be explicitly rebased only when every touched resource still matches its original fingerprint:

- edits to unrelated nodes may rebase safely;
- edits to a touched node block with a node-level conflict;
- concurrent creation of the same node ID blocks;
- destructive authority is preserved, never upgraded during rebase;
- rebase records parent ChangeSet digest and prior world version/digest;
- the rebased ChangeSet receives a new digest before it can be applied.

This lets human modeling, agent lighting, camera and layout work proceed concurrently without relying on last-write-wins behavior.

## World Engine runtime bridge

World Forge now compiles committed authored scenes into Evercraft World Engine instead of inventing a parallel runtime.

The bridge produces:

- a validated `evercraft.world-engine.world.v1` definition;
- a rights/provenance-aware World Engine asset manifest;
- concrete `evercraft.world-engine.geometry.v1` triangle assets for supported World Forge primitives and editable meshes;
- deterministic node → entity, material → material and asset → asset identity maps;
- an explicit right-handed Z-up → right-handed Y-up coordinate conversion receipt;
- camera projection conversion, including perspective focal length/sensor math and orthographic height;
- World Forge look-at cameras converted into World Engine transform orientation;
- light conversion with explicit warnings where the runtime model differs;
- a digest-bound bridge receipt with runtime readiness, WebGPU readiness and visual-parity classification.

The bridge does **not** silently discard semantics. Parent hierarchies require explicit flattening, general object-animation and World Forge simulation domains fail closed until dedicated mappings exist, procedural geometry requires a bake, external geometry needs a real content digest, and licensed assets require license lineage.

Current area lights are explicitly approximated as point lights because World Engine does not yet have an area-light component. Modifier stacks are also called out as not baked in this first bridge. These conditions reduce visual parity rather than being hidden.

The browser editor exposes **Engine Bridge** only for committed canonical state. If a Stage-mode ChangeSet is pending, runtime compilation is blocked until the proposal is applied or cleared.

## Live World Engine synchronization

Once a committed World Forge scene has been compiled through **Engine Bridge**, later authoring changes can stay synchronized with World Engine incrementally instead of requiring full runtime replacement.

The sync path:

1. validates and applies the Forge ChangeSet against the exact authored base;
2. compiles the Forge world before and after the ChangeSet;
3. verifies the supplied World Engine world and asset manifest are semantically identical to the expected Forge base;
4. derives a World Engine edit transaction from the semantic difference;
5. applies that transaction through World Engine's canonical live-authoring contract;
6. verifies the resulting runtime world and asset manifest are semantically identical to the newly compiled Forge world;
7. updates concrete GPU geometry assets through World Engine geometry hot-reload receipts;
8. emits one cross-system sync receipt binding the Forge ChangeSet, Forge mutation receipt, World Engine edit receipt and geometry refresh state.

Transform-only edits compile to World Engine `set_transform` operations and do not churn unchanged geometry assets. Geometry edits materialize new triangle assets and update the affected runtime entity atomically.

When Engine Bridge is active in the browser editor, normal edits, gizmos, commands, Add Cube, Stage batches and Undo all use this synchronized path. A runtime semantic mismatch fails closed instead of overwriting drifted runtime state.

## Play Mode

World Forge now has a bounded stateful Play Mode backed by Evercraft World Engine.

A Play session owns:

- the committed World Forge project revision;
- the compiled World Engine definition and bridge receipt;
- the deterministic World Engine runtime snapshot;
- the runtime geometry cache;
- runtime tick/time;
- explicit runtime/WebGPU/parity status.

The first server implementation is intentionally ephemeral. Sessions are capped, TTL-bound and held in process memory rather than pretending to be durable distributed runtime infrastructure. This keeps the contract honest while the experience is proven.

### Runtime flow

1. **Play** compiles the committed Forge scene and starts a World Engine runtime at tick 0.
2. **Step** advances the deterministic runtime by an explicit number of ticks and accepts only tick-bound inputs inside that requested window.
3. Normal Forge edits still pass through canonical mutation/ChangeSet rules.
4. While Play is active, an accepted authored revision is migrated into the running session before the editor adopts it.
5. The v9 live-sync path verifies world semantics, asset semantics, geometry cache state and runtime snapshot lineage.
6. The migrated World Engine runtime continues from the preserved tick.
7. **Stop** destroys the ephemeral session.

Stage Mode remains compatible with Play Mode. Staged edits affect the editor preview only. The running world remains on the committed revision until **Apply Batch** succeeds, at which point the single committed revision is live-synced into the session.

Import and Reset stop the active Play session before replacing canonical project state. The static **Engine Bridge** mode remains separate and cannot replace the stateful Play session while Play is active.

### Runtime viewport projection

Play Mode projects the running World Engine snapshot back into Forge coordinates for viewport display without mutating canonical authoring state.

The projection:

- uses the bridge's canonical node → entity identity map;
- converts World Engine Y-up transforms back into World Forge Z-up;
- round-trips translation, Euler rotation and scale through the explicit coordinate basis;
- carries the source snapshot digest, tick, world version and project version;
- is marked `canonicalAuthoringMutation:false`.

When Play Mode is running and Stage Mode is off, the viewport displays runtime transforms and labels the surface **RUNTIME VIEW**. When Stage Mode is enabled, the viewport deliberately switches to **AUTHORING PREVIEW** so proposed edits can be inspected without pretending they have affected the running simulation.

Runtime projection never writes simulation movement back into the authored project. Converting runtime state into canon requires a separate explicit authoring operation.

### Server limits

The first session registry is capped at 24 simultaneous sessions with a two-hour inactivity TTL. A single step call is capped at 600 ticks and 1,000 input events. Input IDs must be unique and every input tick must fall inside the requested step window.

Play Mode grants no publication, production-render, payment, or autonomous external-action authority.

## Renderer strategy

The project format must remain independent of any one renderer.

The renderer ladder should be:

1. **Native interactive viewport** using a local/browser GPU path for editing and layout.
2. **Native production renderer** for deterministic high-quality output and distributed workers.
3. **Compatibility bridge** for standard interchange formats and mature offline tools where that accelerates production without making them the product boundary.

The V1 render plan intentionally remains non-executable until a backend is selected and verified. Declaring a renderer is not the same as proving one.

## Next build slices

### Spatial runtime

- GPU viewport with mesh buffers, depth, PBR materials, lights and shadows.
- object picking, transform gizmos, snapping, local/world coordinates and collections.
- camera view, focal controls, safe frames and depth of field.
- persistent autosave/version snapshots.

### Modeling

- edit-mode vertex/edge/face operations;
- extrude, inset, loop cut, bridge, knife, weld and proportional editing;
- sculpt brushes, voxel remesh and retopology;
- curves, text and procedural instancing;
- UV unwrap and texture painting.

### Procedural / simulation

- visual node editor backed by the existing graph contract;
- geometry-node execution;
- rigid body and cloth first, then particles/fluids/hair;
- cache/bake receipts bound to scene digest and deterministic seeds where possible.

### Character / animation

- armature creation and skinning;
- IK/FK, constraints and retargeting;
- pose library and reusable motion assets;
- facial controls and performance binding;
- NLA-style reusable animation clips.

### Film integration

- camera shots become Fallen cinematic shot contracts;
- alternate lighting/camera/render candidates enter Shot Tournament;
- selected shots drop into the non-destructive Fallen timeline;
- render receipts preserve scene/project/version/camera/material lineage;
- final masters remain subject to existing Production Grade, Master QC and Clip gates.

### World integration

- upgrade Evercraft HQ from 2.5D set plates to authored 3D rooms;
- import the existing room transition graph as navigable spatial adjacency;
- attach World State and Journal/TOWI/FAIE layers to real world-space surfaces;
- support persistent worlds for The Watcher's Mask and the Ember Fox and future immersive properties.

## Non-negotiables

- No Base44 runtime dependency.
- No provider becomes the canonical project format.
- No silent destructive agent edits.
- No synthetic or modelled asset is mislabeled as observed.
- Missing rights are not treated as permission.
- Render completion does not grant publication authority.
- A pretty render cannot bypass continuity, provenance or Shot Tournament rules.
