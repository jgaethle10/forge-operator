import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileEmotionalEditMap} from './emotional-edit-map.mjs';
import {compileCommercialAttention} from './commercial-director.mjs';
const campaign=JSON.parse(fs.readFileSync(new URL('./campaigns/website-audit-attention.json',import.meta.url),'utf8'));

test('builds frame-accurate emotional timeline with grounded audiovisual instructions',()=>{
  const edit=compileEmotionalEditMap(campaign);
  assert.equal(edit.schema,'evercraft.graphics-command.emotional-edit-map.v1');
  assert.equal(edit.beats.length,4);
  assert.equal(edit.durationFrames,288);
  assert.deepEqual(edit.beats.map(b=>[b.startFrame,b.endFrame]),[[0,62],[62,139],[139,211],[211,288]]);
  assert.equal(edit.beats[0].targetEmotion,'curiosity_with_stakes');
  assert.equal(edit.beats.at(-1).targetEmotion,'confidence');
  assert.match(edit.beats[0].physicalAction,/visitor signals/i);
  assert.equal(edit.beats[0].narrationCandidate,'Traffic up.');
  assert.ok(edit.beats.every(b=>b.syncPoints.every(c=>c.frame>=b.startFrame&&c.frame<b.endFrame)));
});

test('deterministic output and fail-closed mismatch checks',()=>{
  assert.deepEqual(compileEmotionalEditMap(campaign),compileEmotionalEditMap(campaign));
  const wrong={...compileCommercialAttention(campaign),campaignDigest:'unknown'};
  assert.throws(()=>compileEmotionalEditMap(campaign,{plan:wrong}),/campaign_plan_mismatch/);
  assert.throws(()=>compileEmotionalEditMap(campaign,{frameRate:0}),/frame_rate_invalid/);
});

test('no false claims of team execution, emotional quality, commercial verification or publication',()=>{
  const edit=compileEmotionalEditMap(campaign);
  assert.equal(edit.boardroomHandoff.state,'prepared_not_convened');
  assert.equal(edit.boundaries.providerCallsPerformed,0);
  assert.equal(edit.boundaries.boardroomReviewsPerformed,0);
  assert.equal(edit.boundaries.renderedArtifactsVerified,0);
  assert.equal(edit.boundaries.publicationAuthority,false);
  assert.ok(edit.productionChecklist.every(x=>x.status==='unverified'));
  assert.ok(edit.warnings.includes('human_stake_not_explicitly_directed'));
});
