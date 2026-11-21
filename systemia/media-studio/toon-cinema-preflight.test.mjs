import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {prepareToonCinemaShot} from './toon-cinema-preflight.mjs';
import {runwayGen45Endpoint} from './visual-provider-runway.ts';

const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'
  ?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])):x;
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(stable(x))).digest('hex');
function packet(){
  const actor={id:'ember',name:'Ember',referenceAssetIds:['approved-ember-001'],
    lockedTraits:{species:'fox',fur:'rust',eyes:'dark'},
    acting:{objective:'Investigate the light',physicalAction:'Wait, then lean in',
      face:'Soft surprise',gazeTarget:'Lantern',hands:'Keep paws grounded'}};
  const core={
    schema:'evercraft.fallen.toon-shot-handoff.v1',
    state:'preproduction_work_orders_only',deliveryReady:false,
    publicationAuthority:false,boundaries:{videoRendered:false},
    frameCount:120,
    shots:[{
      id:'ember-reveal',visualNeedId:'need-video-1',
      startFrame:0,frameCount:120,fps:24,durationSec:5,aspectRatio:'16:9',
      locationId:'grove',action:'Ember discovers the floating lantern',
      soundDirection:'Quiet breath then wonder',
      characters:[actor],dialogue:[],
    }],
  };
  return {...core,digest:digest(core)};
}
const reference={
  schema:'evercraft.fallen.toon-approved-frame.v1',actorId:'ember',
  referenceAssetId:'approved-ember-001',sha256:'a'.repeat(64),
  approvalState:'declared_approved',approvalEvidenceRef:'review:design-board-001',
  commercialRights:'owned',url:'https://media.example.com/approved-ember.png',
};
test('never treats green vectors as cinema; missing approved source and runtime means blocked',()=>{
  const p=prepareToonCinemaShot({packet:packet(),shotId:'ember-reveal'});
  assert.equal(p.generatedVideo,false);
  assert.equal(p.status,'not_executable_preflight_only');
  assert.equal(p.modelPlan.status,'blocked');
  assert.equal(p.request.references.length,0);
  assert.equal(p.publicationAuthority,false);
  assert.ok(p.blockers.includes('approved_identity_locked_start_frame_missing'));
});
test('declared Runway is not verified and cannot receive shot generation',()=>{
  const p=prepareToonCinemaShot({packet:packet(),shotId:'ember-reveal',
    approvedStartFrame:reference,endpoints:[runwayGen45Endpoint()]});
  assert.equal(p.modelPlan.status,'blocked');
  assert.equal(p.runtimeExecutionEligible,false);
  assert.equal(p.actualReferenceIdentityVerified,false);
  assert.ok(p.modelPlan.rejectedModels[0].reasons.includes('endpoint_not_verified'));
});
test('verified model shapes reference-locked request but still requires actual runtime and human review',()=>{
  const p=prepareToonCinemaShot({packet:packet(),shotId:'ember-reveal',
    approvedStartFrame:reference,endpoints:[runwayGen45Endpoint(true)],
    explicitPaidGenerationApproval:true});
  assert.equal(p.modelPlan.status,'routed');
  assert.equal(p.modelPlan.jobs.length,1);
  assert.equal(p.modelPlan.jobs[0].modelId,'runway:gen4.5');
  assert.equal(p.modelPlan.jobs[0].references[0].digest,'a'.repeat(64));
  assert.match(p.modelPlan.jobs[0].prompt,/anticipation/);
  assert.equal(p.runtimeExecutionEligible,false);
  assert.equal(p.audiovisualPerformanceVerified,false);
  assert.equal(p.publicationAuthority,false);
});
test('unapproved, mismatched or malformed frame claims reject rather than use weak imagery',()=>{
  for(const change of [
    {actorId:'other'}, {sha256:'not-a-sha'},
    {referenceAssetId:'not-in-character-bible'}, {commercialRights:'unknown'},
    {url:'http://localhost/fox.png'}, {approvalEvidenceRef:''},
  ]){
    assert.throws(()=>prepareToonCinemaShot({packet:packet(),shotId:'ember-reveal',
      approvedStartFrame:{...reference,...change}}),/toon_cinema_preflight_/);
  }
  assert.throws(()=>prepareToonCinemaShot({packet:packet(),shotId:'no-shot'}),/unknown_shot/);
});
