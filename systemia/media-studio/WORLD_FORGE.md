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
