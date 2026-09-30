# Evercraft Documentary Desk

The Documentary Desk is the evidence-governed orchestration layer above Evercraft's existing research, media, map, compute and distribution systems.

It does not replace Fallen, Media Studio, Saban, ForensiScope, TOWI, FAIE, Evermaps, Journal or Evercraft Clip. It binds them into one documentary production contract and keeps factual evidence separate from illustration.

## Canonical flow

```
Systemia admission
  -> research / evidence graph
  -> archive and long-media review
  -> geospatial / world-state projection
  -> documentary plan
  -> Fallen + Media Studio production
  -> Saban execution / render capacity
  -> Documentary QA
  -> master + transcript + source room
  -> Journal + Evercraft Clip distribution
```

## Non-negotiable evidence rules

- Every chapter cites evidence records.
- Evidence states are explicit: observed, documented, attributed, inferred, modeled, disputed, unknown.
- Generated visuals may illustrate. They may never prove a factual claim.
- Synthetic/generated media must be visibly labeled.
- Source lineage and rights state are preserved.
- Contradictions and uncertainty survive into the production plan.
- Release stays closed until QA gates pass.

## Commands

```bash
npm run documentary:plan -- plan brief.json output-plan.json
npm run documentary:plan -- release-check output-plan.json release-receipt.json
npm run test:documentary-desk
npm run proof:documentary-desk
```

The pilot fixture is `fixtures/yakima-water-pilot.json`. Its source references are intentionally placeholders until Systemia admits a real evidence-acquisition mission. The fixture tests the pipeline contract, not the factual completeness of the finished film.
