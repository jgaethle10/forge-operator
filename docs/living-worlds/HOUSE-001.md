# Living Worlds | House 001

**Status:** Source prototype on a draft PR. Not a deployed product. Rules-only browser operation works without a model. An **optional loopback-only local llama-server inference adapter** is now implemented in source, but a real model connection, native-browser QA and production release have not been demonstrated. No shared world server, 24/7 simulation, multiuser sync or production model costs.

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
- tests/living-worlds-engine-bridge.test.mjs - stable identity, geometry positioning and schema contract regression tests.
- systemia/living-worlds/local-llm-preview.mjs - owner-run local preview with optional llama-server adapter.
- tests/living-worlds-model-gate.test.mjs - proposal and local gateway security tests.

## World Engine scene export

Select **3D scene data** in the House 001 interface to download `evercraft-house-001-world-engine-scene.json`. The adapter uses the exact `evercraft.world-engine.world.v1` schema name, stable `resident:<id>` and `furniture:<id>` entities, 1-meter grid spacing on X/Z, bounded box colliders for furniture, and explicit `projectionOnly=true`/`productionAuthoritative=false` metadata. This is compatible scene-shaped data for further integration. **It is not a running World Engine simulation, a geometry asset, a hosted 3D world, or authoritative navigation/physics.** Native World Engine runtime validation and renderer integration remain gated.

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
