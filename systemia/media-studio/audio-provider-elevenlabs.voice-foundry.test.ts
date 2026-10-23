import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createElevenLabsAudioAdapter } from './audio-provider-elevenlabs.js';
import type { ProductionNeed } from './types.js';

const profile={
  id:'foundry-host',provider:'elevenlabs',providerVoiceId:'voice-real',
  approval:'human_audition_approved',identityVersion:'1',
  locales:['en-US','es-MX'],accents:['general-american','mexican-spanish'],
  rights:{status:'cleared',commercialUse:true,evidenceRef:'verified-rights-receipt-ref'},
};
const cue={
  id:'foundry-line',speakerId:'host',voiceProfileId:'foundry-host',
  text:'These are real words, not a generated sound effect.',
  locale:'en-US',accent:'general-american',
  direction:'real conversational confidence, warm pacing',maxDurationSec:4,
};
const need:ProductionNeed={
  id:'foundry-line',kind:'speech',prompt:cue.text,durationSec:3,
  speakerId:'host',voiceProfileId:'foundry-host',language:'en',
  continuityDigest:'locked-continuity',
  requires:['voice_profile','commercial_rights','provenance_receipt','timing_control'],status:'planned',
};
function rig(input?:{ profiles?:unknown[];cues?:unknown[]; allowPaidGeneration?:boolean; speechModelId?:string; commercialRights?:'allowed'|'unknown'|'denied'; sourceDurationSec?:number; auditionTakeId?:string; outputDir?:string; strictPronunciation?:boolean; lexicon?:unknown[]; dictionaryBindings?:unknown[] }){
  const calls:Array<{url:string;body:any}>=[];
  const raw=Buffer.from('FAKE-MP3-BYTES-FOR-UNIT-TEST');
  const outputDir=input?.outputDir??fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-voice-foundry-'));

  const adapter=createElevenLabsAudioAdapter({
    apiKey:'fake-unit-test-key',
    outputDir,
    verified:true,
    allowPaidGeneration:input?.allowPaidGeneration??true,
    commercialRights:input?.commercialRights??'allowed',
    speechModelId:input?.speechModelId??'eleven_v3',
    voiceProfiles:{'foundry-host':'voice-real'},
    auditionTakeId:input?.auditionTakeId,
    strictPronunciation:input?.strictPronunciation,
    pronunciationDictionaryBindings:input?.dictionaryBindings as any,
    voiceFoundry:{profiles:(input?.profiles??[profile]) as any,cues:(input?.cues??[cue]) as any,lexicon:(input?.lexicon??[]) as any},
    probeDurationSec:(filePath)=>filePath.endsWith('.source.mp3')?(input?.sourceDurationSec??3):3,
    fetchImpl:(async(url:string,options:any)=>{
      calls.push({url,body:JSON.parse(options.body)});
      return {
        ok:true,status:200,
        async arrayBuffer(){return raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);},
        async text(){return '';}
      };
    }) as any,
  });
  return {adapter,calls,outputDir};
}
test('approved Foundry cue binds provider voice, base language, digest and keeps release unapproved',async()=>{
  const {adapter,calls}=rig();
  const result=await adapter.execute(need);
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/text-to-speech\/voice-real/);
  assert.equal(calls[0].body.text,cue.text);
  assert.equal(calls[0].body.language_code,'en');
  assert.match(result.sourceRefs.join(','),/voice-foundry-preflight:[a-f0-9]{64}/);
  assert.equal(result.receipt.voiceProfileId,'foundry-host');
});
test('tampered dialogue never calls the provider',async()=>{
  const {adapter,calls}=rig();
  await assert.rejects(()=>adapter.execute({...need,prompt:'Unreviewed line'}),/spoken_text_mismatch/);
  assert.equal(calls.length,0);
});
test('unverified accent and mismatched identity never call the provider',async()=>{
  const accented=rig({cues:[{...cue,accent:'british-rp'}]});
  await assert.rejects(()=>accented.adapter.execute(need),/cast_not_approved/);
  assert.equal(accented.calls.length,0);
  const voiceSwap=rig();
  await assert.rejects(()=>voiceSwap.adapter.execute({...need,voiceProfileId:'other-voice'}),/elevenlabs_voice_profile_unmapped|cast_profile_mismatch/);
  assert.equal(voiceSwap.calls.length,0);
});
test('missing rights and explicit spend opt-in both refuse provider calls',async()=>{
  const rights=rig({profiles:[{...profile,rights:{status:'unknown'}}]});
  await assert.rejects(()=>rights.adapter.execute(need),/cast_not_approved/);
  assert.equal(rights.calls.length,0);
  const spend=rig({allowPaidGeneration:false});
  await assert.rejects(()=>spend.adapter.execute(need),/paid_generation_not_authorized/);
  assert.equal(spend.calls.length,0);
});
test('reviewed Mexican Spanish routes as es while preserving exact regional cast',async()=>{
  const spanish=rig({cues:[{...cue,locale:'es-MX',accent:'mexican-spanish'}]});
  const result=await spanish.adapter.execute({...need,language:'es'});
  assert.equal(spanish.calls[0].body.language_code,'es');
  assert.ok(result.sourceRefs.some(x=>x.startsWith('voice-foundry-preflight:')));
});

