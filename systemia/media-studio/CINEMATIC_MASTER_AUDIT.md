# Fallen cinematic-master audit

Purpose: detect export failures and repetitive, low-change visual treatments **before** anyone describes an exported video as a finished commercial. This tool audits measured pixels and stream metadata. It does not manufacture aesthetic scores or grant publication authority.

## Run

```bash
node systemia/media-studio/cinematic-master-audit.mjs ./commercial.mp4 ./commercial.cinematic-audit.json
node --test systemia/media-studio/cinematic-master-audit.test.mjs
```

Exit codes: `2` for technical rejection, `1` for a technically eligible artifact that still needs human creative review, `3` for inspection errors. A zero exit code is deliberately not available for automated creative approval.

## Checks

- Confirm short edge at least 1080 pixels (for example 1080 x 1920 in vertical orientation) and at least 23.9 fps.
- Sample two frames per second, measure mean pixel change at a fixed low-resolution grayscale scale, and report time spent in low-change holds.
- Flag low activity and very few detectable transitions for editorial review. A subtle film can deliberately use stillness, so motion metrics are **observations**, not automatic aesthetic verdicts.
- Return an artifact SHA-256, policy, measured values, reasons and machine-readable evidence receipt.
- Never infer shot diversity, acting quality, real-world authenticity, emotion, typography legibility, audience relevance, or brand correctness from frame deltas.

## Required commercial workflow

1. Approve story and concrete narrative shot requirements; reject text slides offered in place of required subjects.
2. Bind truthful assets, licensing, and identity/continuity records. Run the Fallen Creative Council and verified Shot Tournament on the actual produced candidates.
3. Render through Fallen Studio, recording exact source/shot provenance.
4. Run technical master QC **and** this cinematic audit on the exact export to be delivered. A downscaled social-platform copy must be inspected separately; master approval is not transferrable to a different file.
5. Require human judgment of pacing, composition, visual continuity, source truth, product-UI honesty, sound sync, readable type, and approved Evercraft brand assets before handing to Clip.
6. Keep separate production, approval and publication receipts. Neither a render nor this audit authorizes publishing.

The first Relay director's cut motivated this gate: it played but repeated limited panels and was shared for review at 512 x 908. Successful decoding was mistaken for creative readiness. This should remain a regression case, not the new standard.

## Relay cinematic benchmark and production admission

The director previously spread any available imagery across commercial story beats. That path remains suitable for simple motion-graphic exports, but must not be mistaken for cinematic production.

For cinematic briefs, add `brief.cinematicCoverage` with schema `evercraft.fallen.cinematic-coverage-contract.v1` and one explicit requirement per required beat. Each requirement specifies an ID, beat, concrete subject, physical action, mode (`physical_action`, `environment`, or `product_interaction`), minimum duration, and IDs of actual candidate videos. Do not enter an asset ID until authorized footage with supported rights exists.

The **Relay: The Gap** benchmark requires two irreplaceable shots:

1. Hook: Two people stand, collect their papers, finish a meeting, and leave the room. A logo, static conference-room photo, or zooming text frame is **not equivalent** to visible human action.
2. Setup: Each person begins a different real-world task based on the November 2 date. One prepares the construction kickoff; the other prepares a permit submission. A graphic timeline is supporting information, not a replacement for this action.

A missing eligible video means the plan contains explicit `semantic_coverage_gap` production requests and `cinematicCoverage.status = blocked`. The ordinary director can still assemble an editable preview plan, but `renderFilm` will reject it before starting FFmpeg. When videos are correctly assigned, status becomes `candidate_bound_unverified`, **not** approved or publishable. Shot Tournament, visual observation, rights, continuity, honest synthetic labeling, audio sync, and human visual QA are separate mandatory gates.

### Explicit limits

This is a preventive admission control, not new cinematic footage synthesis. It does not prove that a video showing the required action is actually present. Content verification needs a cited observed shot receipt, not a filename or asset metadata. It does not establish native Kennedy Space Station access, hardware execution, enterprise release readiness or end-to-end Clip publication.

The next production milestone is two legitimately sourced, continuity-consistent moving shots with their actual frame evidence, not another poster or a successful smoke-test video.
