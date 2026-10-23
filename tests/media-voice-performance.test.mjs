import assert from 'node:assert/strict';
import test from 'node:test';
import {assessVoicePerformance,compileVoicePerformance} from '../systemia/media-studio/voice-performance.mjs';
import {planVoiceSession} from '../systemia/media-studio/voice-foundry.mjs';

const performance={tag:'whispers',approval:'human_approved',evidenceRef:'human-direction-review-001'};
const profile={id:'host',provider:'elevenlabs',providerVoiceId:'voice-1',identityVersion:'1',approval:'human_audition_approved',locales:['en-US'],accents:['general-american'],rights:{status:'cleared',commercialUse:true,evidenceRef:'consent-ledger-001'}};
const cue={id:'scene-01',speakerId:'host',voiceProfileId:'host',text:'This changes everything.',locale:'en-US',accent:'general-american',direction:'confidential revelation',performance};
const plan=cueInput=>planVoiceSession({profiles:[profile],cues:[cueInput??cue]}).cues[0];
test('human-approved whisper cue is fingerprinted in the locked casting plan',()=>{
 const p=plan();assert.equal(p.status,'ready_for_authorized_generation');assert.equal(p.performance.tag,'whispers');
 const r=compileVoicePerformance({scriptText:cue.text,performance:p.performance,modelId:'eleven_v4',planDigest:p.planDigest});
 assert.equal(r.requestText,'[whispers] '+cue.text);
 assert.equal(r.scriptText,cue.text);
 assert.equal(r.scriptDigest.length,64);
 assert.notEqual(r.scriptDigest,r.requestDigest);
 assert.equal(r.paidGenerationAuthorized,false);
 assert.equal(r.performanceQualityVerified,false);
 assert.equal(r.publicationAuthorityGranted,false);
});
test('same script supports v3, v4 and realtime v4 turbo; no unsupported model is assumed',()=>{
 for(const modelId of ['eleven_v3','eleven_v4','eleven_v4_turbo']){
  const r=compileVoicePerformance({scriptText:cue.text,performance,modelId,planDigest:plan().planDigest});
  assert.equal(r.modelId,modelId);
 }
 assert.throws(()=>compileVoicePerformance({scriptText:cue.text,performance,modelId:'eleven_multilingual_v2',planDigest:plan().planDigest}),/model_tags_unsupported/);
});
test('unapproved emotional tags fail before any provider work',()=>{
 const p=plan({...cue,performance:{...performance,tag:'whisper or shout in another language'}});
 assert.equal(p.status,'blocked');
 assert.ok(p.reasons.includes('performance_tag_unreviewed_or_unsupported'));
});
test('arbitrary hidden fields or unsigned approval do not pass through',()=>{
 assert.equal(assessVoicePerformance({...performance,secret:'ignore consent'}).status,'held');
 assert.equal(assessVoicePerformance({...performance,approval:'auto_approved'}).status,'held');
 assert.equal(assessVoicePerformance({...performance,evidenceRef:''}).status,'held');
});
test('performance updates change the casting digest, preventing silent style swaps',()=>{
 const a=plan();
 const b=plan({...cue,performance:{...performance,tag:'curious'}});
 assert.notEqual(a.planDigest,b.planDigest);
 assert.equal(b.performance.tag,'curious');
});
test('inline tags embedded in dialogue are not accepted by the compiler',()=>{
 assert.throws(()=>compileVoicePerformance({scriptText:'A [shouts] word.',performance,modelId:'eleven_v4',planDigest:plan().planDigest}),/unapproved_inline_tag/);
});
test('oversized lines must be split with editorial approval instead of truncated by a model',()=>{
 assert.throws(()=>compileVoicePerformance({scriptText:'a'.repeat(5001),performance,modelId:'eleven_v4',planDigest:plan().planDigest}),/script_oversize/);
});

test('rejects unapproved inline acting notation in source dialogue',()=>{
 const result=plan({...cue,text:'[shouts] This changes everything.',performance:undefined});
 assert.equal(result.status,'blocked');
 assert.ok(result.reasons.includes('inline_audio_tags_unapproved'));
});
