# Fallen

Fallen is Evercraft's owned media creation engine for turning photos, video, audio and plain-language direction into editable media projects, commercials, shorts, films and episodic series.

The durable product boundary lives above any single foundation model. Fallen owns the project graph, story direction, asset identity, continuity, canon, edit decisions, provenance, render graph, receipts and future provider routing. Image, video, speech, music and SFX models are replaceable production departments.

## What works now

- Commercial, social-short, short-film and episodic story structures.
- Prompt-aware shot allocation.
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
