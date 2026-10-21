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


## Ecosystem coverage audit: October 20, 2026

The audit scopes seven source directories, nine additional named integration files, the family cartoon UI, Fallen Sessions, public interactive world experience, and relevant Saban production helpers. The pinned source baseline currently contains **139 production-related source modules**. Changes outside those scopes, uncommitted code on worker hardware, provider credentials, model weights and media assets are not covered.

### Explicit profile routing

- **Family cartoons and serialized toons:** family UI/server, character series bible, locked voices and identities, performance direction, lip sync, skeletal animation, geometry bridge, cinematic pipeline, and sound/master QA. Hands, facial performance, eyelines, movement, stable character appearance and child-safe review are required evidence, not assumed capabilities.
- **Documentary:** evidence and Worldstate, spatial staging, WebGPU, visual observer, authenticity labels, source rights and quality review.
- **Commercial:** Graphics Command, ten-role council, shot tournament, actual product truth, voice, music and render/master QC.
- **Interactive world:** collision, 3D animation, textures, lighting, audio, browser GPU and replay, with real-device tests.
- **Music/performance:** PulseGrid composition, voice and audio engine, spatial sound, dialogue sync, music rights and final mix.
- **Social creative:** Space Dudz artwork, Visual Desk, Clip distribution, privacy/family safety and platform sign-off.
- **Data and education:** geography/terrain, source evidence, projection accuracy, public edge readiness and labels.
- **Delivery:** FFmpeg/FFprobe-based render/master chain, verified Clip intake and separately authorized publishing.

Each profile remains contract-only and not runtime-verified until actual output artifacts are produced and admitted. Source-code presence or even passing unit tests never become claims of human-quality output, current provider access, deployed pages, or authorized publication.

### Enforced drift proof

The package now contains production-capability-baseline.json, production-capability-audit.mjs and a dedicated test suite. On each commercial specimen build, the audit walks its declared source scopes, hashes each checked-in source module, compares every module against the explicit baseline and requires all named production features and profile requirements to exist.

**New or missing modules fail the build** until inventoried. This is deliberate: new tools must be acknowledged rather than lost between creative departments. Updates to the baseline require reviewing their actual responsibility, dependencies and evidence policy.

Generated bundles now include production-capability-audit.json and production job packs include all eight production profiles with their required features and evidence receipts.

### Open gaps identified

- This has **not** yet generated an end-to-end, character-stable cartoon with verified hand anatomy, expressive voice and lips, final sound master and accepted video.
- Real provider keys, permissions, budgets, current provider availability, model weights and usage rights have **not** been verified by source scanning.
- A source can have a nearby test file without its test having run. Local source/test inventory checks must not be mistaken for completed end-to-end media tests.
- The commercial specimen produces useful deterministic graphics and HTML motion; a real integrated MP4 with finished voice/music and proven public delivery still requires separate execution receipts.
- The repository inventory does not include family-supplied photographs/videos held outside the checkout, unattached local workstation assets or unconnected external apps.

The purpose of this audit is to preserve all these lanes in a single traceable inventory, identify what can be routed next, and prevent accidental claims that every source module is already running in production.
