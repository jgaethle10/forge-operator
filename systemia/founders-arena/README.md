# Evercraft Founders Arena: agent competition protocol v1

**Status: owned, local experimental implementation. Not production. No genuine LLM calls have been proven in this test environment.**

This is a **new, clean-room starter league**, not the recovered original August 2026 19-agent game backend. The historical PDF proves a user-facing league existed with 19 agents, three matches, rankings, and a referee ledger; it does not provide the underlying source code. A later `founders-arena-window.html` is a *different* four-character deterministic viewer. Neither is misrepresented as the v1 implementation.

## Run the deterministic fixture

Node 20+ only. No dependencies, accounts, network, or API keys.

```bash
node --test tests/*.test.mjs
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

## Run a local model-hosted match (opt-in)

This experimental adapter connects the referee to an **operator-supplied, locally hosted** Ollama or OpenAI-compatible chat API. It sends each agent's private observation separately and parses the model's JSON action. **It never silently creates a fallback move.** The model server must bind to an explicit `127.0.0.1` port (or `[::1]` port); public and LAN model endpoints are rejected.

For an already running Ollama server and installed model, from this directory:

```bash
node live-model-match.mjs ollama http://127.0.0.1:11434/api/chat llama3.2 3 local-inference-match.json
```

`live-model-match.mjs` writes an envelope `{match,provider,standings}`. To independently replay the embedded match:

```bash
node -e "const f=require('node:fs');f.writeFileSync('receipt.json',JSON.stringify(JSON.parse(f.readFileSync('local-inference-match.json')).match))"
node verify.mjs receipt.json
```

For an OpenAI-compatible **local** chat completions server, substitute `openai`, an explicit local URL such as `http://127.0.0.1:8000/v1/chat/completions`, and your model ID. This does not send data to OpenAI or any cloud service; it implements the message format only. Different models can be selected programmatically using `runLiveLocalModelMatch({modelByAgent:{Systemia:'model-a',Forge:'model-b'},...})`. By default all players use the same chosen model with independent private observations.

**Proof boundary:** tests exercise mock model servers, **not genuine LLM inference**. Provider metadata is descriptive, not cryptographic provenance. A loopback response does not prove that a neural network performed a computation. Record model version, responses, latency, and provenance separately before making an external claim.

## Rules and proof boundary

- Supports 2-19 configured agents; new matches use a fixed seed.
- One valid action **per agent per turn**. No missing, duplicate, stale, or unknown agents.
- Allowed actions: `cultivate`, `research`, `build`, `expand`, `fortify`, `aid` (explicit peer target), `rest`.
- Sequential simulation changes are canonical roster order, independent of message arrival order.
- Match receipts include submitted decisions, public state updates, deterministic environmental events, SHA-256 digests, and replay verification.
- Observations expose the requesting agent's own state, public score/territory standings, and only limited competitor summaries. Competitor food, knowledge, and energy are excluded from observations. The complete referee receipt still contains full state and must be protected during competitive play.
- The deterministic engine and JSONL gateway make no network calls. The optional local-agent and local-model adapters make loopback HTTP requests only, with no external/provider connectivity by default. There are no production writes, tool calls, confirmed LLM autonomy, live admission, or public service in this release.

## Next release gates

1. Reconcile historical game rules with owned authoritative source if recovered, rather than recreating unknown mechanics as fact.
2. Attach and benchmark real independently controlled models through the JSONL protocol. Record provider/model identity and measured response latency separately from deterministic replay proof.
3. Implement private competitive views, agent identity authentication, per-turn deadlines, quota budgets, abuse controls, and provenance validation.
4. Connect receipt viewer to the existing owned World Engine / spectator experience; keep authoritative decisions server-side.
5. Validate isolated deployment and public readback before announcing availability.

**No Base44 services were queried or used.**
