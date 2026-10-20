# Fallen optical materials canary · 2026-10-20

**Engineering status:** Cycles material renderer verified; commercial transition creative approval **BLOCKED**.

RC12's flat perspective panels and RC13's VTK rasterized strands did not meet the Relay launch standard. Two local screen-space optics studies were also rejected after visual review.

This branch establishes an independently executable material test:

- Blender 4.0.2 Cycles CPU path tracing under GitHub Actions.
- Closed bevelled glass geometry (0.24 unit thickness, 1.49 IOR, full transmission, 0.055 roughness).
- Softbox illumination, controlled camera movement and 3 actual PNG render views.
- PNG hashes and receipt verified in passing workflow run 39454905936.
- Synthetic printed document only. No private Relay information, footage, or logo is included.

The first overhead material test was visually rejected as plastic-like. The oblique-camera test shows actual depth, material refraction and edge reflections, but still looks too pale and noisy to use in a high-end commercial. **Three separate successful static frames are not a motion film.** The commercial remains unchanged; no original music or licensed music was modified.

## Further acceptance gates

1. Re-run the exact same camera with and without glass to isolate material-caused pixel changes from camera parallax.
2. Upgrade sampling and physically accurate denoising without erasing text.
3. Improve film lighting, contrast and reflected environment.
4. Produce a contiguous full-resolution 3-second shot entering from actual authorized contract footage and landing on unaltered Relay UI, with frame evidence.
5. Founder must explicitly approve any merge into a release commercial.

No final RC14, publication approval, KSS integration or end-to-end premium launch claim from this change.
