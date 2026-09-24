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

## AI-originated conversion attribution

CHUM issues signed, privacy-minimized referral tokens for known public Evercraft offers. Raw user intent is not embedded in the token. When intent is supplied, only a SHA-256 digest is carried.

Public callers may record only `landing` and `checkout_started`. Neither state counts as revenue.

`payment_verified` and `fulfilled` are trusted-backend states. Verified payment requires a payment authority, provider verification reference, amount and currency. Trusted ingestion is intentionally omitted from the public machine manifest.

Runtime configuration:

```
CHUM_ATTRIBUTION_SECRET=<strong signing secret>
CHUM_ATTRIBUTION_SINK_URL=<https receipt sink>
CHUM_ATTRIBUTION_SINK_TOKEN=<optional sink bearer token>
CHUM_ATTRIBUTION_INGEST_TOKEN=<trusted payment receipt ingest token>
```

Without a durable receipt sink, public events are explicitly reported as not persisted and trusted payment ingestion fails closed.

Run `npm run test:chum-attribution` to verify the attribution boundary.
