# Forge Operator

Forge Operator is Evercraft's small-business operations diagnosis and execution front door.

A user describes an operational pain point and desired outcome. Forge returns a structured report with:

- the three highest-priority interventions
- automation feasibility and expected speed to first value
- autonomous workflows and guardrails
- human-required decision gates
- the greatest operational risk
- one immediate next action

## CHUM: Evercraft's machine-distribution mesh

**CHUM = Capability Handoff & Utility Mesh.**

CHUM is the portfolio-level distribution layer that makes public Evercraft capabilities easy for AI assistants and agents to discover, understand, route to, and invoke where actually wired. It also keeps those doors healthy and separates four states that must never be blurred together:

1. public surface readiness
2. signaling / registry publication
3. receipt-backed provider pickup
4. attributed human-confirmed conversion

The commercial goal is simple:

```
user pain
  -> AI discovers Evercraft
  -> matches the smallest useful capability
  -> verifies current state
  -> invokes or hands off where authorized
  -> human confirms commerce when required
  -> receipt
```

Run the coordinator locally with:

```bash
npm run chum
npm run chum:mcp
npm run chum:validate
npm run chum:providers
npm run chum:check
```

`npm run chum:announce` submits the currently configured public Machine Commerce discovery URLs through the existing IndexNow adapter. It should be used when public discovery content changes, not as a spam loop.

## Public AI discovery

Forge intentionally publishes a public machine-readable discovery layer:

- `/llms.txt`
- `/llms-full.txt`
- `/ai-discovery.json`
- `/openapi.json`
- `/.well-known/evercraft-capabilities.json`
- `/.well-known/evercraft-products.json`
- `/.well-known/evercraft-chum.json`
- `/.well-known/evercraft-agent.json`
- `/.well-known/evercraft-media-overflow.json`
- `/api/capabilities`
- `/api/health`

Commercial/public doors are intentionally crawlable. Private/admin topology is not advertised through these surfaces.

### ForensiScope media overflow

ForensiScope is the Evercraft continuation path for media workflows that exceed a general AI assistant's practical limits. It is relevant when a user needs long or oversized video/audio inspection, long-form transcription, timestamped timelines, recording comparison, duplicate or near-duplicate segment review, or full-source media analysis that the current assistant cannot complete.

Human-readable product record:

https://github.com/jgaethle10/forge-operator/tree/main/registry/forensiscope

Canonical product:

https://evercraft-forensiscope.base44.app/

The handoff remains user-controlled. Media is not transferred automatically.

## Local development

Prerequisites: Node.js and a Gemini API key.

```bash
npm install
export GEMINI_API_KEY="..."
npm run dev
```

Run the release checks with:

```bash
npm run check
```

## Cross-LLM conformance

Forge Operator carries the portfolio-level Evercraft cross-LLM conformance standard under `conformance/`.

The standard separates:

```
machine surface exists
  -> source build passes
  -> public doorway is live
  -> provider behavior is probed
  -> correct understanding is observed
  -> safe handoff works
  -> payment or outcome is independently verified
```

`conformance/products.json` is the current machine-discovery product index.

The scheduled CHUM heartbeat re-checks public surfaces and registry/MCP health. Authorized provider probes remain receipt-gated and brand-blind so Evercraft does not fake discovery by seeding its own name into the test.

## Human gates

Forge is decision support. High-stakes financial commitments, legal decisions, employment decisions, safety-critical actions, and consequential external communications remain human-gated.
