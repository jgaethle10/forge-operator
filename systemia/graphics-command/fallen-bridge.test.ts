import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeVisualStory } from '../visual-desk/factory.mjs';
import { compileGraphicsCommand } from './director.mjs';
import { compileWorldIntelStage } from '../media-studio/world-intel-stage.ts';

test('Graphics Command volcano plan compiles through Fallen World Intelligence Visual Stage',()=>{
  const raw=JSON.parse(
    fs.readFileSync(
      new URL('../visual-desk/stories/washington-active-volcanoes.json',import.meta.url),
      'utf8'
    )
  );
  const story=normalizeVisualStory(raw);
  const plan=compileGraphicsCommand(story);
  const stage=compileWorldIntelStage(plan.fallenStageInput);

  assert.equal(stage.schema,'evercraft.fallen.visual-stage.v1');
  assert.equal(stage.width,1080);
  assert.equal(stage.height,1920);
  assert.equal(stage.durationSec,12);
  assert.ok(stage.layers.some(layer=>layer.kind==='geo'));
  assert.ok(stage.layers.filter(layer=>layer.kind==='metric').length>=3);
  assert.ok(stage.camera.keyframes.length>=3);
  assert.equal(stage.theme?.id,'evercraft-core-v1');

  const geo=stage.layers.find(layer=>layer.kind==='geo');
  assert.equal(geo?.points?.length,5);
  assert.equal(geo?.routes?.length,4);
  assert.equal(geo?.evidenceState,'public_source');
});