test('explicit Eleven v4 audition pins model ID without silently changing the production default',async()=>{
  const v4=rig({speechModelId:'eleven_v4'});
  const result=await v4.adapter.execute(need);
  assert.equal(v4.calls.length,1);
  assert.equal(v4.calls[0].body.model_id,'eleven_v4');
  assert.equal(result.receipt.providerModel,'elevenlabs:eleven_v4');
  const legacy=rig();
  await legacy.adapter.execute(need);
  assert.equal(legacy.calls[0].body.model_id,'eleven_v3');
});

test('governed timing rejects a >8% stretch and preserves the unmodified generated take',async()=>{
  const {adapter,calls,outputDir}=rig({sourceDurationSec:3.5});
  await assert.rejects(()=>adapter.execute(need),/elevenlabs_speech_timing_out_of_bounds/);
  assert.equal(calls.length,1,'provider response occurred, but quality rejected the generated take');
  const dry=path.join(outputDir,'foundry-line.dry.mp3');
  assert.equal(fs.readFileSync(dry,'utf8'),'FAKE-MP3-BYTES-FOR-UNIT-TEST');
  assert.equal(fs.existsSync(path.join(outputDir,'foundry-line.mp3')),false);
});
test('approved unmodified dry speech carries original fingerprint for human listening comparison',async()=>{
  const {adapter,outputDir}=rig();
  const result=await adapter.execute(need);
  assert.equal(fs.existsSync(path.join(outputDir,'foundry-line.dry.mp3')),true);
  assert.match(result.sourceRefs.join(','),/voice-foundry-dry-source-sha256:[a-f0-9]{64}/);
});

test('v4 audition actually sends approved whisper acting direction with unchanged spoken line',async()=>{
  const guided={...cue,performance:{tag:'whispers',approval:'human_approved',evidenceRef:'manual-performance-review-001'}};
  const {adapter,calls}=rig({cues:[guided],speechModelId:'eleven_v4'});
  const result=await adapter.execute(need);
  assert.equal(calls.length,1);
  assert.equal(calls[0].body.text,'[whispers] '+need.prompt);
  assert.equal(calls[0].body.model_id,'eleven_v4');
  assert.match(result.sourceRefs.join(','),/voice-performance-script-sha256:[a-f0-9]{64}/);
  assert.match(result.sourceRefs.join(','),/voice-performance-request-sha256:[a-f0-9]{64}/);
});
test('bad acting prompt and unsupported model never trigger provider billing',async()=>{
  const held=rig({cues:[{...cue,performance:{tag:'shouts and laugh',approval:'human_approved',evidenceRef:'review'}}]});
  await assert.rejects(()=>held.adapter.execute(need),/performance_tag_unreviewed_or_unsupported/);
  assert.equal(held.calls.length,0);
  const oldModel=rig({cues:[{...cue,performance:{tag:'sad',approval:'human_approved',evidenceRef:'review'}}],speechModelId:'eleven_multilingual_v2'});
  await assert.rejects(()=>oldModel.adapter.execute(need),/model_tags_unsupported/);
  assert.equal(oldModel.calls.length,0);
});
test('strict production lane refuses all speech without Voice Foundry without an API request',async()=>{
  let calls=0;
  const adapter=createElevenLabsAudioAdapter({
    apiKey:'test-key',
    outputDir:fs.mkdtempSync(path.join(os.tmpdir(),'voice-strict-')),
    verified:true,commercialRights:'allowed',allowPaidGeneration:true,
    requireVoiceFoundry:true,voiceProfiles:{'foundry-host':'voice-real'},
    fetchImpl:(async()=>{calls++;throw Error('must not call provider');}) as any,
  });
  await assert.rejects(()=>adapter.execute(need),/required_voice_foundry_missing/);
  assert.equal(calls,0);
});

