# Evercraft | Living Worlds: The Missing Blueprint

**Owner:** Systemia / AI Society / Worlds. **Lane:** The Window. **State:** draft source prototype with browser-side 3D interaction, not released or autonomous LLM execution.

## Intent
Keep one canonical Evercraft world. Link existing Mossmere identities, relationships and memories with watchable social-deduction stories; eventually project them into the existing 3D Evercraft Worlds renderer, not a second game engine. This is an original fictional mystery, with no reuse of Among Us characters, artwork, maps, proprietary rules or naming.

## Implemented in this branch
- `public/the-window/mystery.mjs`: deterministic, seeded case projection from four existing Mossmere residents. Four source-labeled clues, a fallible fictional witness, evidence-weight scores, restricted accusation and replay.
- `public/the-window/mystery-ui.mjs`: optional playable evidence board mounted below the existing Window spectator. Native accessible buttons/select, phone-friendly layout and textual result.
- `tests/window-mystery.test.mjs`: replay, clue bounds, no world mutation, clue-weight gating, answer variation, invalid input.
- `public/worlds/mystery-bridge.mjs`: evidence stations projected as non-authoritative scene entities with matching world coordinates, source labels and a proximity gate.
- `public/worlds/mystery-walk.mjs` + existing `public/worlds/app.mjs`: optional Mystery Walk launch, one glowing evidence beacon at a time, E/tap proximity inspection, clue journal and accusation UI. Reuses the existing WebGL draw loop without creating another renderer.
- `tests/worlds-mystery-bridge.test.mjs`: marker bounds, world isolation, progression and invalid input coverage. Existing browser conformance now checks mystery sheet on desktop, phone and small-phone emulation.
- The canonical World Engine and underlying world persistence remain unmodified. No added network service, local AI process or server persistence.

## Authority and disclosure
- **Systemia-first:** source-only experiment pending canonical mission admission, Passport and execution receipts. No Saban dispatch or production permission change.
- **Simulation honesty:** a local deterministic scenario, not independently reasoning agents. Statements and inventory records are generated fictional fixtures. Scores are not probability of guilt and the answer does not establish motive.
- **Privacy and persistence:** all in browser; refresh resets the case. No changes to resident history, player identity, public chronicle, payments or live game state. Existing automatic world player-location saving remains independent.
- **3D markers:** proximity inspection is an optional local scene projection. It is not proof that twelve autonomous Window residents are inhabiting the three-character Worlds demo.
- **Single-engine rule:** `systemia/world-engine/` is the authoritative spatial target; `public/worlds/world-bridge.mjs` is the planned projection adapter. This prototype adds no renderer, forked physics or new world service.

## Testing and progression
`node --test tests/window-mystery.test.mjs tests/worlds-mystery-bridge.test.mjs` from repository root. Serve `public` locally and visit `/the-window/` for the spectator board or `/worlds/` for the 3D Mystery Walk. The case must be launched explicitly in each interface. The tests run in GitHub workflows on this branch; inspect the PR checks before marking them green.

Next proof gates:
1. GitHub CI on this branch and actual physical-phone browser checks. CI emulation alone does not prove native GPU performance.
2. Systemia-admitted bounded social-event schema: evidence and testimony provenance, memory/relationship consequences, refusal and error cases, replay IDs.
3. Move the non-authoritative evidence-station adapter behind the canonical World Engine's admitted scene/event authority. The current per-browser cases are separate; a shared clock and persistent server truth do not exist yet.
4. Authorized LLM workers with actual durable decisions, bounded memory, independent action receipts, and explicit rule-vs-model labels. Do not advertise autonomy without evidence.
5. Owned hosted/public preview verification before launch.
