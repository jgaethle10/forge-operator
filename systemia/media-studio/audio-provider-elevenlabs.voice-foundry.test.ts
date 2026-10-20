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
function rig(input?:{ profiles?:unknown[];cues?:unknown[]; allowPaidGeneration?:boolean; commercialRights?:'allowed'|'unknown'|'denied' }){
  const calls:Array<{url:string;body:any}>=[];
  const raw=Buffer.from('FAKE-MP3-BYTES-FOR-UNIT-TEST');
  const adapter=createElevenLabsAudioAdapter({
    apiKey:'fake-unit-test-key',
    outputDir:fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-voice-foundry-')),
    verified:true,
    allowPaidGeneration:input?.allowPaidGeneration??true,
    commercialRights:input?.commercialRights??'allowed',
    voiceProfiles:{'foundry-host':'voice-real'},
    voiceFoundry:{profiles:(input?.profiles??[profile]) as any,cues:(input?.cues??[cue]) as any},
    probeDurationSec:()=>3,
    fetchImpl:(async(url:string,options:any)=>{
      calls.push({url,body:JSON.parse(options.body)});
      return {
        ok:true,status:200,
        async arrayBuffer(){return raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);},
        async text(){return '';}
      };
    }) as any,
  });
  return {adapter,calls};
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
