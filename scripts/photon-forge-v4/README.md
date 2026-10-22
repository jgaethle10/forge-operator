# Evercraft Photon Forge V4 | WorldFrame Bridge canary

**Status: CPU software audition, not a verified GPU or customer-ready commercial.**

## Upgrade from V3

This repo adds a real triangle-mesh scene instead of manually projected 2D drawing primitives. The renderer consumes Evercraft World Engine's canonical `evercraft.world-engine.visual-frame.v1` frame shape and `evercraft.world-engine.geometry.v1` meshes; it checks the frame's SHA-256 digest against the **same stable-key JSON hashing algorithm** used by `systemia/world-engine/visual.ts` and checks actual canonical Node.js parity in an integration test. It rejects missing geometry/materials, unsupported textures/transparency/cameras, invalid triangles and tampered frame digests instead of silently guessing.

V4's original Photon fixture is a 3D-positioned seven-gate accelerator with physically dimensioned toroidal triangle meshes, machined vanes, longitudinal rails and a moving pitched/yawed camera. The software renderer uses triangle depth sorting, per-face directional shading, additive emissive edges, bloom and timed original VFX. This is *not* physically based GPU rendering, full volumetric lighting, ray tracing, correct per-pixel Z depth or measured hardware performance. The same output frame generated at an exact timestamp is deterministic.

## Running

```bash
python3 -m pip install -r requirements.txt
python3 -m unittest -v test_worldframe.py
python3 render.py --preview 4.9
python3 render.py --fps 30 --output ./Evercraft_Photon_Forge_V4_SILENT.mp4
```

Requires FFmpeg/FFprobe and Node.js for parity tests. Video defaults to 960×540 / 30 FPS / 300 frames / 10 seconds, silent. Actual tests and encode environment determine throughput; no GPU acceleration or hardware-verified render claims.

To render a *separately authored* World Engine visual frame to a standalone PNG, supply its canonical geometry assets and visual frame:

```bash
python3 render.py --frame-json ./frame.json --geometry-json ./geometry.json --output /tmp/frame.png
```

The adapter supports perspective cameras, untextured opaque pbr/unlit materials and triangles. It validates material references, camera and frame digests, and produces a separate per-image SHA-256 receipt. Unsupported features fail closed. Its lighting implementation is intentionally simpler than World Engine's full GPU target. 3D scene animation currently originates from a **Python-generated canonical-shaped fixture**, *not* an actual running World Engine snapshot; this bridge does **not** claim the native `compileVisualFrame()` function has executed. Cross-language digest parity is tested against the actual JavaScript stable-key hashing algorithm, but not against a live production snapshot. A later integration test should feed real frames from the owning World Engine runtime.

## Execution and authority truth

`worldEngineRuntimeExecuted:false`, `webgpuHardwareVerified:false`, `actualWorldEngineFrameIngested:false`, `productionQualityApproved:false`, `publicationAuthority:false`, and `audioIncluded:false` remain in the video receipt. Rendering is not publication approval.

Next gate: actual Node002 GPU detection + canonical World Engine frame generated in the running runtime + native WebGPU readback; verify correct lighting, shadow mapping, reflections, color management and multisample AA; route recognized camera/frame hashes into Fallen exact-frame output and Clip only after user sign-off. Do not permit software fallback to qualify as hardware execution.

## Commercial frame sequence intake (Evercraft-owned graphics only)

Photon Forge V4 now encodes ordered, externally supplied canonical WorldFrame packets through the existing owned CPU triangle rasterizer. This is a reusable World Engine to Photon Forge to Fallen seam, not an image-generation replacement, separate creative application, or customer-ready commercial.

Create sequence.json beside a frames/ directory:

    {
      "schema": "evercraft.photon-forge-v4.frame-sequence.v1",
      "fps": 30,
      "framePaths": ["frames/frame-000.json", "frames/frame-001.json", "frames/frame-002.json"]
    }

Each frame is a full evercraft.world-engine.visual-frame.v1 packet with a valid SHA-256 digest. Supply one shared JSON array of evercraft.world-engine.geometry.v1 geometries. Frame timeSec must equal the first time plus its 0-based index divided by FPS; ticks increase strictly; worldId stays constant. Missing frames, path traversal, duplicate paths, changed hashes, unsupported frame features, time drift, FPS mismatches and oversized inputs fail closed.

Example:

    python3 render.py --sequence-manifest /path/to/sequence.json --geometry-json /path/to/geometry.json --fps 30 --output /path/to/Evercraft_Studio_Audition.mp4
    python3 -m unittest discover -s scripts/photon-forge-v4 -p 'test_*.py' -v

The renderer produces a real silent H.264 MP4 and sibling .receipt.json with input hashes, canonical frame digests, source-time checks, decoded output frame count, SHA-256, and sampled pixel hashes. The test sequence is fixture-only; no images come from a generative provider.

A canonical-shaped frame with a valid digest is NOT proof that live World Engine executed. The receipt intentionally records originRuntimeUnverified:true, worldEngineRuntimeExecuted:false, webgpuHardwareVerified:false, masterQcApproved:false, publicationAuthority:false. CI success proves software behavior, not customer readiness or artistic quality.

Next production gate: capture live compileVisualFrame() output and authoritative producer receipt on Node002; verify native GPU pixels against the fallback; bind Graphics Command jobpack shot identity, visual/audio timecode and original Voice Foundry score in Fallen; perform founder-led full master QA and only then stage authorized Evercraft Clip distribution.


## Actual Evercraft World Engine producer (added on this branch)

export-world-engine-sequence.ts executes the existing EvercraftWorldRuntime, compileVisualFrame and verifyVisualFrameContract in systemia/world-engine/. It writes actual canonical frame packets, source/geometry bytes and snapshot/frame digest receipts. Photon Forge V4 consumes these owned frames, not ChatGPT image outputs.

Its built-in scene of three animated original 3D objects is an engineering fixture, not marketing art. To use an independently authored Evercraft World Engine definition and geometry array instead, run:

    tsx scripts/photon-forge-v4/export-world-engine-sequence.ts \
      --world-json /owned/scene/world-definition.json \
      --geometry-json /owned/scene/geometry.json \
      --output-dir /tmp/evercraft-scene --frames 60 --fps 30

    python scripts/photon-forge-v4/render.py \
      --sequence-manifest /tmp/evercraft-scene/sequence.json \
      --geometry-json /tmp/evercraft-scene/geometry.json \
      --output /tmp/evercraft-scene/owned-preview.mp4 --fps 30

World definitions must use evercraft.world-engine.world.v1 with a valid visual scene and perspective camera. Geometry is an array of evercraft.world-engine.geometry.v1 triangle assets. Runtime tick rate must match requested FPS. The bounded importer validates geometry IDs, indices, source sizes, references, and frame cadence. It does not invoke external image generators, paid providers, or automatic publication.

The producer receipt contains the authored input SHA-256 values, the original engine snapshot/frame digests, and exact producer name. Photon Forge supplies a separate encoded video/decoded frame receipt. The Actions integration test independently reimports the original producer's physical World Engine scene/geometry files, compiles them through the same native engine, encodes both paths and reconciles their hashes.

Provenance: engineWasExecutedInThisProcess:true describes this one compiler process only. It does NOT mean the hardware NextGen node ran or that a deployed commercial engine executed. External scene rights are unverified. The video is a silent software-rendered studio canary, not a reviewed commercial, GPU proof, payment evidence, or Clip release. Real product captures, audio mastering, founder quality review and separately authorized publishing are still required.
