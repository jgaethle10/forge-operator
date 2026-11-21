# Kennedy Finger Snap | Live Blender Evidence | 2026-10-28

**Status: KINEMATIC CANDIDATE. NOT ART APPROVED.**

Actual [Blender Lookdev run 40752476088](https://github.com/jgaethle10/forge-operator/actions/runs/40752476088). The build created real 3D poses, extracted 120 Hz pose-bone-tip data, passed the snap-performance gate, and held the separate character-quality gate.

## Verified measurements from real Blender pose data

- Thumb/middle minimum separation: **0.0006 m** (0.63 mm in solver key).
- Middle-finger release gap in solver key: **0.05521 m** (5.5 cm).
- Middle-finger key-pose travel: **0.04897 m** (4.9 cm).
- 120 Hz first contact at **0.575 s**.
- 120 Hz first release at **0.616667 s**.
- Wrist-relative middle-finger travel through the first-release interval: **0.0807 m** (8.1 cm); this measurement uses interpolated frames and differs from key-pose travel.
- Maximum relative fingertip speed **2.374 m/s**.
- Scheduled Foley timestamp offset **0.0083 s** (8.3 ms). This is NOT an audio-waveform verification.
- Kinematic issues: none; creative approval: false.

## Not finished

The current rig is still an engineering mannequin and its hand mesh does not yet have believable full finger articulation. Bone-tail proximity alone cannot verify visual finger-surface contact. Hair, face, outfit, expressive deformation, singing, sound mix, and cinematic character design are not approved. Art gate status intentionally remains HELD.

## Defects corrected

1. Original thumb-middle gap was 29.9 cm despite large wrist movement.
2. The first contact solution over-opened the release to 13.9 cm.
3. Coarse release search compared against an outdated thumb keyframe.
4. The corrected continuous pose solver found measured contact and a smaller 5.5 cm release.
5. Foley marker was aligned to observed first release.

Next artistic acceptance: original high-quality Kennedy character model against the approved reference; proper five-finger skin deformation and facial controls; close-up snap that visually reads; sung original track with verifiable provenance; portal bedroom scene. No automatic approval, merge or publishing.
