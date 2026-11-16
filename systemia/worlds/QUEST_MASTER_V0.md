# Evercraft Worlds · Quest Master v0 (owned prototype)

**Release status: development branch, not activated on the public Worlds host.**

This is a real, bounded vertical slice on the existing Mossmere 3D browser scene:
**story seed -> deterministic quest proposal -> exact scene preview -> player approval -> local world edits -> receipt.**

## What exists

- World Builder and reactive Pip, Momo and Lumi from existing `public/worlds/`.
- `public/worlds/quest-master.mjs`: Node-testable data-only proposal validator and executor.
- In-game **Quest Master** panel. Select a garden, workshop or stargazing story. Preview the exact actions before approving.
- Place only an allowlisted object at bounded coordinates, or change the sky. Uses the same `applyCommand` path as manual World Builder edits.
- Approval tied to the current local world revision; stale previews fail closed.
- Atomic-in-memory execution: all steps are simulated on a cloned scene; the caller receives the final scene only when all steps pass.
- Receipt lists each action, its resulting scene revision, and the scope `applied_to_local_scene_only`. No tokens, conversations, player coordinates or account data in the receipt.
- Shared-world visitors **cannot** execute quests until they choose **Save copy**. No changes are sent to the public vault automatically.

## What does NOT exist yet

- No live generative model, Claude integration, Minecraft commands, quest-tracking objectives, remote agents, shared multiplayer state or autonomous NPC decision-making.
- No read/write access to player inventories, game-server consoles, personal accounts, network resources or filesystem shell commands.
- No AI action may mutate the separate vault without the world's edit capability and explicit consent; v0 does not call that vault at all.
- This branch does not install services, open network ports, update DNS, modify Caddy, or deploy to Node001/Node002.
- An authored quest is *not* evidence of an independent AI character. The existing residents still run deterministic local routines.

## Validation

```bash
node --test tests/worlds-quest-master.test.mjs
node --check public/worlds/quest-master.mjs
node --check public/worlds/app.mjs
```

Manual browser acceptance: launch the existing local Worlds page. Enter Mossmere, choose **Quest Master**, preview **garden**, approve, and confirm a flower appears and the sky changes to sunset. Use an unlisted shared-world visitor link and confirm **Approve and play** cannot mutate the visitor view. Change the world after preview to force revision conflict, then preview again. Check mobile layout and ensure no console errors.

## Next integration gate

Wire an Evercraft-owned model planner to *suggest* the exact `evercraft.worlds.quest-proposal.v1` JSON schema. Treat model output as untrusted and validate it with `validateQuestProposal`, then keep the same player preview/approval/revision gate. Models receive only minimal allowlisted scene context and have no direct game-console, vault, shell or payment authority.

Any server-backed persistent quest state, real multiplayer, inventory mutations, agent/tool dispatch, monetization or child-account controls require separate designed authorization, identity, abuse, privacy and real-device acceptance.


---

## Quest Master v1: private owned-model proposal path

**Status:** Source integration only. A working NextGen llama.cpp process has **not** been independently observed from CI or this development environment. No public model API was enabled, no game world changed remotely, and no independent youth-safety review has occurred.

This iteration adds a bounded, actual-model path without connecting a public browser to any local inference port:

1. On the *same computer that runs an owned loopback llama-server*, check the model is present and is operator-approved. The existing classroom adapter validates `GET /v1/models` first and only accepts a loopback origin.
2. Run an **explicit** operator command that requests one model-proposed JSON quest, validates its output, and writes an owner-only `0600` file. The CLI makes **no** changes to any world.
3. Use the Worlds **Quest Master → Import an AI quest JSON** file picker, review every action, and click **Approve and play quest** to apply the allowed changes locally. The JSON file never uploads to the vault.
4. Story proposals remain untrusted regardless of their source. Validation and scene-capacity/revision checks run again in the browser, and shared-world visitors remain read-only.

### NextGen example (operator-owned, adult-supervised test)

```bash
# On NextGen, in the updated Evercraft repository checkout:
node scripts/worlds-nextgen-quest.mjs --execute \
  --llama-origin http://127.0.0.1:8080 \
  --theme "A secret lantern garden" \
  --output "$HOME/evercraft-worlds-quest.json"
```

The output filename must be an **absolute .json path** that does not already exist. If the model is unavailable, the result is a held error. The script never falls back to a cloud model or third-party host. To create another proposal, choose another output file. **Do not expose or port-forward** the local llama-server. Running the command on Penguin cannot reach a llama-server bound only to NextGen's loopback.

### Technical boundaries

- `systemia/worlds/quest-model-planner.mjs` constructs a compact story prompt using only the world sky and number of scene objects. It does **not** pass player coordinates, identity, NPC memories, edit capabilities or conversations.
- The model may propose only one JSON object of schema `evercraft.worlds.quest-proposal.v1`. A single JSON code fence is tolerated; prose, malformed JSON, unsupported keys, new verbs and out-of-bounds coordinates are rejected.
- The preflight calls `previewQuest` against an initial scene. The browser repeats `previewQuest` on the **actual local scene**, so proposals that exceed the live scene capacity fail closed.
- `makeLocalLlamaTutor` reuses the already-built local NextGen adapter and validates model metadata before inference. An API response does not independently establish model executable identity, runtime attestation, output quality, safety, or actual NextGen operation.
- No public-world inference endpoint, browser-to-localhost connection, tool-calling agent, live NPC narration, server console commands, loot, inventory modification, player accounts, multiplayer authority or automated publish path is activated.
- A generated JSON file is content, not an attested receipt. The CLI receipt has model-name and proposal hashes and states `executed:false`, `deployed:false`, `model_process_attested:false`, `story_safety_certified:false`.
- Imported stories may include invented or inappropriate narrative. This is an **operator-reviewed prototype**, not approved for unsupervised children.

### Source verification

```bash
node --check systemia/worlds/quest-model-planner.mjs
node --check scripts/worlds-nextgen-quest.mjs
node --test tests/worlds-quest-master.test.mjs tests/worlds-quest-model-planner.test.mjs
```

Next release gate: operator-controlled actual NextGen model canary on the intended host, browser import/play acceptance on an actual device, child-safe narrative/quality review, and independent audit receipts before any promise of 'living AI residents' or public AI functionality. No Base44 or external hosted model may be used.
