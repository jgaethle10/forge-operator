# Fallen continuous Cycles optic benchmark | 2026-10-20

**Material/render-engine acceptance: PASSED. Cinematic creative acceptance: BLOCKED.**

## Verified animation evidence
- GitHub Actions: https://github.com/jgaethle10/forge-operator/actions/runs/39457499833
- 60 SHA-256-verifiable **consecutive** Blender Cycles CPU frames. At 20 fps they form a three-second moving-camera source, not three still frames with interpolation.
- Raw 320 × 568, 10 path-tracing samples per pixel, 145.95 sec wall clock; preview upscaled 640 × 1136 only for phone compatibility. Upscaling adds no image detail.
- Closed biconvex optic, index of refraction 1.49, actual transmission and 3D camera motion above a **synthetic** printed-contract scene.
- Same final camera, materials and lights **with and without lens**. Mean RGB difference was 28.84 levels; 47.62% of pixels changed by more than 15 in at least one channel. This is optical-material causality, **not** visual quality.
- A short preview was exported with a three-second excerpt of the existing Relay music. This preview is **not the commercial**. The source is still the underlying third-party Mixkit-licensed recording. No music ownership claim.

## Creative rejection
- The lens reads like a traditional magnifying glass, not a cinematic physical-to-digital transformation.
- It neither assembles actual Relay UI elements nor ends with the working light Relay design. No marketing claim is allowed.
- Strong high-frequency grain on the lens (source frame 30, ROI x=60..280 and y=195..365); a 5-pixel median-filter residual check yielded 34.92 gray levels versus a provisional maximum of 12.00. This is **one source-specific engineering QA metric**, not a universal perceptual score.
- Spatial denoising alone smears document text. Denoising output must not be called a native high-sample render.
- Basic image/sample extrapolation suggests a 1080x1920, 30 fps, 40 samples shot could take multiple hours on comparable CPU. Actual performance could differ. GPU/hybrid benchmarking needed before production.

## Next production gate
1. Develop a **source-matched cinematic camera transition** that starts from the verified live-action contract plate, rather than a detached standalone glass lens.
2. Reserve actual Cycles / ray-traced geometry for a small, meaningful optical interaction, with a fast compositor responsible for final-resolution typography and genuine light Relay UI pixels.
3. Benchmark hardware-available acceleration under identical visual and hash QA. Do not infer Node002 GPU access from general workstation readiness; verify hardware and execution permissions.
4. Enforce temporal stability, source readability, phone safe zones, optical-material physics and the actual product reveal as **independent** QA gates.
5. Founder must approve a three-second final-quality transition before merging it into the original Relay film.

## Release protection
RC11 footage, sound and light UI are unchanged. No RC14 release, real film render, final music master, native KSS handoff, customer disclosure or publication is claimed. Draft PR remains unmerged.
