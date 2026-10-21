# Animation Foundry: Geometry Preflight (draft)

Frame-sampled **objective** 2D puppet geometry gate for the existing `systemia/world-engine/animation.ts` `evercraft.world-engine.animation.v1` contract.

It checks required animation event markers, sampled elbow continuity, hand/head proportions, bone length preservation, and coarse stage-frame safety. It is an independent pre-render gate, **not** an animation renderer, a voice generator, a character-appeal scorer, or a publication authorization.

## Usage

```js
import {auditAnimationGeometry} from './animation-geometry-gate.mjs';
const receipt=auditAnimationGeometry(animationComponent,{
  fps:24,
  canvasWidth:960,
  canvasHeight:540,
  expectedUpperArm:101,
  expectedForearm:106,
  headHeight:265,
  handHeight:68,
  requiredEvents:['snap']
});
if(receipt.status!=='pass') throw new Error(receipt.failures.join(','));
```

`node --test systemia/animation-foundry/animation-geometry-gate.test.mjs`

## Boundary

The coordinate and anatomy measurements are explicit per-rig inputs, in pixels. The gate does not guess limb lengths, solve inverse kinematics, access private assets, or call outside model providers. World Engine's own structural validation must still run first. An accepted objective receipt never certifies that an animation looks natural, enchanting or child-friendly.

A separate local Python proof for Kennedy RC09 rendered a 7.5-second 24fps pose test; it exported a World Engine-compatible animation clip, and measured worst elbow movement 6.858px/frame after correcting a >24px jump. The Python/SVG renderer is **not** wired into Fallen or World Engine in this PR. Asset layer binding, actual facial character acting, vocal performance, and full production admission remain future engineering gates. This draft intentionally cannot deploy or publish media.
