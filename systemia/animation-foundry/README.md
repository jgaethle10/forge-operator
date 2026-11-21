# Evercraft Animation Foundry | Creative Release Gate

This is a **draft, non-production approval guard**, not an animation engine, character rig, or AI art judge.

## Why it exists

A previous Kennedy workprint passed geometry, framing and audio-sync checks, while a human viewer found the character unpleasant. Technical correctness cannot establish artistic appeal. An illustrated animatic must not be labeled as performed 3D character animation.

`creative-gate.mjs` forces accurate production-technique claims and holds release candidates until independent human review of character appeal, hands, acting, storytelling, staging, and music/sound is recorded with evidence. It also checks sound/vocal provenance and rights documentation without presuming clearance.

## Local test

```bash
node --test systemia/animation-foundry/creative-gate.test.mjs
```

## RC11 example

```js
const rc11 = {
  projectId:'kennedy-rc11',
  technique:'generated_stills',
  claim:'story_animatic',
  status:'workprint',
  audio:{sungVocalClaimed:false}
};
```

This record identifies a **camera-moved sequence of original still concept art**, not a rigged or performed animated character. The song is an original temporary instrumental and not a real singing voice.

## Integration still required

- Connect these checks to the actual rendering/review/approval orchestrator.
- Add objective bone deformation and pose tests for future rigged projects.
- Record founder and viewer creative feedback as real human evidence; automated geometry results never substitute for it.
- Validate instrument sample license and voices before publication.
- No deployment, automatic publication, or approvals are created by this draft.

The module deliberately does **not** pretend to judge whether artwork is beautiful.


## Visual Lock v1: prevent the Kennedy-style regression

The founder selected a **cinematic stylized 3D visual direction** for Kennedy: tousled blonde straight-to-loose-wave hair, very fair skin, blue eyes, and faint freckles on the cheeks/nose. An earlier animated pilot silently replaced it with a hand-coded procedural vector character. That downgrade is now a **blocking contract failure**, regardless of frame count or audio synchronization.

- `kennedy.production-spec.json` pins visual identity, target technique and SHA-256 of the exact concept image. **The PNG is supplied in the separate local source kit, not committed in this repo.**
- `visual-lock.mjs` compares measured asset hashes and animation claims against those locked requirements.
- `visual-lock-preflight.mjs` reads real local file bytes under a workspace root and outputs machine-readable blockers; exit 1 is a held render.
- `blender-rig-audit.py` runs under Blender to inspect saved .blend armatures, deformer bones, mesh, facial shape keys and camera. It is NOT a 3D model generator.
- `visual-lock.test.mjs` verifies failure cases for vector fallbacks, storyboard substitutions, missing rig, character trait drift, missing human review, tampered hashes and unsafe paths.

### Reproduce on Node 22+

```bash
node --test systemia/animation-foundry/creative-gate.test.mjs systemia/animation-foundry/visual-lock.test.mjs
node systemia/animation-foundry/visual-lock-preflight.mjs \
  WORKSPACE/kennedy.production-spec.json WORKSPACE/pilot.attempt.json WORKSPACE
# Expected on the previous vector pilot: exit code 1, status BLOCKED.
```

### Blender audit on a real character, once a rig exists

```bash
blender -b path/to/kennedy.blend -P systemia/animation-foundry/blender-rig-audit.py -- path/to/rig-proof.json
```

This script has only been syntax-checked in the current environment, which has no Blender; it has **not** inspected a real 3D Kennedy rig. A passing structural audit cannot establish beauty, faithful identity, natural movement or child audience response. Founder visual approval, audio and rights release gates remain separate.

The real outstanding work is modeling, grooming, rigging, facial posing, shot animation and musical performance in a renderer that can produce the target imagery. Never substitute a simple vector drawing and label it the same deliverable.


## RC13: actual 3D character art pass, STILL NOT APPROVED

`character-art-pass-v3.py` adds Blender-created facial parts, smaller blue eyes, faint freckle geometry, separate five-finger meshes and many bone-skinned blonde hair strands to the engineering rig. The CI proof created a saved Blender scene and 48 rendered frames. Rig audit reported 21 bones, 120 meshes, four facial shape keys. Screen-space hand movement measured 151.56px. These numbers prove the code and rig move, **not** that the character resembles the founder's approved cinematic artwork. RC13 has string-like hair, rigid body motion and a hand that has not demonstrated a convincing finger snap. Visual release remains HELD.

## Higher-quality human topology trial: MPFB

The serious limitation in the earlier 3D build is the geometry itself: hand-built spheres and tubes aren't a substitute for a well-topologized human mesh. `build-human-mesh-proof.py` is a strictly **neutral mesh-generation study**, using MakeHuman Community MPFB and Blender >=4.2. The dedicated `animation-foundry-human-mesh.yml` workflow tries to install Blender 4.5.3, get official MPFB source, create a human basemesh and built-in rig, then return the scene plus auditable vertex and bone counts. A failed installation/build is a held gate, not a reason to substitute a vector cartoon.

- Upstream: https://github.com/makehumancommunity/mpfb2
- Documentation: https://static.makehumancommunity.org/mpfb/docs/getting_started.html
- License: https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.md
- MPFB code GPLv3; its bundled generated-model assets are CC0 according to upstream. Keep the dependency and original license documentation separate, audit any additional skin/hair/clothing packs individually.
- Neither a neutral human basemesh nor the sphere-based RC13 is the approved Kennedy appearance.
- An approved likeness requires human-directed sculpting/stylization, blonde hair grooming, eye color, freckles, costume, face shapes, hand articulation, animation, sound, rights check, and founder viewing the actual rendered footage.

## Creative acceptance before a real short

First approve a front / 3-quarter / profile model turnaround. Then show genuine moving eyes, subtle expressions and a **hand-closeup snap with five distinct fingers**. Only after these passes should the project move to portal choreography, a proper song performance, lip sync and a complete cartoon. A pass from CI or a provider never substitutes for actual artistic approval.


## Licensed external rig intake (verified Oct 22, 2026)

Instead of using a third-party mesh as "Kennedy," `rig-candidate-inspector.py` runs Blender with `--disable-autoexec`, audits real mesh/control bones/IK/materials/shape keys and renders neutral front, 3/4 and side views. `rig-candidate-scorecard.mjs` then flags missing facial and finger controls, limited geometry and absent licensing evidence. `animation-foundry-rig-intake.yml` downloads a **CC0 benchmark only**, records its original source and downloaded asset hash, rejects ZIP slip/symlinks/large archives and publishes a review-only artifact.

Original CC0 rig benchmark: PINKCANNON, *Tiby 3D rigged model*, https://opengameart.org/content/tiby-3d-rigged-model . Initial GitHub run **39738674901** succeeded in sandboxed Blender; real inspection reported: 4 mesh objects, 1,750 mesh vertices, 1 armature, 16 deform bones, 9 control bones, 4 IK constraints, **zero finger-named bones and zero facial controls/shape keys**. This is **NOT** an audition-quality Kennedy rig. The benchmark binary is not copied into Evercraft source.

Current desired production rig capabilities: complete finger/hand controls with distinct snap contact/release, flexible face with corrective shapes, age-appropriate proportions and supervised visual match to the approved original character, hair/cloth controls, IK/FK for expressive poses, separate singing/phoneme controls, and evidence-backed artwork rights. As always, **creative approval is held** until actual rendered motion is reviewed.
