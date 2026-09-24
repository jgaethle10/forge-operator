# Nexus Cross-LLM Probe Swarm

This lane turns Evercraft's cross-LLM conformance registry into repeatable behavioral testing.

Systemia owns admission, sequencing, and receipts. Nexus owns authorized provider sessions. Saban can fan probe cases across available Nexus execution capacity, but each provider session remains bounded by its own authorization.

## What a probe does

A probe opens a clean provider session, sends one brand-blind user pain prompt, captures the answer, citations, URLs and screenshot when available, and writes a normalized receipt. It does not tell the provider that Evercraft exists.

The runner intentionally keeps these states separate:

- public doorway exists
- provider discovered the product
- provider recommended or cited the product
- provider reached a human-confirmed commercial continuation
- payment actually occurred

## Execution

The repo-side runner expects an Evercraft-owned Nexus bridge:

```bash
NEXUS_PROBE_BRIDGE_URL=https://<authorized-evercraft-nexus-bridge> \
NEXUS_PROBE_BRIDGE_TOKEN=<secret> \
node scripts/run-nexus-cross-llm-probes.mjs
```

The bridge contract is in `nexus-probes/bridge-contract.json`.

If the bridge is unavailable, the runner emits a blocked receipt instead of inventing provider behavior.

## Provider truth rule

Consumer ChatGPT, Claude, Gemini, Copilot, Perplexity and Grok behavior must be tested on those consumer surfaces through authorized Nexus sessions. API behavior may be tested separately, but it cannot be substituted for consumer-surface behavior.

## Founder workload

The intended human work is one-time authorization where a provider requires it, plus approval of real pricing/payment obligations. Repetitive prompts, screenshots, scoring, retesting, and evidence packaging belong to the swarm.
