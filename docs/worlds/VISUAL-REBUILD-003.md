# Evercraft Worlds | Asset Admission 003

This is the first **rights-gated offline asset importer** for actual 3D art. It converts one static glTF 2.0 binary (GLB) triangle mesh to WebGL2-compatible nonindexed arrays and maps material factors to the canonical Systemia World Engine PBR material structure. It is not a complete glTF scene loader or PBR renderer. No public scene integration occurs in this PR.

Limits: <=8 MB, <=100,000 source vertices, <=300,000 indices, exactly one mesh/primitive with float POSITION+NORMAL, embedded BIN, optional 16-/32-bit index buffer, opaque untextured material. Reject external URIs, textures, images, animations, skins, extensions, sparse accessors, nonfinite coordinates, invalid indices and unsafe buffers.

An operator must supply an explicit rights manifest (schema evercraft.worlds.asset-rights.v1) declaring asset ID, SHA-256, rights holder/creator, source, supported license and approved_for_worlds review. CC-BY-4.0 requires attribution and commercial licensing requires evidence. A digest check proves bytes match the manifest, not the underlying legal claim.

Commands:
- node --test tests/worlds-owned-glb.test.mjs
- node scripts/inspect-owned-worlds-glb.mjs MODEL.glb RIGHTS.json

Next: actually author high-quality original GLBs, ingest through this checker, bind mesh+material to the browser renderer with proper shading/LOD, then compare screenshots and device GPU performance before replacing primitive scenery. No Base44 or external hosted asset runtime.
