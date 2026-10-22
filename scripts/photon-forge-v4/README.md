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