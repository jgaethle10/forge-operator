# Evercraft Living Intelligence | Mission Observatory

**Status:** review-only prototype, synthetic data, no deployment authority.  
**Systemia directive:** evercraft-living-intelligence-mission-observatory-20261014  
**Systemia record:** FounderDirectiveDraft / awaiting_canonical_admission.

## What it is

A cinematic constellation that shows work emerging from a customer problem. It reuses the existing Evercraft Visual Desk public tree rather than creating a competing application. This first sample illustrates an oversized-file delivery problem in six stages: intake, context, choreography, execution, verification, delivery.

Opening the page in a local web server renders a deterministic, interactive replay. The motion is compelling but **not** evidence of a live worker, completed file transport, validated payment, shipped product, or commercial readiness.

## Prototype assets

- index.html: responsive canvas observatory with a six-stage navigation, play/pause, speed, restart, scrubber, event detail, counter HUD, reduced-motion respect.
- scene.mjs: stable example event stream with source identifiers, evidence states, directed dependency graph and fail-closed validation.
- systemia/visual-desk/mission-observatory.test.mjs: negative assertions for duplication, ordering, source links, evidence upgrade and parent dependencies.

## Preview

From repository root:

    python3 -m http.server 8080 -d public

Then open /visuals/mission-observatory/ at localhost:8080.

Run the tests:

    node --test systemia/visual-desk/mission-observatory.test.mjs

## Integration acceptance gates

1. Canonical Systemia admission, mission and event-schema authority with deduplication receipts before integration.
2. A read-only authorized event adapter for MissionOrganismState, ExecutionCheckpoint, PipelineReceipt, and the actual architecture reconciler. No arbitrary command execution, secrets, raw personal data, or direct agent dispatch via the visual layer.
3. Every event keeps one of: synthetic, declared, observed, receipted, inferred, modeled, with source refs; never display a fixture as production.
4. End-to-end event delivery, consumer receipt, freshness, data minimization and replay timestamps are separately validated.
5. Chrome, Safari/iPhone performance and reduced-motion accessibility, visual QA, native Fallen exporter integration and founder acceptance.
6. Commercial CTA, verified checkout, and real proof of fulfillment only after the relevant release and payment gates pass.

This is an original visual treatment inspired by the feeling of seeing cognition organize itself; it does not copy the source video's assets.