test('same governed take cannot overwrite its already-generated audio',async()=>{
 const {adapter,calls,outputDir}=rig();
 await adapter.execute(need);
 assert.ok(fs.existsSync(path.join(outputDir,'foundry-line.mp3')));
 await assert.rejects(()=>adapter.execute(need),/voice_take_output_already_exists/);
 assert.equal(calls.length,1,'collision rejected before second provider request');
});
test('model auditions use unique take IDs and preserve independent source recordings',async()=>{
 const outputDir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-voice-ab-'));
 const v3=rig({outputDir,auditionTakeId:'v3-take01',speechModelId:'eleven_v3'});
 const v4=rig({outputDir,auditionTakeId:'v4-take01',speechModelId:'eleven_v4'});
 const result3=await v3.adapter.execute(need);
 const result4=await v4.adapter.execute(need);
 assert.notEqual(result3.artifact.path,result4.artifact.path);
 assert.ok(fs.existsSync(path.join(outputDir,'foundry-line.v3-take01.dry.mp3')));
 assert.ok(fs.existsSync(path.join(outputDir,'foundry-line.v4-take01.dry.mp3')));
 assert.ok(result4.sourceRefs.includes('voice-audition-take-id:v4-take01'));
 assert.equal(v3.calls.length,1);
 assert.equal(v4.calls.length,1);
});
test('invalid audition ID is rejected before paid calls',async()=>{
 const {adapter,calls}=rig({auditionTakeId:'../overwrite'});
 await assert.rejects(()=>adapter.execute(need),/voice_take_id_unsafe/);
 assert.equal(calls.length,0);
});

test('qualified reviewed dictionary version is transmitted for matching English term',async()=>{
 const {adapter,calls}=rig({
   strictPronunciation:true,
   lexicon:[{term:'real',reading:'ree-uhl',locale:'en-US',reviewerEvidenceRef:'lexical-review'}],
   dictionaryBindings:[{locale:'en-US',pronunciation_dictionary_id:'dictionary_1234',version_id:'version_5678',approval:'human_approved',approvalEvidenceRef:'pronunciation-review'}],
 });
 const result=await adapter.execute(need);
 assert.deepEqual(calls[0].body.pronunciation_dictionary_locators,[{pronunciation_dictionary_id:'dictionary_1234',version_id:'version_5678'}]);
 assert.match(result.sourceRefs.join(','),/voice-pronunciation-request-sha256:[a-f0-9]{64}/);
});
test('strict name pronunciation blocks paid request without a reviewed dictionary version',async()=>{
 const {adapter,calls}=rig({
   strictPronunciation:true,
   lexicon:[{term:'real',reading:'ree-uhl',locale:'en-US',reviewerEvidenceRef:'lexical-review'}],
 });
 await assert.rejects(()=>adapter.execute(need),/dictionary_required_for_matched_terms/);
 assert.equal(calls.length,0);
});

test('an unrelated later scene cannot change the same speaker identity silently',async()=>{
 const secondProfile={...profile,id:'other-actor',identityVersion:'2',providerVoiceId:'other-voice'};
 const scene2={...cue,id:'second-scene',voiceProfileId:'other-actor'};
 const {adapter,calls}=rig({profiles:[profile,secondProfile],cues:[cue,scene2]});
 await assert.rejects(()=>adapter.execute(need),/speaker_voiceProfileId_changed/);
 assert.equal(calls.length,0,'whole-session conflict must block before any paid call');
});
