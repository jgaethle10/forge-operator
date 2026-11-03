# Living Worlds | House 001

**Status:** Source prototype on a feature branch. Not a deployed product. No connected LLM, shared world server, live 24/7 simulation, multiuser sync or production model costs.

## What you can actually do

- Watch **four deterministic simulated residents** move through a nine-by-six-tile house; each has needs, moods, goals, relationships and short-term event memories.
- Build and remove furniture by tapping tiles; refrigerators, beds, sofas, desks, plants and tables influence what residents choose to do. An empty house produces a visible no-available-actions state instead of inventing actions.
- Inspect residents and read their actions, energy, hunger, social needs, mood, coins, strongest bond and recent memories.
- Pause, resume, accelerate simulation, send gifts, host a party, reset and export a JSON snapshot.
- State is persisted in the *same device's browser* using localStorage with a bounded schema validator. Snapshots are not shared between users or uploaded to a server.

## Run

From the repo root:

    python3 -m http.server 8766 -d public

Open http://127.0.0.1:8766/living-worlds/ in a desktop or mobile browser.

Test the headless deterministic core:

    node --test tests/living-worlds-house.test.mjs

No npm dependencies, API credentials, external hosted assets or provider-specific inference SDK are needed for this prototype. Browser tests, real-device tests, build integration and production deployment still need verification.

## Source

- public/living-worlds/house-core.mjs - bounded synthetic world state, action planning, furniture edits, events, interventions and saved-state validation.
- public/living-worlds/app.mjs - browser-local scheduler, accessible grid controls, spectator UI, local save and JSON export.
- public/living-worlds/index.html - responsive 2D house plan, no separate 3D renderer.
- tests/living-worlds-house.test.mjs - deterministic model and safety tests.

## Architecture connection and honest boundaries

**This is the temporary house-simulation interaction slice**, not a new canonical world runtime or 3D engine.

The existing **Evercraft Worlds** under public/worlds/ owns the playable WebGL scene and browser world-edit experience; systemia/world-engine/ owns canonical physics, navigation, authoritative ticking, replay, and edit receipts. **The Window** (public/the-window/ and systemia/society/) owns an existing simulated town/social-event projection; do not label its deterministic characters as LLM agents. Draft PR #1839 explores a fictional mystery game in that existing viewer; it is separate from House 001.

Follow-up integration order:

1. Make World Engine entities and validated Studio edits authoritative for house floorplan, object identity and agent movement. Do not maintain a competing physics stack.
2. Map local House 001 actor traits, bonds, memories, actions and events to versioned Society/Window contracts, without mutating the existing public town or production business systems.
3. Add an **optional owned server inference planner**, behind per-house session identity, isolation, rate limiting, cost ceilings, cancellation and human-readable receipts. Give LLMs an *action proposal* role, not direct scene mutation or arbitrary filesystem/network access.
4. Validate proposals through a strict allowlist: move to known object, interact, talk to visible nearby agent, rest, work on in-world task. Missing target, nonresident ID, unsupported commands or malformed JSON fail closed. System determinism, persistence, permissions and replay remain governed by World Engine.
5. Add opt-in spectator interventions, abuse throttling and dedicated audience events. Clearly distinguish scripted world events, model decisions, and human votes in public event logs.
6. Build 3D interior assets and interactive house construction through the existing Worlds renderer, then check native phone GPU, performance, motion controls, persistence, security and accessibility.
7. Only after explicit Systemia admission and verified owned hosting: durable server clock, multiplayer spectator sessions, authenticated building permissions, private world boundaries and deployment receipts.

## Product framing

House 001 tests one central question: **Will the inhabitants respond visibly and believably to objects the audience adds, removes or changes?** It does not yet answer the harder LLM autonomy question. The first public claim must reflect the actual deployed capabilities.

No Base44, third-party hosting handoff, automated posting, real-world customer data, payments, or production changes are included in this branch.
