# Evercraft Laser Foundry | Original Cinematic Light Show

**Status:** Visual R&D master, human-review required. Not live concert footage. No publishing authority or deployed production claim.

A choreographed original 12-second laser visualization with stage architecture, moving-head emitter housings, light-beam and bloom compositing, haze cues, scenic floor light, rotating aperture, five sequential narrative moments, and a final Evercraft identity lockup. No third-party imagery, models, downloaded textures, synthetic customer data, or external imagery are used.

## What is genuinely implemented
- Pure Python, NumPy, OpenCV, Pillow and FFmpeg procedural raster rendering, not Blender, hardware GPU, native World Engine 3D, volumetric path tracing, physics-based light scattering, or live DMX show control.
- 360 unique authored motion frames, H.264 at 30 FPS with full 12-second file verified by FFprobe.
- Story-first 9:16 layout and 16:9 widescreen layout; independently authored camera compositions with safe title areas, not merely cropping a landscape image.
- **Two distinct reproducible profiles:** (1) fast review canvas at 540×960 / 960×540, upsampled to delivery resolution, and (2) `--native-output` to calculate original optical layers directly at 1080×1920 / 1920×1080 pixel resolution. Both remain CPU raster light-art, not real native WebGPU 3D. Do not confuse a large delivery file with physically accurate volumetric lighting.
- Deliberately silent source; Story creators can choose licensed platform music. No commissioned/final score is asserted.

## Reproduce
```bash
python -m pip install numpy opencv-python-headless Pillow
python -m unittest -v test_laser_foundry.py
python laser_foundry.py --format story --output Laser_Story.mp4
python laser_foundry.py --format wide --output Laser_Wide.mp4
python laser_foundry.py --native-output --format story --output Laser_Story_FullResolution.mp4
python laser_foundry.py --native-output --format wide --output Laser_Wide_FullResolution.mp4
```

The output is only an engineering/creative study; exact color and source fonts depend on environment. The original output receipt and contact-sheet QA live in the downloadable evidence bundle. The existing World Engine native GPU pipeline has a separate provenance and validation lane. Future integration is a source ownership step, **not evidence that native 3D GPU hardware executed in this result**.

## Creative QA from first rendered motion
Stronger performance narrative than repeated data-constellation canaries. Remaining deficits: beams are camera-space composited, not physically volumetric with true geometry shadows/reflection; no true particles in 3D; no calibrated laser optics; no professional original sound master. These are not yet the user's commercial-quality floor.