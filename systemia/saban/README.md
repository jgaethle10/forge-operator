# Saban Portfolio Discovery

Saban is Evercraft's portfolio-scale admission and reconciliation layer. CHUM is the outward distribution and measurement layer.

```
portfolio inventory
  -> Saban admission/reconciliation
  -> GitHub + LLM mirrors
  -> CHUM answer doors, pain index, crawl, registry, freshness and provider probes
  -> human-confirmed handoff
  -> independently verified payment or outcome
```

## Commands

Check every approved public product:

```bash
npm run saban:discovery:check
```

Generate missing approved mirrors and refresh the public product graph:

```bash
npm run saban:discovery
```

Run the complete discovery watershed:

```bash
npm run saban:watershed
```

## Publication boundary

Inventory is not publication. A product only becomes public after explicit admission to `public/.well-known/evercraft-products.json` with a canonical public URL, natural-language intents, authority, boundaries, and the correct human-confirmation rule.

Internal, admin, auth, billing, customer data, credentials, and private topology remain dark.
