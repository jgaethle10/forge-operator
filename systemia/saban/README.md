# Saban Portfolio Discovery

Saban is Evercraft's portfolio-scale discovery reconciler. CHUM handles outward signaling and live surface probing. Saban handles the larger inventory, admits only approved public products, and makes sure every admitted product receives durable GitHub and LLM-readable discovery surfaces.

## Doctrine

Inventory is not publication.

Saban may inspect a large portfolio source, but an app is not published merely because it exists. A product must first be admitted to `public/.well-known/evercraft-products.json` with:

- a public canonical URL
- natural-language intents
- an authority statement
- explicit boundaries
- the correct human-confirmation rule

Internal, admin, untitled, experimental, billing, auth, and private-topology apps stay dark.

## Commands

Generate missing GitHub discovery surfaces for approved public products:

```bash
npm run saban:discovery
```

Validate that every approved public product has conformance plus a GitHub README and `llms.txt` mirror:

```bash
npm run saban:discovery:check
```

Optionally compare an external portfolio inventory without publishing unknown entries:

```bash
node systemia/saban/discovery-swarm.mjs --inventory /path/to/inventory.json
```

Unknown inventory entries are counted only. Their IDs and private topology are not copied into public artifacts.

## Relationship to CHUM

Saban answers: what in the portfolio is approved for public discovery, and does it have the required source surfaces?

CHUM answers: are the declared public routes actually reachable, machine-readable, registry-backed where appropriate, and observed by authorized provider probes?

The intended flow is:

```
portfolio inventory
  -> Saban admission/reconciliation
  -> GitHub README + llms.txt + conformance
  -> CHUM crawl/registry/provider probes
  -> human-confirmed handoff
  -> independently verified payment or outcome
```

## Scale

The discovery swarm is designed so adding the 17th product and adding the 317th product follow the same contract. The swarm does not invent MCP endpoints, claim provider pickup without receipts, or expose private systems to increase product count.
