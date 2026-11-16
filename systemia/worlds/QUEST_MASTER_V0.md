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
