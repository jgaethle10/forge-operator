# Evercraft Graphics Command

Evercraft Graphics Command is the art-direction layer between evidence-rich products and Evercraft's rendering stack.

It does not replace Visual Desk, Fallen, World Engine, or Clip. It forces them to behave like one visual system:

```
Systemia / Radar / FAIE / TOWI / Journal / RIVET / AliEV
  -> Graphics Command
  -> Fallen Creative Council + visual strategy exploration
  -> Shot Tournament
  -> Fallen Visual Stage / World Engine
  -> exact-frame render workers
  -> Visual Desk owned page
  -> Evercraft Clip
```

The first contract is intentionally narrow:

- select a visual treatment from a source-backed Visual Story;
- make the hero visual lead on mobile;
- keep metadata and audit receipts out of the initial visual payoff;
- emit 4:5, square and 9:16 composition targets;
- emit a Fallen world-intelligence stage input using the same evidence/source lineage;
- treat governed geographic polygons and georeferenced terrain rasters as first-class visual primitives;
- verify cached terrain bytes against their source receipt and SHA-256 before render;
- carry terrain rights, bounds, source references and digests through Graphics Command, Fallen, Visual Desk and production canaries;
- require deterministic motion treatment;
- fail a scroll-stop gate when typography, visual dominance, provenance or multi-format readiness are not good enough.

The Washington volcano specimen uses a cached USGS The National Map / 3DEP shaded-relief raster. Runtime rendering never depends on a live terrain fetch: the governed source raster is admitted once, hashed, rights-stamped, and then verified locally on every build. The `cinematic-terrain-geography-v3` poster contract rejects the legacy node-diagram grammar, including peak halos and high-emphasis connector spines.

## Shot Tournament

Graphics Command does not ship the first technically valid composition. The Visual Desk build creates three deterministic candidates before canonical poster rendering:

- **Terrain Hero** prioritizes recognizable physical geography and suppresses route prominence.
- **Balanced Relief** keeps the established terrain/marker/evidence balance.
- **Cascade Signal** makes the evidence path more legible while preserving the geographic frame.

Every candidate is measured in feed, square, and story formats. Any collision or safe-margin rejection is a hard tournament loss. Eligible candidates are ranked deterministically on terrain fit, route restraint, marker restraint, and region-label restraint. The winning candidate ID and digest are written to `shot-tournament.json`, the Visual Desk manifest, poster-quality receipt, and Clip handoff.

The portable build also emits candidate feed/story SVGs for human QA. Terrain-backed candidate SVGs reference the single governed local terrain asset instead of duplicating the raster payload. The canonical poster still embeds the governed terrain bytes and preserves the exact source SHA-256.

The tournament is an art-direction and selection layer only. It never changes evidence coordinates, source lineage, rights state, or publication authority.

The tournament report schema is `evercraft.graphics-command.shot-tournament.v1`; the canonical poster records the winning strategy in `data-shot-strategy`, making the selected visual grammar machine-verifiable as well as human-reviewable.


Rendering does not grant publication authority.


## Cinematic geometry floor (October 2026)

The Fallen Studio delivery path now binds its final MP4 technical admission to the
actual timeline canvas and frame rate, instead of accepting resolution and codec
alone. The master QC receipt records the encoded and display aspect ratios,
sample-pixel aspect ratio, target canvas, and frame-rate deviation.

- The displayed aspect ratio must remain within 1.2% of the intended 9:16,
  16:9, or 1:1 timeline canvas.
- A known non-square pixel aspect ratio is rejected for owned masters, even
  when width and height look superficially plausible.
- A frame-rate mismatch greater than 0.15 FPS is rejected.
- Existing black-frame, freeze, silence, rights, identity, continuity, and
  aesthetic gates remain separate and cannot be replaced by these measurements.
- A technical pass does **not** prove that a face, hand, text placement,
  voice performance, or cinematic composition looks natural. Those require
  evidence-backed creative review on the final exact rendered frames.
- None of these gates grants publication authority.

**Operator checklist before a commercial is released:** review real frame
samples at normal phone viewing size; reject stretched faces or anatomy,
unreadable or overlapping titles, excessive scene-template repetition,
monotonous voice delivery, weak brand lockups, or any unverified product claims.
Any corrected shot must be re-admitted against the new artifact digest.
