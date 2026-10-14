# FALLEN visual case bridge (RC13)

Status: **internal contract / QA candidate**. This handoff imports original FALLEN Global Experience Lab RC13 `fallen.visual-case.v1` response and sports JSON exports into a deterministic, sealed presentation data contract. It does **not** deploy a viewer or connect a live feed.

## Inputs and outputs

- Input: RC13 case JSON with a `response` or `sports` sector, source reference, timestamp string, evidence classification and controlled scene geometry.
- Output: `evercraft.world-engine.visual-evidence-handoff.v1`, retaining original screen points, normalized [0,1] positions, classification, SHA-256 digest and explicit no-authority flags.
- Import: `importFallenVisualCase(caseJson)` from `systemia/world-engine/fallen-visual-case.mjs`.
- Verification: `verifyFallenVisualHandoff(handoff)` checks integrity and *claim boundaries*. It does **not** verify real-world facts or publication permission.

## Release and integration boundaries

1. Screen coordinates are **RC13 SVG design pixels**, not longitude/latitude, meters, football yards, camera tracking or authoritative world positions. A future scene adapter requires a separately verified coordinate transform, unit proof and source alignment.
2. Even if a case self-labels as `observed`, that is only an *unverified input claim*. The handoff preserves it but keeps `source_rights_state: unverified` and `release_state: human_review_required`.
3. No weather, flood, emergency, sports film, camera telemetry, physically calibrated machinery, league tracking or real-time facility location is accessed by this adapter.
4. No publication, emergency response, simulation, payment or coaching authority is conferred. Systemia approval, provenance review, data rights, identity, and independent release QA remain separate.
5. This bridge lives in the existing World Engine/Fallen workflow. **Do not create a duplicate graphics runtime.** A native renderer consumer can follow later after approved scene/motion integration.

## QA

This test lives under the existing World Engine GitHub Actions glob (`systemia/world-engine/*.test.ts`):

```sh
npm run test:world-engine
```

For standalone tests with Node 22:

```sh
node --experimental-strip-types --test systemia/world-engine/fallen-visual-case.test.ts
```

Test cases cover deterministic object/string input, evidence labels, screen-space boundaries, sports routes, bad coordinates, duplicate IDs, tampering and release-claim controls.
