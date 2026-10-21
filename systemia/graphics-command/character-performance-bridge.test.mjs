import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildCharacterPerformanceInput} from './character-performance-bridge.mjs';
import {compileCinematicSequence} from '../media-studio/cinematic-sequence.ts';
import {compilePerformancePlan,applyPerformanceDirection} from '../media-studio/performance-director.ts';
const campaign=JSON.parse(fs.readFileSync(new URL('./campaigns/forensiscope-ship-character-v1.json',import.meta.url),'utf8'));
const ref=(kind,label)=>({kind,rightsState:'owned',digest:'a'.repeat(64),
  sourceRefs:['test_fixture_only:'+label],locator:{kind:'url',value:'https://example.com/fixture/'+label+'.png'}});
const assets={
  maya_identity:ref('image','maya'),
  alex_identity:ref('image','alex'),
  office_environment:ref('image','office'),
  forensiscope_actual_ui_capture:ref('video','source-ui-video'),
  maya_voice_license:{rightsState:'permissioned',evidenceRef:'test_fixture_only:maya'},
  alex_voice_license:{rightsState:'permissioned',evidenceRef:'test_fixture_only:alex'},
  voiceover_voice_license:{rightsState:'permissioned',evidenceRef:'test_fixture_only:narration'},
  public_cta_readback:{state:'verified',url:'https://example.com/test-only',receiptRef:'test_fixture_only:cta'}
};
test('Fallen compiles full nine-shot plan when supplied with TEST-ONLY references',()=>{
 const prepared=buildCharacterPerformanceInput(campaign,{assets});
 const cinematic=compileCinematicSequence(prepared.bridge.cinematicSequenceInput);
 assert.deepEqual(cinematic.errors,[]);assert.equal(cinematic.status,'accepted');
 assert.equal(cinematic.shots.length,9);assert.equal(prepared.bridge.frameCount,696);
 assert.equal(cinematic.shots[1].mustProvideStartFrame,false);
 assert.equal(cinematic.shots[2].mustProvideStartFrame,true);
 assert.equal(prepared.bridge.publicationAuthority,false);
});
test('Fallen performance director actually accepts all ten directed character appearances',()=>{
 const prepared=buildCharacterPerformanceInput(campaign,{assets});
 const cinematic=compileCinematicSequence(prepared.bridge.cinematicSequenceInput);
 const performance=compilePerformancePlan({sequence:prepared.bridge.cinematicSequenceInput,performance:prepared.performancePlanInput});
 assert.equal(prepared.issues.length,0);assert.equal(performance.status,'accepted');
 assert.deepEqual(performance.errors,[]);
 assert.equal(performance.directions.length,10);
 const enriched=applyPerformanceDirection({sequence:prepared.bridge.cinematicSequenceInput,plan:performance});
 assert.match(enriched.shots[0].prompt,/PERFORMANCE DIRECTION FOR maya/);
 assert.match(enriched.shots[3].prompt,/Dialogue delivery:/);
 assert.match(enriched.shots[4].prompt,/composite authentic ForensiScope UI capture/);
 assert.equal(enriched.shots[8].dialogue,undefined);
 assert.equal(cinematic.boundaries.directPublicationAuthority,false);
});
test('Fallen rejects an un-directed visible character; our adapter remains fail closed',()=>{
 const prepared=buildCharacterPerformanceInput(campaign,{assets});
 const tampered=structuredClone(prepared.performancePlanInput);
 tampered.beats=tampered.beats.filter(beat=>!(beat.shotId==='S04'&&beat.entityId==='maya'));
 const rejected=compilePerformancePlan({sequence:prepared.bridge.cinematicSequenceInput,performance:tampered});
 assert.equal(rejected.status,'rejected');
 assert.ok(rejected.errors.includes('visible_character_performance_missing:S04:maya'));
 assert.throws(()=>applyPerformanceDirection({sequence:prepared.bridge.cinematicSequenceInput,plan:rejected}),/not_accepted/);
});
test('Fallen catches contradictory dialogue delivery after adapter mutation',()=>{
 const prepared=buildCharacterPerformanceInput(campaign,{assets});
 const tampered=structuredClone(prepared.performancePlanInput);
 delete tampered.beats.find(beat=>beat.shotId==='S07'&&beat.entityId==='alex').dialogueDelivery;
 const rejected=compilePerformancePlan({sequence:prepared.bridge.cinematicSequenceInput,performance:tampered});
 assert.equal(rejected.status,'rejected');
 assert.ok(rejected.errors.includes('dialogue_performance_missing:S07:alex'));
});
test('No performance planning changes asset safety or authorizes public generation',()=>{
 const p=buildCharacterPerformanceInput(campaign);
 assert.equal(p.bridge.status,'blocked');
 assert.ok(p.bridge.issues.includes('real_product_capture_missing'));
 assert.equal(p.bridge.paidGenerationAuthority,false);
 assert.equal(p.bridge.renderExecutionState,'not_requested');
 assert.equal(p.boundaries.performancePlanIsNotAnActorVideo,true);
});
