# Evercraft Documentary Desk

The Documentary Desk is the evidence-governed orchestration layer above Evercraft's owned research, media, world-state, compute and distribution runtimes.

## Runtime rule

The documentary execution path is first-party only. Every executable dependency must resolve to a `systemia/` module in Forge Operator. Legacy hosted application doors may exist elsewhere in the portfolio for compatibility, but Documentary Desk does not invoke them.

The owned lanes are:

- Systemia goal runtime for admission and mission state.
- Newsroom claim reactor + Worldstate observation/context for research.
- ForensiScope for authorized long-media transcription and evidence graphs.
- Worldstate + Media Studio world-map/world-intel for geospatial storytelling.
- Fallen / Media Studio + Saban for film planning, QA and render execution.
- Journal + the owned Clip intake/publisher/YouTube runtime for distribution.

## Canonical flow

```
Systemia admission
  -> owned research / evidence graph
  -> owned ForensiScope archive review
  -> owned Worldstate / map projection
  -> Documentary Desk plan
  -> Fallen + Media Studio production
  -> Saban execution / render capacity
  -> Documentary QA
  -> master + transcript + source room
  -> Journal + owned Evercraft Clip distribution
```

## Non-negotiable evidence rules

- Every chapter cites evidence records.
- Evidence states are explicit: observed, documented, attributed, inferred, modeled, disputed, unknown.
- Generated visuals may illustrate. They may never prove a factual claim.
- Synthetic/generated media must be visibly labeled.
- Source lineage and rights state are preserved.
- Contradictions and uncertainty survive into the production plan.
- Release stays closed until QA gates pass.
- Runtime topology fails closed if a documentary lane points outside owned Systemia modules.

## Commands

```bash
npm run documentary:plan -- plan brief.json output-plan.json
npm run documentary:plan -- owned-runtime-check
npm run documentary:plan -- release-check output-plan.json release-receipt.json
npm run test:documentary-desk
npm run proof:documentary-desk
```

The pilot fixture is `fixtures/yakima-water-pilot.json`. Its source records are intentionally placeholders until Systemia admits a real evidence-acquisition mission. The fixture proves pipeline behavior, not factual completeness of a released film.
