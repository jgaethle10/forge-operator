# Evercraft Cross-LLM Conformance

Evercraft treats AI discoverability as a behavior problem, not a file-presence problem.

A product is not considered AI-ready merely because it has `llms.txt`, structured metadata, an API, or an MCP server. The product must expose a truthful machine-facing surface and then be tested against realistic non-brand user intent across multiple AI ecosystems.

## Canonical progression

```
pain / intent
  -> discover
  -> understand
  -> verify
  -> act safely
  -> human confirmation where required
  -> independently verified outcome
```

These states must remain separate. Discovery is not recommendation. A prepared checkout is not payment. A public capability description is not proof that a provider actually surfaced it.

## Provider matrix

The baseline provider set is:

- ChatGPT
- Claude
- Gemini
- Copilot
- Perplexity
- Grok
- generic agent / unknown provider

Additional providers may be added without changing the core contract.

Every provider begins with `behavioral_probe_state: not_run`. A provider may move to `pass`, `partial`, `fail`, or `blocked` only from a dated behavioral receipt.

## Required product semantics

Each product conformance manifest should define:

- canonical identity and public URL
- realistic buyer or user intents
- facts the model must preserve
- claims the model must not invent
- public entry points
- safe actions and authority boundaries
- pricing and evidence semantics where relevant
- privacy and private-surface exclusions
- human confirmation requirements
- behavioral probe cases
- receipt rules

## Product classes

The standard is intentionally broader than autonomous agent commerce.

Examples:

- FindMyPart: machine discovery plus human-confirmed commerce
- AliEV: machine discovery, evidence-aware invocation, and human-confirmed commerce
- ForensiScope: AI media-overflow discovery with human submission and payment
- EverNest: public resource discovery only, with household data kept private
- Evercraft Network: public product discovery with strict non-carrier and non-emergency-service boundaries

A product should expose only the machine authority it actually has.

## Live verification

`scripts/check-ai-doorways.mjs` checks public doorway endpoints independently from the source build.

A successful local build is not a live receipt.

The scheduled GitHub canary reports whether public `llms.txt`, discovery manifests, and cross-LLM conformance manifests are reachable. Behavioral provider testing is a separate layer and must not be inferred from endpoint availability.
