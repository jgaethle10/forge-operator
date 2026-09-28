# Fallen

Fallen is Evercraft's owned media creation engine for turning photos, video, audio and plain-language direction into editable media projects, commercials, shorts, films and episodic series.

The durable product boundary lives above any single foundation model. Fallen owns the project graph, story direction, asset identity, continuity, canon, edit decisions, provenance, render graph, receipts and future provider routing. Image, video, speech, music and SFX models are replaceable production departments.

## What works now

- Commercial, social-short, short-film and episodic story structures.
- Prompt-aware shot allocation.
- Semantic must-show coverage: concrete subjects named in a brief (for example ships, tanks, wildfire, aircraft, charging infrastructure) are checked against source assets and become explicit production needs when missing, instead of being replaced by generic text cards.
- Image and video source inputs.
- FFprobe metadata inspection.
- FFmpeg normalization and MP4 assembly.
- 9:16, 16:9 and 1:1 output.
- Basic push-in movement for stills.
- Rights and provenance tracking.
- Hard rejection of explicitly restricted assets.
- Explicit generation requests for missing or optional synthetic coverage.
- Fallen Series Bible with stable characters, locations, props, brands and style entities.
- Immutable character trait locks.
- Locked canon facts with fail-closed contradiction detection.
- Per-character voice profile locks.
- Asset-to-character identity binding.
- Dialogue plans that cannot silently substitute an unlocked voice.
- Continuity contracts automatically injected into synthetic coverage requests.
- Bible digests and episode canon receipts for reproducible continuity auditing.
- Proposed-canon output for human review rather than silently rewriting the show's history.
- Provider-neutral production work graph for generated shots and voice-locked dialogue.
- Verified creative-department router that refuses declared-but-unverified providers.
- Capability routing for reference identity, voice locks, timing, rights and provenance requirements.
- Production admission gate for artifact digests, continuity digests, commercial rights, provenance, timing and locked voices.
- Verified identity-evidence threshold gate before generated visuals can enter an episode.
- Episode-level production reconciliation that fails closed if any artifact is rejected.
- Saban production inventory export plus a bounded eight-role Fallen production contract.
- Deterministic tests for the core director and Series Mode continuity gate.

## Commands

```bash
npm run media:studio -- plan systemia/media-studio/example.project.json ./tmp/plan.json
npm run media:studio -- render ./tmp/plan.json ./tmp/output.mp4
npm run media:studio -- build systemia/media-studio/example.project.json ./tmp/output.mp4 ./tmp/plan.json
npm run media:studio -- series <episode.project.json> <series-bible.json> <series-plan.json>
npm run media:studio -- inventory <series-plan.json> <saban-inventory.json>
npm run proof:saban-fallen
npm run test:media-studio
```

## Series Mode

A series bible uses the schema `evercraft.fallen.series-bible.v1`.

It can lock:

- character identity and immutable physical traits;
- character voice profile IDs;
- locations and landmark traits;
- props and recurring objects;
- brand identity;
- visual/style rules;
- canon facts established by earlier episodes.

An episode may submit continuity claims and dialogue. Fallen checks those requests against the bible before compiling the film plan. Locked contradictions fail closed. New canon is emitted as proposed canon for review instead of being silently committed.

The resulting `evercraft.fallen.series-plan.v1` contains:

- the normal editable film plan;
- the complete continuity report;
- voice-locked dialogue cues;
- proposed canon;
- a SHA-256 digest of the source bible;
- a SHA-256 canon receipt for the episode;
- continuity instructions attached to every requested generated shot.

This is the foundation for recurring cartoons, serialized films, recurring commercial characters and brand campaigns where identity must survive across many generations and editing sessions.

## Creative Council

Fallen now has a separate pre-production swarm called the **Fallen Creative Council**. It is registered in Saban as `fallen-creative-council` and fans ten owned creative roles across each planned scene or semantic coverage gap before provider execution.

The current crew is intentionally cross-system rather than a new isolated team:

- **Little Red Studio** owns story architecture, world building and brand art direction.
- **ForensiScope Create** owns visual evidence scouting and documentary-truth boundaries.
- **Fallen** owns cinematography, data graphics and edit rhythm.
- **Kaidance** owns sound direction.
- **Human Experience Sentinel** owns the beauty judgment.

