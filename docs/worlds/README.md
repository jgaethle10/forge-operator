# Evercraft Worlds · Mosslight Alpha 01

A **real, independently authored WebGL2 world**, not a panorama or generated screenshot. Explore an original miniature studio, pond, plants, portals, aquarium and animated characters. Use the text command box to add objects or change lighting, move/recolor/remove placed objects, and save on your device.

## Open the world

**One-file version:** open `mosslight-standalone.html` in a modern WebGL2 browser. No dependencies, downloads, account, network, or build tools required. Recommended test browser: Chrome/Edge/Safari with WebGL2.

**Modular version:** run `python3 -m http.server 8000 --directory public` from this directory and visit `http://localhost:8000/worlds/`. Alternatively host the `public/worlds/` folder on any static HTTPS server.

- Desktop: WASD to walk, click-and-drag to look, click/tap to inspect. Arrow keys turn and walk. Fly mode enables Space/Shift for height.
- Mobile: virtual joystick on the left and drag elsewhere to look. Tap objects/characters to inspect.
- Edits: try **“add purple flowers near the pond”**, **“add a crystal”**, or **“make the sky sunset”**. This is a *bounded deterministic command interpreter*, not generative AI or natural-language world-model inference.
- Save: automatic local `localStorage` persistence; returns to edited world and saved position when reloaded in the *same browser*. Export downloads a JSON scene. Cloud sync and multiuser access are not implemented.

## What's technically working in source

- A complete WebGL2 shader-based 3D raster renderer and authored primitive meshes (no third-party hosted graphics service).
- Original, explorable island environment with furnished studio, aquarium fish, landscape, portal teleportation, sky palettes and foliage.
- First-person camera, keyboard, mouse and mobile touch controls, limited wall/furniture collision, bounded fly mode.
- Click/tap ray-based inspection and bounded object transforms, palette cycling and deletion of user-added objects.
- Three cute residents with deterministic waypoint routines and dialogue snippets. They are **not** hosted AI agents with LLM memory.
- Versioned browser world-state schema, validation, local persistence and JSON export.
- Bounded text-command scene mutations (tree, bench, flower, plant, lamp, rock, table, crystal, lighting).

## Where the authoritative engine lives

The existing GitHub repository `jgaethle10/forge-operator` already contains `systemia/world-engine/` with canonical `evercraft.world-engine.world.v1`, physics, navigation, replay, streamed scenes, replication, render contracts, Node/WebGPU tests and a Saban validation adapter. This alpha **does not pretend to be integrated with it**. Its schema `evercraft.worlds.browser-scene.v1` is a versioned *client-side presentation and edit layer*; the next engineering milestone is a validated server-side bridge that translates transactions into the canonical engine with rights receipts, snapshot persistence, synchronization, and authorized runtime.

## Run tests and measurements

```
node --test tests/state.test.mjs
node tests/benchmark.mjs
```

**Verified:** 7/7 state tests pass in Node 22, 10,000 local state-validation loops and 30,000 deterministic resident positions computed in approximately 34ms in the initial test environment. These are CPU microbenchmarks, **not** browser FPS, load time, graphics performance, true mobile latency or hardware validation. Chromium navigation was blocked in the test environment, so a full browser E2E and screenshot cannot be claimed.

## Licensing and provenance

All code and procedural art for this specific alpha were authored for Evercraft Worlds. No external 3D assets, asset marketplaces, copyrighted Marble imagery, or proprietary world-generation services are used. The underlying GitHub project may have its own licenses and authorizations. Verify ownership and release scope before public commercialization.

## Deployment and scope

`public/worlds/` is a static site. Publishing these files to a static host with HTTPS is sufficient to make the basic client demo available. A server must be provisioned for genuine cross-device persistent worlds, identity, collaboration, agent orchestration or server-side replay. No production deployment, payment integration, authoritative physics migration, multiplayer, XR, image reconstruction, Gaussian splatting or glTF export is claimed in this alpha.