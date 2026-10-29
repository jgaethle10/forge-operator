# Evercraft Worlds · Mossmere V0.1

**Status (2026-10-28):** locally generated source; Node model tests pass; WebGL rendering and touch UX **not yet browser-verified** because this execution environment blocks browser navigation. Not deployed. No production user accounts, network synchronization, generative foundation model or multiuser service is represented.

## What is implemented

- A **real WebGL2 scene**, generated from original procedural geometry with meshes, vertex normals, lighting and fog. Not a panorama or a prerendered image.
- Furnished pavilion, desk, laptop, seating, bookshelves, indoor plants, glass fish tank, fish animation, garden plants, trees, pond, rock rim, portal, cove and three expressive character models.
- Keyboard / pointer navigation, first-person jump and conservative collisions; left-hand touch joystick with right-hand look area.
- Inspect/interact with scripted characters and fixed points of interest; portal navigation.
- Allowlisted text-directed edits: add tree/flower/bench/lamp/rock/mushroom, change sky, remove or clear placed objects. Actual persistent scene mutations, not text overlays.
- Browser-local versioned persistence, save/reload, JSON import/export and a fail-closed scene validator.
- Explicit conversion to `evercraft.world-engine.world.v1` via `world-bridge.mjs` for future integration with existing authoritative runtime.

## Run

From the repository root: `python3 -m http.server 8766 -d public` and open `http://localhost:8766/worlds/` in a WebGL2-capable browser. No build tools or hosted generation APIs are necessary. Source uses no third-party JavaScript libraries. Google Fonts is a **noncritical visual enhancement**; if inaccessible, system fonts render.

Run tests with `node --test tests/world-core.test.mjs tests/world-bridge.test.mjs`; CPU-only microbenchmark with `node tests/benchmark.mjs`.

If merging `public/worlds/` into `forge-operator`, Vite/Express static asset routing must be verified and the path `/worlds/` exposed from owned hosting before announcing a public URL.

## Architecture boundary and existing capability audit

- **Reuse authoritative simulation:** `systemia/world-engine/engine.ts`, `spatial.ts`, `navigation.ts`, `studio-edit.ts`, `replication.ts`, `webgpu.ts` and `saban-adapter.mjs` already implement canonical deterministic world simulation, collision, navigation, edit transactions, replication and shader contracts. The new browser loop is **only a visual/local input projection** for this first demonstrator, **not** their production authoritative execution.
- **Reuse creative world authoring:** `systemia/media-studio/studio-world.ts` and Fallen geometry bridge.
- **Reuse simulated agents carefully:** `public/the-window/world.mjs` has scripted deterministic characters with memories/social relationships. It does not demonstrate live self-directing language agents; here Pip/Momo/Lumi are scripted browser projections only.
- **Reuse geospatial assets:** `systemia/evermaps/` and `systemia/graphics-command/terrain-registry.mjs` for governed geographic terrain later.
- **Reuse orchestration after admission:** Saban's `systemia/world-engine/saban-adapter.mjs` defines engine, physics, WebGPU, edit, migration and provenance reviewer roles. This first local build does not invoke live Saban jobs.
- **No Base44/TinyFish/hosted world-generation dependencies.**

## Release gates (not passed)

1. Run in native Chrome/Safari on two actual mobile devices; record frame times, initial load, graphics adapter, touch input latency, memory and battery/thermals.
2. Renderer screenshot/perceptual QA: camera correctness, fish tank/water transparency, responsive controls and text legibility.
3. Attach server-side durable persistence to canonical World Engine `studio-edit` contract and identity; localStorage cannot share between devices.
4. Bind scripted characters to authoritative navigation/animation and optionally permissioned autonomous agents; demonstrate persisted memory.
5. Use owned asset storage and rights manifests, export real glTF geometry, add WebGPU/GL fallback, authoritative multiuser synchronization and access isolation.
6. Verify production static route and independent public link before representing as deployed.

## Suggested shipping architecture

`Systemia admission → Saban review roles → canonical World Engine simulation + Studio edits → owned persistence and session API → browser render adapter → player controls / Worlds builder`. Scene-state projection is per-user until shared spaces have authorization, version control and abuse limits.

Potential initial commercial lane after gameplay QA: free sample world with local save, paid private cloud worlds and workspace previews. Pricing, checkout, buyer demand and sales are **unverified**.