Each role returns a structured note. Saban reconciles the notes into an `evercraft.fallen.creative-council-reconciliation.v1` receipt with one **creative genome** per shot. The genome contains story, camera, coverage, graphics, world, edit, sound, art-direction, truth and beauty constraints plus a unioned rejection contract. A scene cannot silently pass as "finished" merely because it rendered.

The council is deliberately provider-neutral. It performs no model call by itself and creates no synthetic media claim. Its job is to make the downstream asset search/generation request much harder to misunderstand, and to give provider output a concrete visual contract to satisfy.

Build a council inventory from a film plan:

```bash
npm run media:studio -- council ./tmp/plan.json ./tmp/creative-council.json
```

Run the bounded Saban proof:

```bash
npm run proof:saban-fallen-creative
```

## Shot Tournament

Fallen now has a second governed swarm after the Creative Council: the **Shot Tournament**. The Creative Council defines what a shot must accomplish; the tournament decides which produced candidate is allowed to advance.

The jury uses eight independent roles:

- subject coverage
- composition
- motion
- continuity
- documentary truth
- brand fidelity
- beauty
- editability

The tournament is evidence-bound. Visual scores must come from verified observation receipts with evidence references. Missing visual evidence blocks a judge instead of inventing a quality score from metadata or filenames. Truth checks are fail-closed: incomplete provenance, unknown source state, or unlabeled synthetic/modelled visualization cannot advance.

Hard-fail dimensions such as subject coverage, continuity, truth and editability eliminate a candidate regardless of how attractive it is. This prevents a visually impressive but incorrect or misleading render from winning on aesthetics alone.

### Deliberate candidate exploration

Before generation, Fallen can compile multiple **different visual strategies** for each Creative Council shot instead of cloning one prompt with different random seeds. World-intelligence scenes explore source-first documentary, spatial/data fusion, cinematic scale, and proof/detail treatments. Product/workflow scenes explore real product capture, spatial workflow, data proof, and human context. Every variant inherits the same must-show, truth, provenance and brand constraints, plus the reconciled Creative Council directives and rejection contract.

```bash
npm run media:studio -- explore ./tmp/creative-bundle.json ./tmp/exploration.json
```

The tournament therefore compares competing creative hypotheses, not merely stochastic variants of the same idea.

### Visual Observer packets

Before a candidate enters the jury, Fallen can produce a deterministic observation bundle. The observer verifies the artifact digest, probes media shape, samples evenly distributed frames, hashes every sampled frame, measures objective motion activity for video, and emits an objective editability receipt. Visual analyzers must cite the packet's artifact or frame hashes in any additional subject/composition/motion/continuity/brand/beauty receipt; receipts citing evidence outside the packet are rejected.

```bash
npm run media:studio -- observe ./tmp/candidate.json ./tmp/observation.json ./tmp/frames
```

This keeps the visual jury grounded in the exact candidate bytes it is judging.

Build a tournament inventory:

```bash
npm run media:studio -- tournament ./tmp/candidates.json ./tmp/tournament.json
```

Run the bounded Saban proof:

```bash
npm run proof:saban-fallen-tournament
```

## Visual Stage

Fallen now has a deterministic layered graphics surface above the legacy clip concatenator. A visual stage contains a virtual camera plus independently animated media, text, shape, geo, metric and timeline layers. Layers support local translation, scale, rotation, perspective, parallax and evidence state.

The stage compiler emits a self-contained browser surface with explicit `window.__evercraftRenderAt(seconds)` and `window.__evercraftRenderFrame(frame)` controls. A render worker can therefore request an exact frame repeatedly and receive the same composition rather than recording a wall-clock animation.

Evidence state is part of the scene graph. Modeled, inferred and synthetic visualization layers require source references, and the browser renderer visually distinguishes modeled/inferred/synthetic geo routes from observed/source-grounded routes.

Build a browser-renderable stage:

```bash
npm run media:studio -- stage ./tmp/stage.json ./tmp/stage.html
```

### World-intelligence compiler

