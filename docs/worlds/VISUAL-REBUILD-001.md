# Worlds visual rebuild | first atmosphere pass

## Current truth
The publicly reachable Mossmere WebGL2 projection is functional but visually schematic. Most static environment geometry uses flat-color cuboids, cylinders and low-polygon spheres. It does not have an authored asset library, PBR material pipeline, shadow maps, authored terrain, skeletal animation, sound design or cinematic composition. Public TLS and cloud-world CRUD proofs verify transport and persistence, **not art quality**.

## This change
- Replaces the flat frame clear with a fullscreen procedural sky, tied to actual camera yaw/pitch and FOV.
- Distinct day/sunset/night color grading, atmospheric sun disk/glow and sparse view-anchored stars.
- Matches the existing distance-fog horizon palette to reduce harsh horizon seams.
- One extra WebGL2 draw per frame; no texture downloads, new persistence schema, cloud writes or external dependencies.

## Performance and review gate
Do not promote visual fidelity claims from source tests alone. Run the existing real browser WebGL2 smoke, inspect daytime/sunset/night screenshots (horizon, camera rotation, sun/star stability), record GPU frame times on an actual Chromebook and phone, and check Caddy source rollout before announcing as live. This is a lighting baseline, **not** a finished environment art upgrade.

## Highest-impact follow-on work
1. Establish one coherent visual target and approved screenshot comparisons across morning, sunset and night. Require an art-direction review, not only green tests.
2. Replace primitive terrain, paths, structures, foliage and characters with owned/rights-cleared authored GLB assets and LODs; attach rights manifests.
3. Add actual material/texture system, terrain variation, shadowing, controlled ambient occlusion and water shading; budget per device tier.
4. Upgrade agent appearance and animation after the character pipeline is genuinely connected to World Engine; do not imply scripted NPCs are autonomous agents.
5. Record frame times and visual regressions on real ChromeOS and Safari devices before expanding world scale.
