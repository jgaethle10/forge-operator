# Living Worlds | House 001

**Status:** Draft source PR, not deployed to the public. The rule-based 2D house, optional local LLM proposal bridge and 3D Worlds renderer integration are implemented. The **owned Vault desktop/phone-emulated browser QA and canonical World Engine tests passed** on the earlier 3D commit. The newest owner-operated resident clock and its read-only spectator integration have separate CI gates, and live LLM inference, physical-device QA, production release, secure multiuser synchronization and 24/7 hosting remain unverified.

## What you can actually do

- Watch **four deterministic simulated residents** move through a nine-by-six-tile house; each has needs, moods, goals, relationships and short-term event memories.
- Build and remove furniture by tapping tiles; refrigerators, beds, sofas, desks, plants and tables influence what residents choose to do. An empty house produces a visible no-available-actions state instead of inventing actions.
- Inspect residents and read their actions, energy, hunger, social needs, mood, coins, strongest bond and recent memories.
- Pause, resume, accelerate simulation, send gifts, host a party, reset and export a JSON snapshot.
- Export read-only **World Engine V1 scene data** from the current house. This retains stable furniture/resident entity IDs and projected X/Z positions but does NOT render 3D, validate browser GPU behavior, or make the local browser authoritative.
- State is persisted in the *same device's browser* using localStorage with a bounded schema validator. Snapshots are not shared between users or uploaded to a server.

## Run

From the repo root:

    python3 -m http.server 8766 -d public

Open http://127.0.0.1:8766/living-worlds/ in a desktop or mobile browser.

Test the headless deterministic core:

    node --test tests/living-worlds-house.test.mjs

No npm dependencies, API credentials, external hosted assets or provider-specific inference SDK are needed for this prototype. Browser tests, real-device tests, build integration and production deployment still need verification.

## Opt-in local AI brain (experimental)

By default House 001 runs the deterministic simulation and does not send any model requests. The two new spectator controls are **Ask AI to choose** and **AI autopilot**. Autopilot requests one bounded model choice after every five in-browser simulation ticks. If the gateway or model is unavailable, it turns off and residents continue with the default rules.

To enable optional local inference, start a llama.cpp-compatible llama-server on the **same computer** bound to loopback, typically port 8080. It must support POST /v1/chat/completions and JSON-object responses. Then, from the repository root, start the owned preview server:

    EVERCRAFT_LOCAL_MODEL_PORT=8080 node systemia/living-worlds/local-llm-preview.mjs

Open http://127.0.0.1:8777/living-worlds/ on that same computer. The preview listens ONLY on 127.0.0.1. EVERCRAFT_HOUSE_PORT sets its optional HTTP port; EVERCRAFT_LOCAL_MODEL_PORT sets the local inference port. Neither setting permits an arbitrary remote host. A standalone static file server will continue to run the rules-based game, but its model buttons cannot contact the private inference bridge.

**Controls and restrictions:** Only a context containing the selected resident's bounded needs, location, personality and current object inventory is sent to the local model. Model instructions permit two actions: use a currently placed furniture object or wait one tick. The server validates strict JSON and every target, enforces one active request and a 12-requests/minute limit, and does not expose shell execution or arbitrary network tools. The browser independently checks the returned proposal against an unchanged world snapshot and the core validates it once more before setting a target. Model choices are distinguished from ordinary rule actions in the activity log.

Model claims are permitted only when the operator actually starts the local llama-server and sees successful model-choice receipts in the browser. Unit tests with a mocked model are **not proof** of a live inference session.

Run the extended Node checks:

    node --test tests/living-worlds-house.test.mjs tests/living-worlds-model-gate.test.mjs

No public URL, cloud account, production mutation, autonomous external contact, real-world purchases, or third-party world host is part of this integration.

## Source