A structured world-intelligence story can compile directly into a visual stage with real subject footage, an optional Evercraft set plate, a map plate, routes, tracked points, metrics and a timeline:

```bash
npm run media:studio -- world-intel ./tmp/story.json ./tmp/world-stage.json ./tmp/world-stage.html
```

This is intended for Week in Motion, TOWI, FAIE and other geography/time/scale-heavy stories where the visuals need to carry the explanation rather than sit behind typography.

## Evercraft Studio World

Week in Motion now has a canonical virtual headquarters instead of disposable backgrounds. The world schema fixes room identity, set-plate asset IDs, camera anchors, display geometry and permitted room-to-room transitions so episodes can revisit recognizable spaces without silently rebuilding the building every week.

The first world contains seven recurring rooms:

- Lobby
- Global Operations
- Product Gallery
- Research Lab
- Field Bay
- Proof Room
- Observation Deck

Display surfaces are named contracts such as `subject-wall`, `world-wall`, `ops-strip`, `hero-product`, `evidence-wall` and `receipt-wall`. Story content binds to those surfaces while the room geometry remains canon. A stable world digest lets later production receipts prove which studio layout an episode used.

Compile one room:

```bash
npm run media:studio -- studio-room ./tmp/global-ops.json ./tmp/global-ops.stage.json
```

Compile a room journey:

```bash
npm run media:studio -- studio-journey ./tmp/week-journey.json ./tmp/week-journey.plan.json
```

The journey compiler fails closed on room movements that are not in the studio transition graph instead of inventing new hallways or changing geography between episodes.


## Virtual Production Stage

Studio World room cards are useful for previews, but they are not the final Week in Motion grammar. Fallen's **Virtual Production Stage** compiles the canonical HQ into one continuous world-space so the camera and host can physically travel through it.

The compiler adds:

- one shared stage spanning multiple canonical rooms rather than concatenated room cards;
- an evidence-bound host performance layer from an approved image or alpha-video asset;
- mandatory host identity evidence and source references, with synthetic host identity rejected;
- host movement tracks that continue through room transitions;
- camera modes for host-follow, wide reveals and pushes into named display surfaces;
- room-local motion shifted onto the episode clock so screens and graphics wake up when the host reaches that department;
- looping performance plates for longer walkthroughs;
- preserved evidence state and provenance on the product screens inside the environment.

Compile a hosted episode:

```bash
npm run media:studio -- virtual-production ./tmp/week-episode.json ./tmp/week-production-plan.json ./tmp/week-stage.html
```

Prepare a real host performance plate before rendering:

```bash
npm run media:studio -- host-plate ./tmp/host-plate-prep.json ./tmp/host-plate.receipt.json
```

The host-plate path accepts an already-alpha source or chroma-keys an explicitly supplied performance recording into VP9 WebM with alpha, strips audio, hashes the input/output, and emits an identity/provenance receipt. This gives the studio a practical route for a real founder walkthrough without fabricating a likeness.

A beat may also mount a transparent foreground occlusion plate above the host. That lets architecture, desks, railings and door frames pass in front of the presenter while the canonical room remains behind them, creating a proper 2.5D set instead of a person pasted over a background.

The output is one Visual Stage suitable for the existing private Fallen Render Workers and distributed exact-frame renderer. Render completion still does not grant publication authority.

The production boundary is deliberate: Fallen can move an approved host reference through the world, but it will not fabricate a founder identity merely because a script asks for one. A real Week in Motion host pass requires an approved Jesse reference/performance asset or another explicitly licensed host asset.

## Visual themes

The Visual Stage carries a renderer-level theme contract instead of relying on scattered hard-coded CSS. Theme identity participates in the stage digest, so changing the visual system changes the reproducible render identity.

The canonical `evercraft-core-v1` theme uses the current Evercraft palette:

- Core Black: `#080B0B`
- Engineering White: `#F5F5F2`
- Titanium: `#B7BDC5`
- Champagne Gold: `#B79A56`
- Electric Ice Blue: `#4FB8FF`

Theme tokens drive stage background, primary and secondary text, metrics, evidence badges, map grids, observed routes, modeled routes, tracked points and timeline elements. Public-source evidence defaults toward Electric Ice; modeled, inferred and synthetic visualization defaults toward Champagne Gold.

