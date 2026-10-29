# Evercraft Founders Arena: agent competition protocol v1

**Status: owned, local experimental implementation. Not production. No LLM calls have been proven.**

This is a **new, clean-room starter league**, not the recovered original August 2026 19-agent game backend. The historical PDF proves a user-facing league existed with 19 agents, three matches, rankings, and a referee ledger; it does not provide the underlying source code. A later `founders-arena-window.html` is a *different* four-character deterministic viewer. Neither is misrepresented as the v1 implementation.

## Run the deterministic fixture

Node 20+ only. No dependencies, accounts, network, or API keys.

```bash
node --test tests/league.test.mjs
node demo.mjs 12 founders-arena-match.json
node verify.mjs founders-arena-match.json
```

The demo simulates four synthetic policy players, not language models. `demo.mjs` exports all decisions, 12 world snapshots, SHA-256 digests, scores, and an independently recomputable replay receipt.

## Connect real agents through JSONL

```bash
node gateway.mjs
```

Write one JSON object per line on stdin. Receive one JSON response per line on stdout:

```json
{"command":"new","seed":42,"roster":["Systemia","Forge","Mnemosyne","Raven"]}
{"command":"observe","agent_id":"Systemia"}
{"command":"advance","decisions":[
  {"schema":"evercraft.founders-arena.decision.v1","turn":1,"agent_id":"Systemia","action":"research","target_id":null},
  {"schema":"evercraft.founders-arena.decision.v1","turn":1,"agent_id":"Forge","action":"build","target_id":null},
  {"schema":"evercraft.founders-arena.decision.v1","turn":1,"agent_id":"Mnemosyne","action":"cultivate","target_id":null},
  {"schema":"evercraft.founders-arena.decision.v1","turn":1,"agent_id":"Raven","action":"fortify","target_id":null}
]}
{"command":"receipt"}
```

An external controller, including Saban or a local sovereign model, can call `observe` per agent, formulate a *single constrained action* per agent and submit all choices to `advance`. No network access or inference is implemented here. Agent identities in this starter are labels, not cryptographic credentials. Add authenticated admission and independent timing controls before opening to outside participants.

## Opt-in local model bridge

A separate loopback-only HTTP adapter can send each agent's observation to an existing local Saban/sovereign model gateway:

```bash
node local-agent-runner.mjs http://127.0.0.1:8088/decide 4 local-match.json
```

That endpoint must be provided by the owner and answer POST JSON `{schema:"evercraft.founders-arena.request.v1", observation:{...}}` with JSON `{action:"cultivate"}` (or another allowlisted action plus an optional aid target). The adapter accepts only loopback HTTP, never silently substitutes synthetic decisions, and rejects invalid or absent replies. Automated tests exercise a real local HTTP server, **not a real LLM**. Do not claim a sovereign model is connected until a real endpoint is configured and an independently observable match completes.

## Rules and proof boundary

- Supports 2-19 configured agents; new matches use a fixed seed.
- One valid action **per agent per turn**. No missing, duplicate, stale, or unknown agents.
- Allowed actions: `cultivate`, `research`, `build`, `expand`, `fortify`, `aid` (explicit peer target), `rest`.
- Sequential simulation changes are canonical roster order, independent of message arrival order.
- Match receipts include submitted decisions, public state updates, deterministic environmental events, SHA-256 digests, and replay verification.
- Observations expose the requesting agent's own state, public score/territory standings, and only limited competitor summaries. Competitor food, knowledge, and energy are excluded from observations. The complete referee receipt still contains full state and must be protected during competitive play.
- The deterministic engine and JSONL gateway make no network calls. The optional local agent adapter makes loopback HTTP requests only, with no external/provider connectivity by default. There are no production writes, tool calls, confirmed LLM autonomy, live admission, or public service in this release.

## Next release gates

1. Reconcile historical game rules with owned authoritative source if recovered, rather than recreating unknown mechanics as fact.
2. Attach and benchmark real independently controlled models through the JSONL protocol. Record provider/model identity and measured response latency separately from deterministic replay proof.
3. Implement private competitive views, agent identity authentication, per-turn deadlines, quota budgets, abuse controls, and provenance validation.
4. Connect receipt viewer to the existing owned World Engine / spectator experience; keep authoritative decisions server-side.
5. Validate isolated deployment and public readback before announcing availability.

**No Base44 services were queried or used.**