- public/living-worlds/house-core.mjs - bounded synthetic world state, action planning, furniture edits, events, interventions and saved-state validation.
- public/living-worlds/app.mjs - browser-local scheduler, accessible grid controls, spectator UI, local save and JSON export.
- public/living-worlds/index.html - responsive 2D house plan, no separate 3D renderer.
- tests/living-worlds-house.test.mjs - deterministic model and safety tests.
- public/living-worlds/agent-proposals.mjs - strict model proposal context and allowlist.
- public/living-worlds/house-world-bridge.mjs - converts House 001 to non-authoritative canonical World Engine V1 scene JSON; excludes resident memories from exported scene data.
- public/living-worlds/house-engine-inputs.mjs - bounded resident movement/metrics tick inputs for canonical engine stepping.
- tests/living-worlds-engine-runtime.test.mjs - actual TypeScript World Engine run, replay and snapshot proof.
- public/worlds/house-visual.mjs - projection of House World Engine entities into existing Worlds primitive draw descriptors.
- public/worlds/house-mode.mjs - local 3D spectator clock and furniture editor controller.
- public/worlds/house-mode.bundle.mjs - generated, reproducible single-file Worlds-local module for owned Vault routing.
- scripts/build-house-worlds-bundle.mjs - owned build/drift check; no runtime package dependency.
- scripts/probe-living-worlds-house-3d.mjs - owned Vault Chromium desktop/phone-emulation visual QA.
- tests/living-worlds-3d-view.test.mjs - renderer contract and local edit tests.
- tests/living-worlds-engine-bridge.test.mjs - stable identity, geometry positioning and schema contract regression tests.
- systemia/living-worlds/local-llm-preview.mjs - owner-run local preview with optional llama-server adapter.
- systemia/living-worlds/house-resident-clock.mjs - owner-operated durable rules clock and atomic private checkpoint.
- tests/living-worlds-resident-clock.test.mjs - unattended progress, restart integrity, bounded catch-up and read-only Vault API proof.
- tests/living-worlds-model-gate.test.mjs - proposal and local gateway security tests.

## World Engine scene export

Select **3D scene data** in the House 001 interface to download `evercraft-house-001-world-engine-scene.json`. The adapter uses the exact `evercraft.world-engine.world.v1` schema name, stable `resident:<id>` and `furniture:<id>` entities, 1-meter grid spacing on X/Z, bounded box colliders for furniture, and explicit `projectionOnly=true`/`productionAuthoritative=false` metadata. This is compatible scene-shaped data for further integration. **The exported JSON itself is not a running engine, geometry asset, or hosted 3D world.** A separate canonical-runtime test now instantiates the real TypeScript World Engine, advances snapshots with bound House tick inputs, and checks replay consistency. Browser rendering, model inference on owned hardware, navigation, multiplayer, and production authority are still unverified.

## Canonical World Engine execution proof

`public/living-worlds/house-engine-inputs.mjs` now creates tick-bound, deterministic `WorldInput` packets for a House state transition. Each packet projects resident movement into `teleport` commands and selected resident metrics into one `set_property` input per resident, with stable IDs and explicit source/engine tick numbers. A furniture layout change fails with `house_engine_world_edit_required`: it must be handled as a versioned World Engine Studio edit/migration, not slipped into an actor tick.

`tests/living-worlds-engine-runtime.test.mjs` imports the **actual** `systemia/world-engine/engine.ts`, validates the world definition, executes successive ticks with inputs, verifies sealed snapshots, deterministic replay and snapshot restoration, and proves model-selected in-world targets are visible without arbitrary tool execution. Run this proof with the repository-installed toolchain:

    node --import tsx --test tests/living-worlds-engine-runtime.test.mjs

The existing browser-only House clock is still a synthetic, local rules simulation. These tests demonstrate compatibility with an owned authoritative engine runtime under test; they **do not** establish that the public page is yet driven by that runtime, that a real LLM is running, that the house is 3D-rendered, or that an always-on shared host exists.

## Owner-run House 001 resident clock (experimental, explicit opt-in)

**Goal:** Preserve synthetic resident autonomy independently of an open browser. The owner-operated Worlds Vault may now run a durable rules-only House 001 clock using private, atomic JSON checkpoints. This is an *optional server process*, not a public, 24/7 deployment or a live LLM agent society.

From the repository root on an owner-operated computer, start the existing owned Worlds Vault with a private data root:

    node systemia/worlds/worlds-vault-runtime.mjs --port 8788 --public-root public --data-root "$HOME/.local/share/evercraft/worlds-vault" --enable-house-001

Then visit the **read-only 3D spectator** on the same computer:

    http://127.0.0.1:8788/worlds/?house=001&clock=resident

The viewer polls `GET /worlds/api/house-001/snapshot` on the same origin, validates the returned House world, and never writes resident data or advances its own clock. The in-scene furniture editor is disabled in this mode. To edit a private browser-only copy instead, use `/worlds/?house=001` without `clock=resident`. These are **separate worlds** and are not synchronized. The URL cannot be used from an iPhone on another network unless a separately admitted, owned HTTPS edge is configured and verified.

The server must be started with `--enable-house-001` or the snapshot API responds 404 and the browser explains that the clock is unavailable. It cannot silently invent another simulation. The world starts from a deterministic four-resident seed and progresses in the running process at a nominal 1.2 seconds per House tick. If the service stops, it **does not run during downtime**; its next start resumes its private checkpoint and catches up missing simulated ticks in bounded batches. Each checkpoint stores the exact world and SHA-256 integrity digest under the private Vault data root, with atomic replacement. An invalid/corrupt checkpoint refuses startup instead of resetting resident history.

