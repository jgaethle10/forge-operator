import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {buildVoiceAuditionPlan,evaluateVoiceAuditions,PROFILE_ID,TEST_READS} from './voice-foundry-audition.mjs';

const digest=buf=>crypto.createHash('sha256').update(buf).digest('hex');
// Deliberately synthetic sine fixture; proves receipt matching, NEVER speech quality.
function testWav(){
  const rate=16000,frames=rate*2,bytes=Buffer.alloc(44+frames*2);
  bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);
  bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);
  bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);
  bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*2,40);
  for(let i=0;i<frames;i++)bytes.writeInt16LE(Math.round(6000*Math.sin(2*Math.PI*220*i/rate)),44+2*i);
  return bytes;
}
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-voice-foundry-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const bytes=testWav(),filePath=path.join(dir,'synthetic-fixture.wav');
  fs.writeFileSync(filePath,bytes);
  const ratings=Array.from({length:6},(_,i)=>({
    listenerId:'panel-'+i,selfReportedGroup:i<3?'woman':'man',blind:true,
    keepListening:5,naturalness:5,intelligibility:5,discomfort:1,
  }));
  const makeCandidate=(id)=>({candidateId:id,voiceProfileId:PROFILE_ID,providerModel:'synthetic-test-fixture',
    rights:{source:'original_or_licensed',commercialUseVerified:true,evidenceRef:'TEST ONLY'},
    identity:{consentedToVoiceUse:true,realPersonImpersonation:false},
    samples:TEST_READS.map(r=>({readId:r.id,scriptText:r.text,filePath,sha256:digest(bytes)})),ratings,
  });
  return {schema:'evercraft.fallen.voice-audition-review.v1',planDigest:buildVoiceAuditionPlan().planDigest,
    candidates:[makeCandidate('masked-A'),makeCandidate('masked-B')]};
}

test('plan is stable, includes three distinctly directed reads, and does not claim synthesis',()=>{
  const a=buildVoiceAuditionPlan(),b=buildVoiceAuditionPlan();
  assert.equal(a.planDigest,b.planDigest);
  assert.equal(a.reads.length,3);
  assert.equal(a.boundaries.audioGenerated,false);
  assert.equal(a.profile.status,'unselected_candidate_profile');
});
test('fails closed when no actual candidates rendered',()=>{
  const plan=buildVoiceAuditionPlan();
  const result=evaluateVoiceAuditions({schema:'evercraft.fallen.voice-audition-review.v1',planDigest:plan.planDigest,candidates:[]});
  assert.equal(result.status,'blocked');
  assert.deepEqual(result.blockers,['insufficient_candidate_count']);
});
test('accepts digest-verified synthetic contract fixture only for director review',t=>{
  if(spawnSync('ffprobe',['-version']).status!==0)return t.skip('ffprobe unavailable');
  const result=evaluateVoiceAuditions(fixture(t));
  assert.equal(result.status,'candidate_qualified_for_director_review');
  assert.equal(result.candidates.length,2);
  assert.ok(result.candidates.every(c=>c.status==='qualified_for_director_review'));
  assert.equal(result.boundaries.productionVoiceNotSelected,true);
});
test('tampered source bytes fail the SHA gate',t=>{
  if(spawnSync('ffprobe',['-version']).status!==0)return t.skip('ffprobe unavailable');
  const input=fixture(t);
  fs.appendFileSync(input.candidates[0].samples[0].filePath,Buffer.from('tamper'));
  const out=evaluateVoiceAuditions(input);
  assert.equal(out.status,'blocked');
  assert.ok(out.candidates[0].issues.includes('audio_sha_mismatch:curiosity'));
});
test('wrong profile, missing rights, and impersonation fail independently',t=>{
  const input=fixture(t);
  const c=input.candidates[0];c.voiceProfileId='imposter';
  c.identity.realPersonImpersonation=true;c.rights.commercialUseVerified=false;
  const out=evaluateVoiceAuditions(input);
  assert.ok(out.candidates[0].issues.includes('voice_profile_id_mismatch'));
  assert.ok(out.candidates[0].issues.includes('voice_identity_authorization_missing'));
  assert.ok(out.candidates[0].issues.includes('voice_rights_not_verified'));
});
test('cross-audience coverage, blind review and discomfort thresholds are real gates',t=>{
  const input=fixture(t),c=input.candidates[0];
  c.ratings=c.ratings.slice(0,4).map(r=>({...r,selfReportedGroup:'woman',discomfort:5}));
  const out=evaluateVoiceAuditions(input);
  assert.ok(out.candidates[0].issues.includes('insufficient_distinct_listeners'));
  assert.ok(out.candidates[0].issues.includes('insufficient_group_coverage:man'));
  assert.ok(out.candidates[0].issues.includes('audience_threshold_not_met:discomfort'));
});
test('high overall scores cannot hide low appeal in one audience group',t=>{
  const input=fixture(t);
  for(const rating of input.candidates[0].ratings){
    if(rating.selfReportedGroup==='man')rating.keepListening=2;
  }
  const out=evaluateVoiceAuditions(input);
  assert.ok(out.candidates[0].issues.includes('group_keep_listening_below_threshold:man'));
});
test('altered script and invented files are rejected',t=>{
  const input=fixture(t),c=input.candidates[0];
  c.samples[0].scriptText='Changed';c.samples[1].filePath='/nonexistent-file-voice-foundry-xyz.wav';
  const out=evaluateVoiceAuditions(input);
  assert.ok(out.candidates[0].issues.includes('read_text_modified:curiosity'));
  assert.ok(out.candidates[0].issues.includes('audio_file_missing:trust'));
});
test('wrong plan digest prevents evaluating stale rubrics',()=>{
  assert.throws(()=>evaluateVoiceAuditions({schema:'evercraft.fallen.voice-audition-review.v1',planDigest:'stale',candidates:[]}),/plan_digest_mismatch/);
});
