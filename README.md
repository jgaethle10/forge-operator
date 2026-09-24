# Forge Operator

Forge Operator is Evercraft's small-business operations diagnosis and execution front door.

A user describes an operational pain point and desired outcome. Forge returns a structured report with:

- the three highest-priority interventions
- automation feasibility and expected speed to first value
- autonomous workflows and guardrails
- human-required decision gates
- the greatest operational risk
- one immediate next action

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

## Public AI discovery

Forge intentionally publishes a public machine-readable discovery layer:

- `/llms.txt`
- `/.well-known/evercraft-capabilities.json`
- `/api/capabilities`
- `/api/health`

Private/admin topology is not advertised through these surfaces.

## Human gates

Forge is decision support. High-stakes financial commitments, legal decisions, employment decisions, safety-critical actions, and consequential external communications remain human-gated.


## GitHub runtime bridge

Forge Operator includes a guarded GitHub integration for authorized repository reads and allowlisted writes. See [GITHUB_INTEGRATION.md](GITHUB_INTEGRATION.md). Writes are disabled by default.