**Permissions:** No remote mutations, guest editing, public publishing, external network actions, real payments or LLM calls are admitted through this path. This is deliberately a public-data-only synthetic simulation behind a loopback-bound owned service. It does not inherit user permissions or agent access to external tools. A proper production admission, persistence and session boundary is still necessary before any internet exposure or third-party participation.

Tests:

    node --test tests/living-worlds-resident-clock.test.mjs tests/living-worlds-3d-view.test.mjs

The extended browser proof checks that a viewer can close while the server clock continues, then rejoin the same world later. Playwright phone emulation is not a physical iPhone test.

## Original Worlds WebGL2 spectator and builder preview

House 001 has an **opt-in 3D cutaway preview**, built on the existing original Evercraft Worlds WebGL2 scene renderer and its existing character primitive drawing path. It does **not** create another graphics engine. The generated house scene visualizes the canonical World Engine V1 floor/furniture/resident positions using room-colored floors, low partition walls, original procedural furniture meshes and four scaled character models. The animation clock remains the browser-local House rules simulator; this is **not yet a remotely hosted authoritative TypeScript engine session or an LLM-driven society**.

From a repository root server that serves all of `public`, open `http://127.0.0.1:8766/worlds/?house=001`. Choose **Enter House 001**, then use WASD or the phone joystick to explore, drag/touch to look around, and press **V** to change the camera height. Press **B**, or select **Edit House 001**, to open the in-world furniture editor. Choose a piece of furniture and tap a 9×6 tile. The local builder rules validate the edit and immediately update the view. Source saves persist in the current browser's localStorage, including when returning to the original 2D House editor on the same origin.

For the existing owned Worlds Vault service, the route is also `/worlds/?house=001`. The owned Vault intentionally only serves `/worlds/`, so the 3D spectator is delivered as a generated **Worlds-local, standalone module** and includes its own in-scene editor. It does not require `/living-worlds/` to be publicly exposed.

    node scripts/build-house-worlds-bundle.mjs
    node scripts/build-house-worlds-bundle.mjs --check

The generator reads the exact House core, World Engine scene bridge, Worlds visual adapter, and spectator controller from their canonical source paths. CI verifies byte-for-byte synchronization. No separate inference SDK, graphics renderer, data host, or third-party runtime is needed for the 3D viewer.

Browser QA runs through the **actual owned Worlds Vault**, not merely Python static serving, and requires WebGL2 frame submissions, a local simulation tick, valid local save, successful furniture editing, no page errors, and desktop/phone-emulated screenshots. Its synthetic proof command is:

    node scripts/probe-living-worlds-house-3d.mjs

This command needs the same local Playwright/Chromium test dependencies already used by Evercraft Worlds browser QA. A software-rendered Chromium run is not a physical iPhone or production GPU proof. No public deployment, remote continuous simulation, native device benchmark, or production revenue is claimed.

## Architecture connection and honest boundaries

**This is the temporary house-simulation interaction slice**, not a new canonical world runtime or 3D engine.

The existing **Evercraft Worlds** under public/worlds/ owns the playable WebGL scene and browser world-edit experience; systemia/world-engine/ owns canonical physics, navigation, authoritative ticking, replay, and edit receipts. **The Window** (public/the-window/ and systemia/society/) owns an existing simulated town/social-event projection; do not label its deterministic characters as LLM agents. Draft PR #1839 explores a fictional mystery game in that existing viewer; it is separate from House 001.

Follow-up integration order:

1. Make World Engine entities and validated Studio edits authoritative for house floorplan, object identity and agent movement. Do not maintain a competing physics stack.
2. Map local House 001 actor traits, bonds, memories, actions and events to versioned Society/Window contracts, without mutating the existing public town or production business systems.
3. Promote the **implemented local-only experimental inference bridge** to a properly admitted owned server inference planner, with per-house identity, multiuser isolation, durable budgets, cancellation and receipts. The source preview enforces a local request cap but is not a production service.
4. Extend the initial **use-known-object or wait** proposal allowlist to richer grounded actions such as interaction and nearby conversation, and migrate those operations to canonical World Engine authority. Unsupported commands and malformed JSON must continue failing closed.
5. Add opt-in spectator interventions, abuse throttling and dedicated audience events. Clearly distinguish scripted world events, model decisions, and human votes in public event logs.
6. Build 3D interior assets and interactive house construction through the existing Worlds renderer, then check native phone GPU, performance, motion controls, persistence, security and accessibility.
7. Only after explicit Systemia admission and verified owned hosting: durable server clock, multiplayer spectator sessions, authenticated building permissions, private world boundaries and deployment receipts.

## Product framing

House 001 tests one central question: **Will the inhabitants respond visibly and believably to objects the audience adds, removes or changes?** It does not yet answer the harder LLM autonomy question. The first public claim must reflect the actual deployed capabilities.

No Base44, third-party hosting handoff, automated posting, real-world customer data, payments, or production changes are included in this branch.
