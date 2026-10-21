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
