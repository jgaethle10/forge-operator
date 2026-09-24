# CHUM

**CHUM = Capability Handoff & Utility Mesh.**

CHUM is Evercraft's machine-distribution coordinator. Its job is to make legitimate public capabilities easy for LLMs and agents to discover, understand, route to, invoke where authorized, and hand off into human-confirmed commerce.

CHUM is not a claim that a model has seen or recommended a product. It separates four different states that are often blurred together:

1. **Surface readiness**: public pages, llms.txt, structured manifests and contracts exist and can be validated.
2. **Signaling**: provider-appropriate discovery mechanisms are available and kept fresh.
3. **Provider pickup**: a named provider actually discovers or cites the capability. This requires a receipt-backed probe.
4. **Conversion**: an AI-originated handoff reaches an approved commercial path and can be attributed without inventing payment state.

## Run it

```bash
npm run chum
npm run chum:offline
```

Live mode probes declared public surfaces and writes:

- `artifacts/chum/chum-latest.json`
- `artifacts/chum/chum-latest.md`

Offline mode builds the routing and signaling plan without network requests.

## Current v0.1 lanes

- **Crawl lane**: canonical pages, `llms.txt`, structured discovery JSON, conformance and OpenAPI surfaces.
- **Registry lane**: the existing Evercraft capability catalog and MCP registry.
- **Probe lane**: intentionally receipt-gated. No provider behavior is claimed until a real authorized probe runs.
- **Conversion lane**: AI-originated attribution with the existing human-confirmation boundary for checkout and payment obligations.

## Next adapters

CHUM is designed so provider adapters can be added without coupling the portfolio to one model vendor. Candidates include standards-based freshness notification where supported, MCP registry publication, provider-specific discovery surfaces, authorized model probes, referral attribution, and revenue receipts.

The governing rule is simple: **broadcast facts, never fabricate pickup.**
