# Animation Foundry | Artist-grade Character Intake v1

## Explicit founder feedback
Kennedy's visual target was approved as **original cinematic stylized 3D concept art**, not approved as a rig/film. Previous render prototypes were repeatedly rejected as uncanny, mechanically posed, and dissimilar. Blonde somewhat messy straight-to-wavy hair; very fair skin; bright blue eyes; tiny freckles across nose/cheeks; purple wardrobe. No current Blender scene meets that standard.

### RC15 audit receipt
- Blender Cycles four-frame preview built successfully; 3 studio lights, real meshes and materials.
- Human visual inspection **REJECTED**: still uncanny face, sausage-like sculpted fringe, stiff hands, weak expression, far from approved reference.
- `studio-character-preflight.py` returned `HELD`: 21 deform bones, only 5 finger-related bones, zero face bones, 4 face shape keys, 3 expression keys. Failures are full finger controls, complete deform skeleton, facial controls, range of expressions.
- This is a **rigging/art-direction failure**, not a compositor, FFmpeg or light-transport failure.
- Full 48-frame proof moved to manual workflow. Four-frame lookdev remains the default gate.

## Replace the construction method, not just lighting
The procedural sphere/tube/blended-sphere rig has served its purpose and must not be promoted as the main Kennedy character asset. MPFB is a real human mesh with 163 bones, but its neutral **adult** body/face is an anatomy reference, not an age-appropriate stylized cartoon or Kennedy's likeness.

Next use a professionally authored, stylized base character/rig with demonstrated eyes, lips, brows, face deformations, IK/FK and full hand articulation. **Evaluate Blender Studio's Rain v3 as a licensed educational rig benchmark only** (Blender 4.1+, CC BY with attribution), not a character to relabel Kennedy:
https://studio.blender.org/characters/rain/v3/

Also investigate BlenRig as a face/skin rigging system: https://github.com/jpbouza/BlenRig. Audit license and compatibility before integration.

## Acceptance sequence
1. Import candidate .blend and capture manifest: exact source, artist, license, SHA256, textures, rig/skin/hair/clothing provenance. No assumed redistribution rights.
2. Four-view static character turnaround against the approved reference, with clothing/hair/materials fully applied.
3. Facial acting test: neutral, mischievous smirk, surprise, blink, laugh. Reviewer can understand emotion without narration.
4. Finger snap test: close-up, thumb-middle-finger contact/release, plausible joint mechanics, audible snap aligned with fingers, natural shoulder movement.
5. Moving hair, head and garment simulation. The character must not change identity or produce creepy faces.
6. Approve only after founder reviews actual video frames. Then build the purple-bedroom musical scene. Voice/music synchronization and release rights are separate gates.

## Avoid false confidence
High polygon count, bone count, render success, beautiful generated concept images or automated geometry checks DO NOT establish child-friendly appeal. No video or model is publication-ready merely because CI passes. Fail closed, no Base44 dependency, no paid asset purchase or external release without explicit authorization.
