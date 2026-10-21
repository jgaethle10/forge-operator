# Evercraft World Engine | Atmospheric Depth RC01 (October 19, 2026)

This is a rendering change to the existing owned World Engine WGSL/PBR pipeline, not a poster overlay or a new application. It is designed for **synthetic, clearly disclosed 3D scenes**, especially world-intelligence, industrial visualization, and cinematic environment plates. It does not produce photoreal explosions, new assets, license footage, grant publishing rights, or claim actual weather conditions.

## Scene interface

Add `atmosphere` to a normal `evercraft.world-engine.visual-scene.v1`:

```json
{
  "atmosphere": {
    "color": {"r":0.65,"g":0.72,"b":0.8},
    "density": 0.08,
    "startDistance": 2,
    "heightFalloff": 0.14,
    "referenceHeight": 0
  }
}
```

These values are in world units and intended as creative controls, NOT atmospheric measurements. World Engine validates finite/color/range values and carries this optional definition through the digest-bound visual-frame and WebGPU-render-plan records. No atmosphere leaves legacy data records unchanged. `density:0` is neutral.

Owned WGSL now applies Beer-Lambert-style distance transmittance with exponential thinning above a reference altitude, after the existing PBR-lite light calculation. It does NOT fog unlit materials because readable UI panels, overlays, and source labels need to remain legible. Depth clear color is not silently changed. Actual browser GPU conformance proves the baseline unfogged pixel and a second fogged pixel from the same owned shader; software adapters do not count as hardware.

## Validation

- `npm run test:world-engine`: optional frame/plan contracts, tamper rejection, unsafe input bounds, zero-density compatibility, and shader contract tests.
- Existing `.github/workflows/world-engine.yml` runs runtime, proof, Saban review.
- Existing `.github/workflows/evercraft-browser-worker.yml` runs a **native Chromium/WebGPU shader compile and pixel readback** via `npm run proof:webgpu-reference-frame`. The runner must observe the fogged pixel change, not just source-code patterns.
- Actual production-quality beauty, motion, hardware GPU performance, desktop/mobile art-direction approval, texture quality, and source truth remain UNPROVEN until their dedicated evidence exists.

## Promotion boundary

Do not claim a cinematic finished asset from passing a shader test. Next: camera-motion choreography (tracking, orbit, crane, subject lock) and a true world-space environment canary with actual geometry, lighting, material evidence, audio and multi-frame master export. Review on desktop and mobile. Founder approval and Evercraft Clip release are separate.

Related: Graphics Department #1450, Fallen cinematic #1443, action finishing #1452, source capture #1449.
