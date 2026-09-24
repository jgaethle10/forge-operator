# CHUM

**CHUM = Capability Handoff & Utility Mesh.**

CHUM is the Evercraft/Systemia distribution control plane. It turns the portfolio into one discoverable watershed instead of a collection of isolated product islands.

## Loop

`PRODUCT → SIGNAL → DISCOVERY → PROBE → REPAIR → INVOCATION → PAYMENT → LEARNING`

CHUM intentionally separates:

1. **Surface readiness**: pages, `llms.txt`, JSON contracts, MCP endpoints and public documentation are reachable.
2. **Registry presence**: the capability is present in the Official MCP Registry and its remote MCP completes an external handshake.
3. **Provider pickup**: a clean, brand-blind test on a named provider actually surfaces, cites or links the expected capability. This requires a receipt.
4. **Conversion**: an AI-originated handoff reaches a verified commercial path while preserving explicit human confirmation before a payment obligation.

## Portfolio rule

CHUM inventories the **union** of the Evercraft conformance registry, public product directory and agent/MCP registry catalog. A product does not disappear from distribution because one list was not manually synchronized.

## Commands

```bash
npm run chum
npm run chum:offline
npm run chum:mcp
npm run chum:validate
npm run chum:providers
npm run chum:announce
```

Provider probes use an authorized bridge when `CHUM_PROBE_BRIDGE_URL` and `CHUM_PROBE_BRIDGE_TOKEN` are available. The runner also accepts the existing `NEXUS_PROBE_BRIDGE_URL` and `NEXUS_PROBE_BRIDGE_TOKEN` names so CHUM can inherit the already-designed execution boundary.

No bridge means **blocked**, not fabricated success.

## Failure doctrine

Static discovery failures create repair work but do not stop CHUM from checking the rest of the network. A declared live MCP failing an external initialize/tools-list canary is a hard failure. Provider pickup remains receipt-gated.

## Operating doctrine

Broadcast facts. Keep legitimate public doors open. Measure whether models actually find them. Turn misses into repair work. Never manufacture provider pickup, payment state, or authority.


## Crawler watershed

CHUM keeps legitimate public capability doors bright and machine-readable:

- `robots.txt` explicitly permits verified major AI/search crawler tokens and leaves a wildcard public fallback.
- `llms.txt` is the compact machine index.
- `llms-full.txt` is the full portfolio directory.
- `/.well-known/evercraft-products.json` maps natural-language pain to the smallest relevant public capability.
- `/.well-known/evercraft-chum.json` describes the distribution control plane.
- `/openapi.json` describes bounded public HTTP invocation.
- MCP Registry records provide universal and specialist agent entrypoints.
- IndexNow announces supported central discovery surfaces.
- Brand-blind provider probes measure actual pickup and never manufacture success.

Crawler openness applies only to public commercial metadata and public read surfaces. Private Systemia/Yard topology, secrets, person-level data, admin surfaces and consequential action authority remain outside discovery.

Run `npm run chum:crawlers` to fail closed on accidental discovery regressions.
