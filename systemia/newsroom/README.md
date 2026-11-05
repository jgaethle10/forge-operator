# Evercraft Journal Owned Newsroom

This directory is the owned, evidence-controlled production path for Evercraft Journal.

## Pipeline

1. Shared Context Fabric offers observations to the `journal` consumer.
2. `newsroom-intake.mjs` holds weak or untraceable signals and admits material, source-grounded signals as candidates.
3. Claim-bearing material passes through `claim-reactor.mjs`, which atomizes assertions, binds them to source-backed evidence, keeps observed/reported/modeled/correlated/causal semantics separate, audits framing gaps, preserves disagreement, and fails closed on unsupported causal bridges or context-free statistics.
4. A candidate becomes an `evercraft.journal.story.v1` package only after evidence, uncertainty, rights and editorial work are complete.
5. `journal-publisher.mjs` fails closed unless the story is fresh, public/unclassified, source-bound, rights-cleared, production-grade and 10/10 on the editorial gate.
6. The publisher emits:
   - a human article
   - a machine-readable Journal index
   - RSS
   - llms.txt
   - a digest-bound publication receipt
   - the canonical Fallen production brief
   - an Evercraft Clip handoff bundle
7. The Clip handoff never grants social publication authority by itself.

The static output lives under `public/journal`, which Vite copies into the owned runtime build. The legacy Journal can therefore be watched during migration without remaining the canonical publishing engine.

## Commands

```bash
npm run journal:test
npm run journal:build
```

## Historical feature preview (not a publication path)

The Curiosity Desk can render the source-grounded chainsaw history candidate with an explicitly public-domain photograph:

```bash
node systemia/newsroom/editorial-preview.mjs
```

The output is a local, noindex HTML file in the operating system's temporary directory. For an alternate path, pass the editorial Markdown path, the media manifest, and a **local .html output path**, in that order. The command refuses to write under `public/`, `dist/`, `build/`, `.github/`, or `systemia/newsroom/stories/`. Its output is for editorial review only, not an approved Journal story, live URL, production build, signed Systemia release, or Clip distribution authorization.

Source rights metadata: `editorial-assets/chainsaw-surgical-origins-media.json`. It identifies the public-domain source image, photographer and source URL. Avoid substituting unlicensed museum photography. Run `npm run journal:test` to include the preview gate tests.

## Evidence-level claim preflight (no publishing authority)

For the chainsaw hidden-history feature, `editorial-queue/2026-11-05-chainsaw-claim-input.json` maps six historically bounded statements onto named evidence and source records. Run:

```bash
node systemia/newsroom/editorial-claim-preflight.mjs
npm run journal:test
```

The tool invokes the shared `claim-reactor.mjs` and emits a local JSON **candidate** on stdout. It fails closed on broken source or evidence references, counterfeit approval fields, and unsupported causal bridges. An `evidence_preflight_ready` value of `true` only means a packet can proceed to an **independent editorial reviewer**. It cannot mark a story approved, produce a Systemia release, populate `public/journal`, or authorize Evercraft Clip. Those gates remain separate and require genuine receipts.
