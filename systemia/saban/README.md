# Saban Portfolio Discovery

Saban is Evercraft's portfolio-scale admission and reconciliation layer. CHUM is the outward distribution and measurement layer.

The split is intentional:

```
portfolio inventory
  -> Saban admission/reconciliation
  -> GitHub + LLM mirrors
  -> CHUM compile, crawl, registry, freshness and provider probes
  -> human-confirmed handoff
  -> independently verified payment or outcome
```

## Commands

Check that every approved public product has conformance, a GitHub README, an `llms.txt` mirror, and a current public-product index:

```bash
npm run saban:discovery:check
```

Generate any missing approved GitHub mirrors and refresh the public product graph:

```bash
npm run saban:discovery
```

Run the whole distribution watershed:

```bash
npm run saban:watershed
```

That runs Saban first and CHUM second.

## Publication boundary

Inventory is not publication. Saban can reconcile a large portfolio, but an app only becomes public when it is explicitly admitted to `public/.well-known/evercraft-products.json` with a canonical public URL, natural-language intents, authority, boundaries, and the correct human-confirmation rule.

Internal, admin, auth, billing, private data, experimental topology, credentials, and customer records remain dark.
