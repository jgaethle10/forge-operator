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
