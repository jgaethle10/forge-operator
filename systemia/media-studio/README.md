# Evercraft Media Studio v0

Evercraft Media Studio is the first executable slice of an Evercraft-owned media creation engine.

Input: photos + videos + a plain-language prompt + optional brand, CTA, style, audience and rights metadata.

Output: structured story plan -> normalized shot clips -> assembled MP4.

The durable product boundary sits above any single foundation model. Evercraft owns the project schema, story compiler, asset graph, continuity rules, edit decisions, provenance, renderer, cost routing and future provider-selection layer. Image, video, voice and music models remain replaceable camera departments.

## What works in v0

- Commercial, social-short and short-film story structures.
- Prompt-aware shot allocation.
- Image and video inputs.
- FFprobe metadata inspection.
- FFmpeg normalization and MP4 assembly.
- 9:16, 16:9 and 1:1 output.
- Basic push-in movement for stills.
- Rights and provenance tracking.
- Hard rejection of assets explicitly marked restricted.
- Explicit generation requests for missing or optional synthetic coverage.
- Deterministic tests for the story compiler.

## Requirements

- Node.js
- repository dependencies installed
- ffmpeg and ffprobe available on PATH

## Commands

npm run media:studio -- plan systemia/media-studio/example.project.json ./tmp/plan.json
npm run media:studio -- render ./tmp/plan.json ./tmp/output.mp4
npm run media:studio -- build systemia/media-studio/example.project.json ./tmp/output.mp4 ./tmp/plan.json
npm run test:media-studio

## Next build slices

1. Visual understanding: sample frames from video, build contact sheets, identify exact moments and scene semantics.
2. Generative coverage: provider adapters for image-to-video, text-to-video and image generation that resolve generation requests without binding the project format to one vendor.
3. Audio: script and voiceover planning, TTS adapters, licensed music, ducking, captions and loudness normalization.
4. Continuity: people, product and location identity, object continuity, color matching, camera direction and synthetic-shot consistency.
5. Editor UI: upload, prompt, storyboard, editable timeline, single-shot regeneration, provenance and per-shot cost.
6. Commercialization: metered usage, reusable brand kits, agency workspaces, API/MCP access and multi-platform exports.

## Safety and provenance

Unknown rights produce a warning. Restricted assets fail closed. Synthetic shots remain marked synthetic in project provenance. The engine must not invent factual product claims merely because a prompt asks for a dramatic commercial.

## Release state

This branch is a source prototype. It must not be advertised as a live public Evercraft capability until deployment and live verification are complete.
