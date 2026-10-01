# Evercraft Journal Owned Newsroom

This directory is the owned, evidence-controlled production path for Evercraft Journal.

## Pipeline

1. Shared Context Fabric offers observations to the `journal` consumer.
2. `newsroom-intake.mjs` holds weak or untraceable signals and admits material, source-grounded signals as candidates.
3. A candidate becomes an `evercraft.journal.story.v1` package only after evidence, uncertainty, rights and editorial work are complete.
4. `journal-publisher.mjs` fails closed unless the story is fresh, public/unclassified, source-bound, rights-cleared, production-grade and 10/10 on the editorial gate.
5. The publisher emits:
   - a human article
   - a machine-readable Journal index
   - RSS
   - llms.txt
   - a digest-bound publication receipt
   - the canonical Fallen production brief
   - an Evercraft Clip handoff bundle
6. The Clip handoff never grants social publication authority by itself.

The static output lives under `public/journal`, which Vite copies into the owned runtime build. The legacy Journal can therefore be watched during migration without remaining the canonical publishing engine.

## Commands

```bash
npm run journal:test
npm run journal:build
```
