# Evercraft | Photon Forge V3 cinematic graphics canary

An original deterministic, **10-second** procedural sci-fi sequence. It is a step toward improving Evercraft's cinematic production toolchain, not a production-ready replacement for World Engine or Fallen.

## What changed from V2

* Perspective-projected camera flying down a metal accelerator tunnel. Five independently articulated, mechanically segmented rings, structural rails and indexing elements.
* Layered cyan/violet emitters, sparks, radial laser convergence and animated energy rails.
* Multipass controlled bloom, atmospheric star field, mechanical surface and typography layers.
* A timed shockwave and clean Evercraft reveal, with **no audio**, as the previous scratch soundtrack did not meet the quality bar.
* Exact-time, repeatable frame renderer plus real H.264 video export, verified by FFprobe and SHA-256 output receipts.

## Run

Requires Python 3, NumPy, OpenCV, Pillow, FFmpeg, FFprobe. No online keys or external footage.

```sh
python3 render.py --preview 4.9
python3 render.py --fps 30 --output ./Evercraft_Photon_Forge_V3_SILENT.mp4
python3 -m unittest -v test_render.py
```

Output video is 960×540, H.264, 30 FPS, 300 frames, **10.0 seconds**, with a separate JSON receipt. The final export of October 21, 2026 decoded and passed FFprobe stream/frame verification. Main MP4 belongs next to its receipt if testing the completed export.

## Honesty and safety boundaries

* This V3 canary uses **CPU perspective projection (2.5D) and software compositing**. It is **not** an actual native WebGPU/Blender scene, ray traced film, GPU shader verification or volumetric ray march.
* Visual quality remains subject to human review. Static tests and hashes prove a renderer executes and reproduces frames, not that it is cinematic or commercially approved.
* The stage is a synthetic visualization. No third-party footage, paid provider calls or voice assets are used.
* `publicationAuthority:false`, `masterApproved:false`, `worldEngineIntegrated:false` remain explicit in the receipt. No auto-publishing or real-world actions.

## Evercraft integration next

This source stays an experimental canary. Graphics Command / Megazord PR #1498 and Photon Forge V2 draft PR #1540 are the relevant orchestration layers. The necessary production work is connecting **World Engine canonical geometry + cameras + render frames** to a real GPU renderer on a verified Evercraft node, preserving shot IDs, frame digests, device receipt and rights, then feeding the frames and eventually approved original sound to **Fallen**, **Master QC**, **Visual Desk**, and **Clip**. Do not promote V3 simply by renaming a status flag.

Recommended acceptance gate for next engine adapter: 30 FPS exact-frame playback, native GPU readback evidence, camera/geometry receipts, frame/hash timeline matched to the same published master, approved art-direction review, and explicit user publish approval.