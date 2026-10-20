# Evercraft World Engine | Geometry-aware Camera Director

This is a reusable preflight for **any real World Engine scene**, not a battleship-specific image effect.

## Three working tiers

1. Native optical formats: one source World Engine scene can create independent view/projection matrices and original pixel renders for wide (16:9), square (1:1) and portrait (9:16). It does not produce one landscape MP4 and then crop it.
2. Actual geometry composition receipt: specify the **hero entity IDs** (for example a product, vehicle, ship, or building) and original GeometryAsset objects. Validate the source WebGPU plan digest. For each chosen 3D mesh, project its eight conservative local AABB corners through its render-plan modelMatrix and the exact viewProjectionMatrix, measure visible bounds and on-screen size, and record a hash-bound analysis and frame plan digest. Background environment meshes are not treated as the subject.
3. Automatic bounded orbit candidates: for an orbit camera, try a deterministic set of reasonable 3D distances and aiming points. Compile real World Engine frames for opening/middle/closing of a short 0.5-second proxy take with the same full camera sweep. Select the candidate that improves the compositional measurement, then compile and actually render the full 4-second shot with that distinct camera.

Use the \`auditWebGpuHeroFraming({plan,geometries,subject})\`, \`auditSequenceHeroFraming\`, and \`autoFitOrbitCamera\` functions under \`systemia/world-engine\`. Invalid source GPU digests, missing/duplicate subject IDs, unsupported camera type and unbounded candidate values fail closed.

## What this can and cannot prove

- Grounded: optical projection, declared scene geometry bounds, coverage, camera-center offset, out-of-frame warnings, exact World Engine world/plan lineage.
- Not grounded: photographic appearance, hidden-surface visibility, real-world geometry accuracy, historically faithful reconstruction, collision/ship fluid dynamics, human subject tracking, quality of the soundtrack, clearance of brand or music rights, suitability as a customer commercial.
- AABB projections are deliberately **conservative**. They can overstate coverage for sparse or rotated shapes and cannot determine whether a subject is blocked by another object. Follow-up pixel review remains mandatory.
- The fitter tests only a controlled subset of orbit distances and focus positions. It does not create choreography for unrestricted cameras, and it does not make up parts of objects that were not in the source mesh.
- Output comes from the original shader/geometry pipeline. Early review is at 640×360, 480×480 or 360×640, **not a native 1080p master**.
- The fitter never changes publicationAuthority, customer-approval authority, source rights or release QC. All remain human-gated.

## Cinema + education + commercial relevance

An educator can include the aircraft as hero and exclude the entire sky; a product commercial can track the product and ignore its studio background; a historical reconstruction can frame the declared archaeological model without treating the scene as verified history. All use the same geometry-aware analysis and World Engine camera system.

The original geometry-aligned battleship film is a technical test of this process, not a finished historical or client-advertising product.

### Engineering proof

The \`World Engine native three-format cinema\` CI runs three original WGSL GPU-to-H.264 jobs with camera fitting, shadow/PCF pixel proof and receipts. Full World Engine regression and separate Forge checks remain required. A passing ffprobe/CI gate is not an artistic sign-off.

Tracked in draft PR #1477 and Graphics Department mission #1450.
