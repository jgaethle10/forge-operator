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

## Cross-LLM conformance

Forge Operator now carries the portfolio-level Evercraft cross-LLM conformance standard under `conformance/`.

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

## SYSTEMIA Core boundary

Forge is also the public GitHub/Yard **handoff layer** for SYSTEMIA Core / Collider. It is not the Core source repository.

The Core source must remain private. Public-safe release and authority boundaries live under `systemia/core/`, which lets Yard and CI understand how to admit an opaque Core release without publishing private Systemia topology, credentials, mission state, or customer data.