Both the browser preview and private Chromium renderer consume the same theme contract. World-intelligence scenes and the canonical Evercraft Studio World opt into `evercraft-core-v1` by default.

## Distributed rendering

Visual Stage frames can be sharded across multiple private Fallen Render Workers. The planner creates exact, non-overlapping frame ranges; workers render only their assigned lattice slice; the coordinator retrieves each PNG through the worker's authenticated artifact endpoint, re-hashes the bytes locally, proves full no-gap/no-duplicate coverage, and only then assembles the master with FFmpeg.

A render job ID is separate from the shared asset scope ID. Multiple frame shards can therefore reuse one staged source-media scope instead of copying the same large footage once per shard.

Create a plan:

```bash
npm run media:studio -- render-plan ./tmp/render-plan-input.json ./tmp/distributed-plan.json
```

Run the coordinator:

```bash
FALLEN_RENDER_WORKERS='[{"id":"node-a","url":"https://renderer-a","token":"..."},{"id":"node-b","url":"https://renderer-b","token":"..."}]' \
  node systemia/media-studio/distributed-render-coordinator.mjs \
  ./tmp/distributed-plan.json ./tmp/master.mp4 ./tmp/master.receipt.json
```

The final receipt binds the stage digest, complete ordered frame-hash lattice, worker shard receipts, assembled MP4 hash, and explicitly leaves publication authority downstream.

## Architecture direction

1. **Understand**: sample source media, identify exact moments, people, products, locations and scene semantics.
2. **Remember**: maintain persistent series/brand bibles, identity fingerprints, canon and approved evolution.
3. **Direct**: turn intent into a storyboard, camera language, dialogue, performance direction and coverage plan.
4. **Generate**: compile provider-neutral production needs, then route only to verified departments that satisfy continuity, rights, provenance, timing and media-shape requirements.
5. **Reconcile**: compare generated assets against identity, canon, provenance and quality requirements before accepting them.
6. **Edit**: preserve scene-level regeneration and non-destructive versions instead of flattening the project too early.
7. **Render**: assemble deterministic platform-ready outputs with audio mixing, captions and delivery variants.
8. **Scale**: export bounded production needs to Saban, where independent guards verify continuity, identity requirements, voice, rights, provenance and timing before reconciliation.
9. **Distribute**: package only admitted outputs for Evercraft Clip and other authorized publishing lanes.

## Visual coverage rule

Fallen now treats named physical subjects as a coverage contract. If a brief says battleships, tanks, wildfire, aircraft, charging stations or another recognized concrete subject, the plan records whether that subject is actually represented by source media. Missing subjects produce explicit generation requests with minimum on-screen time and a prohibition on substituting generic typography. Documentary/source-grounded media is preferred for real-world events; synthetic material must remain labeled visualization rather than evidence.

## Next engineering slices

- Visual identity fingerprints from approved reference assets.
- Scene-level visual understanding and exact-moment selection.
- Provider-neutral image/video generation adapters.
- Voice generation, performance direction and voice-consistency verification.
- Music and SFX planning, ducking, stems and loudness normalization.
- Automated lip-sync and dialogue timing adapters.
- Multi-track editor UI and single-shot regeneration.
- Continuity QA that compares generated frames against the series bible before accepting them.
- Provider execution adapters behind the now-registered Saban production contract.
- Saban fanout for shot generation and variant exploration with deterministic post-generation reconciliation.
- ForensiScope ingest for long source footage and reusable scene retrieval.
- Kaidance scoring/music handoff and Evercraft Clip delivery.
- Metered API/MCP access, workspaces and reusable brand/series kits.

## Safety and provenance

Unknown rights produce a warning. Restricted assets fail closed. Synthetic shots remain synthetic in provenance. Fallen must not invent factual product claims simply because a commercial prompt asks for them. Series canon changes should remain explicit and reviewable.

## Release state

The current code is a source-stage engine with executable planning/rendering slices, deterministic continuity tests, production-admission tests, and a bounded Saban production proof. It must not be advertised as a publicly live end-to-end creative platform until deployment, provider execution and real media canaries are independently verified.
