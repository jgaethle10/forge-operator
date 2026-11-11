# Evercraft Visual Engine | Authored Asset Pipeline

**Status:** Canonical glTF mesh/material/texture/LOD ingestion bridge implemented. This is not a cinematic-quality acceptance or a finished artist-produced model.

## Functionality

The module systemia/visual-engine/gltf-asset-pack.mjs imports a bounded glTF 2.0 JSON/BIN pair or parses binary GLB 2.0 with parseGlbV2. It reuses the canonical Fallen Geometry importer for generated or authored tangent space, validation and lineage receipts. It produces canonical World Engine geometry, PBR material definitions, texture assets, LOD assignments and tamper-evident SHA-256 receipts.

Supported: triangle primitives, FLOAT32 position/normal/UV and optional tangent accessors; UINT8/UINT16/UINT32 index accessors; interleaved byte strides; base color, normal, metallic-roughness, emissive and AO textures; compatible texture wrapping/filtering; composited ORM channels; explicit distance-based LOD by mesh index.

There is no hidden network fetching or remote rendering. External URIs, unknown/restricted rights states, unsupported glTF extensions and source mismatches fail closed.

## Contract and limitations

- A trusted first-party image decode worker must supply source-image RGBA pixels, exact dimensions and the SHA-256 of the original embedded compressed image bytes. Source hash matching identifies the compressed input but DOES NOT independently prove the decoded pixels match it. The production decoder and independent source-to-pixel validation stage are a separate next gate.
- glTF nodes, hierarchical transforms, animation, skins, morphs, compression and vertex color are NOT imported. This is a mesh-resource importer, not a complete glTF scene player. Authored placements must be explicitly mapped into World Engine. Unsupported vertex attributes are rejected rather than discarded silently.
- Inputs are expected to be right-handed Y-up meters. There is no implicit conversion.
- Default import budget is 750,000 source vertices and 128 MiB decoded texture memory; limits are adjustable downward per job. No source mesh decimation occurs.
- The importer builds its own canonical IDs, imports materials per primitive, hashes assets, and provides selectGltfLod(bundle, distance) with explicit thresholds. No automatic LOD quality guarantee is implied.
- Rights and licensing provenance are asserted by the authorized intake caller, then bound into receipts. Rights assertions are not independent proof of legal permission.

## Verification

Run:
  npm exec --yes --package=tsx@4.20.6 -- tsx --test systemia/visual-engine/gltf-asset-pack.test.mjs

The tests validate actual import of an embedded glTF/GLB fixture, tangent/multi-material/normal/ORM planning, LOD selection, resource budgets, provenance and malformed-input failures. They also compile a textured renderable into the existing World Engine WebGPU rendering plan.

## Why this matters

The user rejected the placeholder aircraft, flat water and oval clouds on November 9. More procedural polygons will not solve the core problem. This bridge makes authored high-detail content an option without replacing World Engine or Fallen's provenance pipeline.

**Cinematic launch gate is still BLOCKED.** The next work requires:
1. A rights-verified high-detail aircraft asset and honest source provenance.
2. Trusted production PNG/JPEG raster decoding tied to source bytes.
3. Unlit and PBR rendered turntable of the actual authored asset, then cinematic flyover.
4. Better owned sky/ocean, realistic reflections and shadows, atmospheric depth, then hardware-device performance.
5. Founder visual acceptance of real frame output, not just CI success.
