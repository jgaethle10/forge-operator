# Evercraft Worlds | First original GLB in Mossmere
The file `public/worlds/assets/mossmere-weathered-stone.glb` is original 3D geometry authored for the Mossmere pond and admitted through the new owned GLB importer. It is a 3,016-byte glTF2 binary, 62 source vertices and 120 triangle faces, packed with vertex normals and a matte limestone base material. Rights are declared in the adjacent reviewed manifest with fixed SHA-256 `4ba9870f7f1c376b205cb5d1f697ba1440266c147116a6b572b3a78b21c59694`.

The browser loads only this named asset from its same-origin `/worlds/assets/` folder, validates rights and SHA-256 using WebCrypto, decodes the bounded GLB into a GPU mesh and uses it for 20 individually placed pond stones. If the asset is unavailable, it falls back to spheres and records this in `window.__worldsAssetTelemetry`; it never loads unapproved external assets. Original source geometry is authored as a stylized weathered boulder, without textures or third-party 3D files.

Verification:
- `node --test tests/worlds-owned-glb.test.mjs tests/worlds-owned-scene-asset.test.mjs`
- Worlds browser QA must assert the verified GLB loads on desktop and phone emulation.
- A green compatibility test is not artistic approval: compare the pond before/after, judge composition and record frame time on real Chromebook/Safari devices before promoting to live. The current shader still uses simple diffuse lighting, not full PBR.

No backend migration, cloud-world save/schema change, Caddy edit, paid dependency or live Penguin service change.
