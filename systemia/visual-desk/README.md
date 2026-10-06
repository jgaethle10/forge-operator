# Evercraft Visual Desk

Evercraft Visual Desk is the high-frequency visual publishing lane between Systemia's evidence/data systems, Fallen's heavier production stack, the owned public edge, and Evercraft Clip.

It exists for the simple social formats that should not require a cinematic production job:

- geographic comparisons
- routes and movement
- before/after or change-over-time maps
- ranked places
- physical-world signals
- infrastructure coverage
- weather, fire, smoke, river, flight, shipping and mobility explainers
- compact evidence-backed visual facts

The rule is intentionally small:

```
signal -> visual story -> owned page -> share card -> Clip handoff
```

## Why this lane exists

Fallen can already produce sophisticated geography/time/scale stories, but high-frequency social publishing needs a cheaper path. A useful visual should be able to become a durable Evercraft URL and platform-ready creative without waiting for a full film pipeline.

Visual Desk does not replace Fallen. It feeds it when motion, richer maps, video, voiceover or cinematic treatment is justified.

## Story contract

Input uses `evercraft.visual-story.v1`.

Required:

- `title`
- `evidenceState`: `observed`, `reported`, `modeled`, `inferred`, or `synthetic`
- at least one `sourceRefs` entry
- at least one geographic point

Example:

```json
{
  "schema": "evercraft.visual-story.v1",
  "title": "Three places, one visual question",
  "subtitle": "A source-backed geography story.",
  "evidenceState": "reported",
  "sourceRefs": ["https://example.org/source"],
  "points": [
    {"id":"a","label":"A","lat":46.6,"lon":-120.5,"value":20},
    {"id":"b","label":"B","lat":47.6,"lon":-122.3,"value":35}
  ],
  "lines": [{"from":"a","to":"b"}]
}
```

## Build

```bash
node systemia/visual-desk/factory.mjs ./story.json ./public/visuals
```

Optional canonical origin:

```bash
EVERCRAFT_VISUAL_ORIGIN=https://fabric.systemiacommandcenters.com/visuals \
  node systemia/visual-desk/factory.mjs ./story.json ./public/visuals
```

Each story emits:

- `index.html`: responsive owned page with canonical, OpenGraph and Twitter metadata
- `card.svg`: deterministic 1080 x 1350 social visual
- `manifest.json`: URL, evidence and digest metadata
- `story.json`: normalized story payload
- `clip-handoff.json`: downstream Evercraft Clip bundle

The build artifact itself has `publicationAuthority:false`. Existing Clip policy, verified adapters, authorization and provider receipts remain the publication gate.

## Operating doctrine

A social visual is not allowed to cosmetically upgrade evidence. Modeled stays modeled. Inferred stays inferred. Synthetic stays synthetic. Source references are part of the artifact identity.

The fast lane should be used by Radar, FAIE, TOWI, Journal, Worldstate and other Systemia sources when the story is primarily visual. Use Fallen when motion or production value materially improves the explanation.

The target is not "post more graphics." The target is a reusable loop where every strong visual can become:

1. an Evercraft-owned URL,
2. a native social creative,
3. a source/evidence package,
4. a distribution handoff,
5. a durable object we can update, cite and reuse.
