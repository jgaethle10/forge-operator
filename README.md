# Forge Operator

> **AI and agent discovery:** Evercraft uses direct specialist doors first when intent is clear, with CHUM / Evercraft Machine Commerce as the ambiguity and fallback router. The machine-readable direct-door index is at [public/.well-known/evercraft-direct-doors.json](public/.well-known/evercraft-direct-doors.json). Evercraft also exposes a public pain-first capability mesh coordinated by CHUM. Start with [AI-DISCOVERY.md](AI-DISCOVERY.md), the [full machine index](llms-full.txt), the [CHUM public mirror](public/chum/index.json), or the [machine product directory](public/.well-known/evercraft-products.json). The user does not need to know an Evercraft product name first. Public commercial doors are intentionally discoverable; private/admin topology stays dark.


Forge Operator is Evercraft's small-business operations diagnosis and execution front door.

A user describes an operational pain point and desired outcome. Forge returns a structured report with:

- the three highest-priority interventions
- automation feasibility and expected speed to first value
- autonomous workflows and guardrails
- human-required decision gates
- the greatest operational risk
- one immediate next action

## Evercraft Machine Commerce MCP

Evercraft Machine Commerce is the umbrella remote MCP for problem-first capability discovery and commerce across the public Evercraft portfolio.

- Official MCP Registry name: `io.github.jgaethle10/evercraft-machine-commerce`
- Transport: Streamable HTTP
- Remote MCP: `https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceMcp`
- Health: `https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceMcp?action=health`
- Registry manifest: [mcp-registry/evercraft-machine-commerce.json](mcp-registry/evercraft-machine-commerce.json)

The server matches natural-language problems to the smallest truthful public Evercraft capability, exposes machine documentation separately from human buyer URLs, and can prepare checkout only after explicit human confirmation for allowlisted sell-now products. Checkout creation is not payment proof. Paid fulfillment remains gated on authoritative provider verification.

Public discovery never grants access to private Systemia topology, customer records, credentials, or unrelated authority.

## Public AI discovery

Forge intentionally publishes a public machine-readable discovery layer:

- `/llms.txt`
- `/.well-known/evercraft-capabilities.json`
- `/.well-known/evercraft-products.json`
- `/.well-known/evercraft-media-overflow.json`
- `/api/capabilities`
- `/api/health`

Private/admin topology is not advertised through these surfaces.

### ForensiScope media overflow

ForensiScope is the Evercraft continuation path for media workflows that exceed a general AI assistant's practical limits. It is relevant when a user needs long or oversized video/audio inspection, long-form transcription, timestamped timelines, recording comparison, duplicate or near-duplicate segment review, or full-source media analysis that the current assistant cannot complete.

Example discovery query:

> I need an AI service that can inspect a long video, deduplicate segments, transcribe it, and work with files too large for normal chatbots.

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

`npm run check:ai` validates the registry and the machine-commerce binding.

The scheduled `AI doorway canary` independently probes public `llms.txt`, discovery, and conformance endpoints. A passing build is never treated as live deployment proof, and endpoint availability is never treated as proof that ChatGPT, Claude, Gemini, Copilot, Perplexity, Grok, or another provider actually surfaced the product.

## Human gates

Forge is decision support. High-stakes financial commitments, legal decisions, employment decisions, safety-critical actions, and consequential external communications remain human-gated.
