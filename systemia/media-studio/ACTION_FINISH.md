# FALLEN | Action Finishing Engine RC001

Real finishing on actual existing **Fallen master footage**. This adds an opt-in FFmpeg shot/sequence *post-process*, not an AI video generator and not a substitute for quality cinematography.

## What it actually renders
- Deterministic source-bound color treatments: steel/amber blockbuster contrast, cool precision, or deliberately restrained natural.
- Short damped camera recoil and exposure punches at **user-specified timestamps**, limited to four beats. A source-motion analyzer checks original pixels before any movement is added; it rejects static footage being sold as physical action.
- Existing soundtrack preservation. Optional SHA-256-bound, licensed/owned impact WAV/audio can be mixed at matching beat timestamps with limiter.
- Before/after PNG frames extracted from actual source and finished master, SHA-256 output receipt, source classification, and explicit pending creative review.
- Native frame dimensions preserved, no fake particle explosions, objects, flames, machinery, or footage invented.

**Software UI** is protected: the `software_product` mode forbids shake/impact effects and restricts the look to `natural`. Camera movement over UI should go through the protected-region product-focus camera in PR #1447.

## How to run after Fallen timeline export
1. Render existing project with `npm run media:studio -- timeline-export <timeline.json> <master.mp4>`. Confirm the master, audio, source rights and true content.
2. Compute `sha256sum master.mp4`. Construct the JSON below with that actual hash, actual allowed file paths, accurate source refs, and impact timestamps that correspond to visible activity, not fictional explosions.
3. Run `npm run media:action-finish -- /private/actual-finish-request.json` (or `node systemia/media-studio/action-finish.mjs /private/actual-finish-request.json`).
4. Inspect `<output.mp4>.before.png` and `<output.mp4>.after.png` **at actual mobile size and full resolution**, and review the resulting MP4 plus audio. The JSON receipt is only technical provenance, not beauty approval.

Example request (placeholders must be replaced before running):

```json
{
  "schema":"evercraft.fallen.action-finish-request.v1",
  "id":"sample-action-preview",
  "usage":"marketing_candidate",
  "rights":"owned",
  "sourceRefs":["<actual master/source evidence ref>"],
  "evidenceState":"observed_capture",
  "subjectClass":"physical_action",
  "look":"steel_amber",
  "master":{
    "path":"/private/actual-fallen-master.mp4",
    "sha256":"<64 hex from real file>"
  },
  "outputPath":"/private/actual-fallen-master-cinematic.mp4",
  "impactBeats":[{"atSec":1.25,"strength":0.75}]
}
```

Optional impact sound requires `impactSound:{path,sha256,rights:'owned'|'licensed',sourceRefs:[...],licenseRef?:string}`. Source master must contain video + audio. `usage=marketing_candidate` requires a source with at least 1080px short edge; `usage=internal_canary` allows small synthetic test fixtures but is never release-authorized.

## Verification and boundaries

`npm run test:action-finish` runs 5 Node/FFmpeg tests: actual synthetic moving footage rendered and decoded at source shape; source/hash and rights rejection; non-shaking product-safe grade; rights-labeled sound mix; and static-footage impact rejection. The dedicated GitHub workflow must pass on the branch before a merge.

A pixel-difference motion score is **not** proof that the source depicts a real event. Rights are assertions requiring separate human verification. This engine does not generate scenes or sound, grant model/provider access, or sign off publication.

Before any production use: finish cinematic action coverage from PR #1443, authentic product source intake PR #1449, timeline master quality control, rendered-frame art review, shot tournament and founder release decision. Evercraft Clip must independently accept and acknowledge distribution. No system change here authorizes payment, outreach, product claims, or customer publication.
