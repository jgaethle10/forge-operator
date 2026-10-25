import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {planSourceFirstCommercial,writeCommercialPlan} from './commercial-shotlist.mjs';
import {runAssignment,reconcile} from './creative-council-saban-adapter.mjs';

function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-shotlist-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const assets=['crew.mp4','sink.jpg','detail.mp4','result.mp4'].map((name,i)=>{
    const file=path.join(root,name),bytes=Buffer.from('test-content-'+i);
    fs.writeFileSync(file,bytes);
    return {
      id:'source-'+i,path:file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
      mediaKind:i===1?'image':'video',rights:i%2?'licensed':'owned',
      evidenceState:i%2?'licensed':'observed',
      sourceRefs:['owned-or-licensed-source:'+i],
      subjects:[['cleaning-crew','active-cleaning'],['product-detail'],['craftsmanship'],['clean-result']][i]
    };
  });
  const scenes=[
    {id:'hook',beat:'hook',durationSec:3,assetId:'source-0',
      intent:'Real crew in motion with immediate useful action',
      mustShowSubjects:['active-cleaning'],voiceLine:'A cleaner home changes everything.',
      voiceMood:'confident and warm',scoreEnergy:.3,scoreMood:'curiosity',sfxCues:[{atSec:.5,description:'cloth on stone'}]},
    {id:'service',beat:'proof',durationSec:8,assetId:'source-1',
      intent:'Material and tool proof',mustShowSubjects:['product-detail'],
      voiceLine:'We work carefully around your home.',voiceMood:'reassuring',
      scoreEnergy:.5,scoreMood:'building warmth'},
    {id:'craft',beat:'transformation',durationSec:12,assetId:'source-2',
      intent:'Real result and visible work',mustShowSubjects:['craftsmanship'],
      voiceLine:'Our team handles the details so you can enjoy your space.',
      voiceMood:'earned confidence',scoreEnergy:.8,scoreMood:'uplift'},
    {id:'cta',beat:'cta',durationSec:7,assetId:'source-3',
      intent:'Visible clean result and invitation to book',mustShowSubjects:['clean-result'],
      voiceLine:'Reach out for your estimate.',voiceMood:'direct and friendly',
      scoreEnergy:.4,scoreMood:'resolved',sfxCues:[{atSec:1,description:'soft room tone release'}]}
  ];
  return {root,brief:{schema:'evercraft.fallen.commercial-brief.v1',
    id:'havenly-demo-proof',brand:'Havenly Cleaning',audience:'local homeowners',
    offer:'Get an estimate',durationSec:30,formats:['9:16','16:9','1:1'],
    sourceAssets:assets,scenes}};
}
test('compiles a 30 second source-verified commercial with voice, music and sound cue sheets',t=>{
  const {root,brief}=fixture(t);
  const plan=writeCommercialPlan(brief,path.join(root,'generated'));
  assert.equal(plan.status,'ready_for_creative_execution_not_final_delivery');
  assert.equal(plan.timeline.length,4);
  assert.equal(plan.timeline.at(-1).endSec,30);
  assert.equal(plan.voiceTakes.length,4);
  assert.equal(plan.voiceTakes[0].auditionsRequired,3);
  assert.equal(plan.sfxSpots.length,2);
  assert.equal(plan.musicMap.length,4);
  assert.equal(plan.sabanInventory.jobs.length,4);
  assert.equal(plan.releaseGates.publicationAuthority,false);
  assert.equal(plan.releaseGates.finalVideoMasterCreated,false);
  assert.ok(fs.existsSync(path.join(root,'generated','saban-creative-inventory.json')));
  assert.ok(fs.existsSync(path.join(root,'generated','music-cue-map.json')));
});
test('rejects media tampering and any reuse of explicitly excluded campaign footage',t=>{
  const {brief}=fixture(t);
  assert.throws(()=>planSourceFirstCommercial({...brief,excludedPreviousAssetDigests:[brief.sourceAssets[0].sha256]}),
    /previous_campaign_footage_reused/);
  fs.appendFileSync(brief.sourceAssets[0].path,'unapproved');
  assert.throws(()=>planSourceFirstCommercial(brief),/digest_mismatch/);
});
test('rejects claims when required subject is not evidenced by the selected source',t=>{
  const {brief}=fixture(t);
  brief.scenes[1].mustShowSubjects=['customer-testimonial'];
  assert.throws(()=>planSourceFirstCommercial(brief),/must_show_not_proven/);
});
test('first frame cannot be a stock still or unlabeled synthetic scene',t=>{
  const {brief}=fixture(t);
  brief.scenes[0].assetId='source-1';
  brief.scenes[0].mustShowSubjects=['product-detail'];
  assert.throws(()=>planSourceFirstCommercial(brief),/opening_real_action_required/);
  brief.scenes[0].assetId='source-0';
  brief.scenes[0].mustShowSubjects=['active-cleaning'];
  brief.sourceAssets[0].evidenceState='synthetic_visualization';
  assert.throws(()=>planSourceFirstCommercial(brief),/opening_real_action_required/);
});
test('rejects a rushed AI narration read, missing direction, and repeated adjoining source',t=>{
  const {brief}=fixture(t);
  brief.scenes[0].voiceLine='This entire advertisement tries to squeeze far too many words into barely three seconds of speech';
  assert.throws(()=>planSourceFirstCommercial(brief),/voice_timing_unrealistic/);
  brief.scenes[0].voiceLine='Welcome home';
  brief.scenes[0].voiceMood='';
  assert.throws(()=>planSourceFirstCommercial(brief),/voice_direction_missing/);
  brief.scenes[0].voiceMood='warm';
  brief.scenes[1].assetId='source-0';
  brief.scenes[1].mustShowSubjects=['active-cleaning'];
  assert.throws(()=>planSourceFirstCommercial(brief),/adjacent_repeated_hero_footage/);
});
test('generated Saban inventory executes role-specific council notes without inventing assets',async t=>{
  const {brief}=fixture(t),plan=planSourceFirstCommercial(brief);
  const roles=['story_architect','cinematography_director','visual_evidence_scout','data_graphics_director',
    'world_builder','edit_rhythm_director','sound_director','voice_performance_director',
    'music_composer','sound_design_engineer','mixing_engineer','brand_art_director',
    'documentary_truth_guard','beauty_judge'];
  const entries=[];
  for(const role of roles)entries.push(await runAssignment({assignment:{
    agent_id:'test-'+role,role,item:{raw:plan.sabanInventory.jobs[0]}
  }}));
  assert.ok(entries.every(x=>x.status==='completed'));
  const reconciled=await reconcile({results:entries,plan:{roles}});
  assert.equal(reconciled.status,'reconciled');
  assert.equal(reconciled.blueprints[0].status,'ready_for_asset_or_provider_routing');
  assert.equal(reconciled.execution_boundary.assets_generated,0);
});
