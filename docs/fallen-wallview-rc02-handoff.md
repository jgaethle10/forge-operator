# Fallen Studio Wall View RC02 | Systemia engineering handoff

**Stage:** internal feature candidate. Not merged into Fallen RC1.0.1, not deployed, and not approved for commercial quoting. Source work must pass canonical Systemia admission before native editor integration or public release.

## Existing architecture, not a new app

- Source system: original Evercraft Wall View RC01 (schema `evercraft.fallen.wallview.v0.1`), with wall elevations, four-wall selection, editable concept coordinates, furniture object placement, and collision warnings.
- Existing Forge import boundary: `systemia/world-engine/fallen-geometry.ts`, `geometryFromFallenAsset(asset)`, accepting `evercraft.fallen.geometry.v1`.
- New internal adapter candidate: `wallview-fallen-adapter.mjs`, exporting `projectToFallenAssets(project)`. Converts room-local placements into `right_handed_y_up` meter-based 3D cuboids with indexed triangle meshes, UVs, outward normals, stable IDs and owned-source provenance.
- Fixtures remain explicit reservation rectangles, not structurally cut door/window holes.
- Nonzero rotations are **warnings**, not applied rigid-body transformations. Never present concept clearance as safe mounting/construction geometry.

## Tested artifact

`evercraft_fallen_wallview_rc02_source.zip`, supplied via the internal Systemia/ChatGPT handoff, SHA256:

`99e7eba13c2df8036949b4b2690b39f8103ef8232eec41b9bb45d6cc329d06e7`

Adapter file SHA256:

`f6117b4510307b8c1ad368f27f67643c30d80108e3946263f96584dfc014cd1b`

Contained sources: offline `index.html`, `wallview-core.mjs`, `wallview-fallen-adapter.mjs`, both Node test files, README, checksum manifest. **Local tests:** 18/18 pass (12 RC01 geometry plus six RC02 adapter tests). No exact GitHub source module committed by this documentation handoff; preserve this distinction.

## Required integration sequence

1. Systemia canonical admission and deduplication against existing Gravity RC013, Fallen RC1.0.1 and shared world-engine source. This document is an engineering handoff, not an admission receipt.
2. Import the validated original source modules to the world-engine area on a reviewed source branch. Avoid competing independent renderers.
3. Run `geometryFromFallenAsset(asset)` against each generated asset and verify the receipt, tangents and geometry digest; add direct engine integration tests.
4. Replace schematic perspective with native scene selection, calibrated transforms, undo/redo, and accurate camera/wall clipping. Test rotated-volume collision and explicit door/window openings.
5. Perform independent desktop, mobile WebKit and **physical iPhone Safari** acceptance. Require real survey before any EPS quote.
6. Only after release review, attach any permitted EPS estimator and central Evercraft Payments quote path. No payment link or revenue claim exists for RC02.

## Governance / GitHub recovery

Oct 14 authenticated GitHub API returned working login, repository read and write permissions. The previous account-suspension 403 is no longer observed. GitHub Support case #4838137's written disposition has not been independently confirmed.

The restored repository is generating multiple CI jobs on new PRs. This branch intentionally stages only an internal handoff with `[skip ci]` and **does not open a PR, publish a release, trigger external dispatch, or alter production**. Review CI fanout before first code PR.

**Next owned action:** canonical Systemia admission, reviewed placement of source modules, native world-engine importer test, and physical-device acceptance. The asset must not be called shipped merely because this document is in Forge.

## RC02.1 private QA update, October 15, 2026

- **Current private QA artifact:** `evercraft_fallen_wallview_rc02_1_private_qa.zip`, SHA256 `f11e31519fe1feb4c0c016866c01460041e5ea348482f7dedf46b643adefb00f`.
- Stored in private Evercraft Library under `/Evercraft/Fallen Studio/Wall View RC02/`, not in this public repository.
- Locally verified Node tests: **21/21 passing**, including four-wall outward-facing triangle winding, nondegenerate UVs, and conservative unapplied-rotation warnings. ZIP integrity and per-file checksum verification also passed.
- Native integration test `world-engine-fallen-import.test.mjs` prepared, but **NOT executed against Forge**; no native editor, 3D renderer, site measurements, payments or public product release verified.
- **Canonical admission blocker:** connected Systemia `systemiaMissionGate` currently whitelists only `evercraft-ecosystem-loop-closure-v1` and `systemia-one-organism-orchestration-v1`; this existing Gravity/Fallen mission isn't eligible for that automatic route. Its FounderDirectiveDraft is not an admission receipt. Route through the authorized canonical Systemia preflight rather than forging a new mission or claiming an agent dispatch.
- Never commit private candidate source to this public repository without owner approval of public code disclosure. A GitHub source branch is publicly visible even when no PR is opened.
- Source handoff remains read-only, safe for review and separate from production deploy.
