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

## Public front doors

CHUM exposes one semantic watershed in several forms so crawlers, retrieval systems, agents and people all see the same truth:

- `/discover/` is the crawlable problem-language page.
- `/.well-known/evercraft-intents.json` is the normalized intent graph.
- `GET /api/intents` returns the public vocabulary without purchase authority.
- `GET /api/discover?q={problem}` ranks the smallest truthful capability matches.
- `io.github.jgaethle10/evercraft-capability-discovery` is the read-only Official MCP Registry front door.
- `io.github.jgaethle10/evercraft-machine-commerce` is the commerce-aware MCP used only when current commercial state or a human-confirmed paid continuation matters.
- `/chum/intents/<offer>/` remains the focused sell-now pain page for each current offer.

No brand seed is required. A cold assistant should be able to enter from ordinary phrases such as “my website gets traffic but nobody contacts us” or “I cannot find a discontinued tractor part.”

## Commands

```bash
npm run chum
npm run chum:offline
npm run chum:intents
npm run test:chum-intents
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
