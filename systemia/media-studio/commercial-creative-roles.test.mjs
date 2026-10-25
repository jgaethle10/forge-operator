import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { runAssignment, reconcile } from './creative-council-saban-adapter.mjs';

const roles=['story_architect','cinematography_director','visual_evidence_scout','data_graphics_director',
  'world_builder','edit_rhythm_director','sound_director','voice_performance_director',
  'music_composer','sound_design_engineer','mixing_engineer','brand_art_director',
  'documentary_truth_guard','beauty_judge'];
const shot={id:'brand-spot-hook',sourceType:'scene',sourceId:'spot-1',beat:'hook',
  storyPrompt:'Show a real cleaning crew working in an attractive customer home.',
  intent:'One elegant wipe reveals visible before-and-after value.',
  durationSec:3,aspectRatio:'9:16',coverage:[]};

test('Saban creative roster and runtime adapter agree on every role',async()=>{
  const registry=JSON.parse(fs.readFileSync(new URL('../saban/multiplication-registry.json',import.meta.url),'utf8'));
  const council=registry.software.find(x=>x.software_id==='fallen-creative-council');
  assert.ok(council);
  assert.deepEqual(new Set(council.roles),new Set(roles));
  assert.ok(council.scaling.max_agents_per_item>=roles.length);
  const output=[];
  for(const role of roles){
    const note=await runAssignment({assignment:{agent_id:'proof-'+role,role,item:{shot}}});
    assert.equal(note.status,'completed',role);
    assert.ok(note.proposal?.category,role);
    output.push(note);
  }
  const receipt=await reconcile({results:output,plan:{roles}});
  assert.equal(receipt.status,'reconciled');
  assert.equal(receipt.blueprints[0].status,'ready_for_asset_or_provider_routing');
  for(const category of ['voice_performance','music','sound_design','mix']){
    assert.ok(receipt.blueprints[0].creative_genome[category],category);
  }
  assert.equal(receipt.execution_boundary.provider_calls_performed,0);
  assert.equal(receipt.execution_boundary.assets_generated,0);
});

test('missing music or voice director leaves shot blocked, not silently released',async()=>{
  const notes=[];
  for(const role of roles.filter(x=>x!=='music_composer')){
    notes.push(await runAssignment({assignment:{agent_id:role,role,item:{shot}}}));
  }
  const result=await reconcile({results:notes,plan:{roles}});
  assert.equal(result.status,'blocked');
  assert.ok(result.blueprints[0].missing_roles.includes('music_composer'));
});

test('new council notes reject cheap default AI voice and score behavior',async()=>{
  const voice=await runAssignment({assignment:{agent_id:'v',role:'voice_performance_director',item:{shot}}});
  const score=await runAssignment({assignment:{agent_id:'m',role:'music_composer',item:{shot}}});
  const mix=await runAssignment({assignment:{agent_id:'x',role:'mixing_engineer',item:{shot}}});
  assert.ok(voice.proposal.reject_if.includes('robotic_opening'));
  assert.ok(score.proposal.reject_if.includes('stock_music_feel'));
  assert.ok(mix.proposal.reject_if.includes('unmeasured_delivery_master'));
  assert.equal(mix.proposal.targets.max_true_peak_dbtp,-1);
});
