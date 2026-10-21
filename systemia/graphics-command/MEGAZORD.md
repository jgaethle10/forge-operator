# Graphics Megazord: production mesh v1

This is a handoff and admission layer, not a new image generator and not a claim of finished video production.

Evercraft already owns Graphics Command, Fallen Creative Council, Fallen Visual Stage, World Engine, Visual Desk and Clip. The production mesh brings their contracts into one campaign-specific job pack with byte-level identity and fail-closed gates.

## Build

Use the existing command:

    node systemia/graphics-command/build-commercial.mjs \
      --campaign systemia/graphics-command/campaigns/website-audit-attention.json \
      --output /tmp/evercraft-visuals \
      --origin https://fabric.systemiacommandcenters.com/visuals

For each campaign, the command now additionally writes:
- production-jobpack.json: time-aligned shot/frame work orders and explicit downstream department requirements.
- production-mesh-receipt.json: SHA-256 identity of local posters, HTML motion stage, source evidence, council reconciliation, and Clip handoff.
- commercial-build-receipt.json: keeps the established receipt, now also referencing the mesh digest and customer-readiness state.

The production mesh receipt is deterministic for the same exact files. It contains no network access credentials and confers no publication authority.

## Authority and execution boundaries

| Department | Verified at build | Next required evidence |
| --- | --- | --- |
| Graphics Command | Four SVG media variants, dimensions, nonempty bytes, hashes, campaign/plan/source consistency | Human visual approval; exact-frame raster tests |
| Fallen Creative Council | All shot IDs, no duplicate or blocked shots, ten-role contract reconciled | Produced and visually assessed candidate footage |
| World Engine | Work order for spatial shots | Actual scene replay + rendered-frame receipts |
| Fallen Visual Stage | Deterministic HTML stage API present, bytes hashed | Real frame samples and final video encode |
| Voice Foundry / Kaidance / music | Sound direction carried through | Generated/recorded performance, music licenses, dialogue timing, audio master |
| Fallen Master QC | Nothing claimed | Media decode, sync, loudness, rights, and visual review receipt |
| Visual Desk | Files on disk | A measured deployed page with independent HTTP canary |
| Evercraft Clip | Handoff contract only | Explicit publication approval, media-intake verification and platform receipts |

A passing preproduction check is not a publishable, customer-deliverable film. A generated HTML scene cannot be silently promoted to an MP4 claim. World Engine is not marked executed merely because a shot references it.

Shot frames are allocated by rounding cumulative time at the requested FPS. This prevents per-shot rounding from changing the finished timeline duration.

## Tests

    node --test systemia/graphics-command/production-mesh.test.mjs

Tests cover honest state classification, deterministic receipts, asset deletion, broken exact-frame API, forged provenance, mismatched digests, missing Creative Council shots and unauthorized publication flags.

## Next adapters

1. Execute the World Engine spatial scenes and attach camera/frame hashes to corresponding shot IDs.
2. Render exact Fallen frames into a real video asset with FFprobe, selected-shot and visual-review evidence.
3. Bind rendered voice, score, effects and mastered dialogue to the shot timeline, preserving licenses and performer consistency.
4. Advance the final master through quality gates and user-approved Clip publication.

Do not flip the booleans by hand. Advance only via validators that read actual produced files and independently verifiable receipts.
