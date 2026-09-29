import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createElevenLabsAudioAdapter,
  elevenLabsAudioDepartment,
} from './audio-provider-elevenlabs.js';
import type { ProductionNeed } from './types.js';

function response(status:number,bytes=Buffer.from('audio-bytes'),text=''){
  return {
    ok:status>=200&&status<300,
    status,
    async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);},
    async text(){return text;},
  };
}

test('ElevenLabs audio department is declared until independently verified',()=>{
  assert.equal(elevenLabsAudioDepartment().executionState,'declared');
  assert.equal(elevenLabsAudioDepartment(true).executionState,'verified');
  assert.deepEqual(
    elevenLabsAudioDepartment(true).capabilities.map(item=>item.kind),
    ['speech','music','sfx']
  );
});

test('speech maps locked Fallen voice profiles to provider voices and time-fits within the quality bound',async()=>{
  const calls:Array<{url:string;body:any}>=[];
  const outputDir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-eleven-audio-'));
  const durations=new Map<string,number>();
  let filterArgs:string[]=[];
  const adapter=createElevenLabsAudioAdapter({
    apiKey:'test-key',
    outputDir,
    verified:true,
    commercialRights:'allowed',
    allowPaidGeneration:true,
    voiceProfiles:{'host-v1':'provider-voice-123'},
    maxSpeechTempoAdjustmentPct:20,
    fetchImpl:(async(url:string,init?:any)=>{
      calls.push({url,body:JSON.parse(init.body)});
      return response(200,Buffer.from('speech-source'));
    }) as any,
    probeDurationSec:(filePath)=>{
      if(filePath.endsWith('.source.mp3')) return 3.3;
      return durations.get(filePath)??3;
    },
    runFfmpeg:(args)=>{
      filterArgs=args;
      const source=args[args.indexOf('-i')+1];
      const output=args[args.length-1];
      fs.writeFileSync(output,Buffer.from('time-fitted-speech'));
      fs.rmSync(source,{force:true});
      durations.set(output,3);
    },
  });
  const need:ProductionNeed={
    id:'speech-1',
    kind:'speech',
    prompt:'The receipts survived the proof layer.',
    durationSec:3,
    speakerId:'host',
    voiceProfileId:'host-v1',
    language:'en',
    continuityDigest:'continuity',
    requires:['voice_profile','commercial_rights','provenance_receipt','timing_control'],
    status:'planned',
  };
  const result=await adapter.execute(need);
  assert.match(calls[0].url,/\/v1\/text-to-speech\/provider-voice-123/);
  assert.equal(calls[0].body.model_id,'eleven_v3');
  assert.match(filterArgs.join(' '),/atempo=1\.100000/);
  assert.equal(result.receipt.voiceProfileId,'host-v1');
  assert.equal(result.receipt.durationSec,3);
  assert.equal(result.artifact.digest.length,64);
  assert.ok(fs.existsSync(result.artifact.path));
});

test('music asks the provider for the requested timeline duration',async()=>{
  const calls:Array<{url:string;body:any}>=[];
  const adapter=createElevenLabsAudioAdapter({
    apiKey:'test-key',
    outputDir:fs.mkdtempSync(path.join(os.tmpdir(),'fallen-eleven-music-')),
    verified:true,
    commercialRights:'allowed',
    allowPaidGeneration:true,
    fetchImpl:(async(url:string,init?:any)=>{
      calls.push({url,body:JSON.parse(init.body)});
      return response(200,Buffer.from('music'));
    }) as any,
    probeDurationSec:()=>12,
  });
  const need:ProductionNeed={
    id:'music-1',
    kind:'music',
    prompt:'Restrained cinematic technology score, instrumental.',
    durationSec:12,
    continuityDigest:'continuity',
    requires:['commercial_rights','provenance_receipt','timing_control'],
    status:'planned',
  };
  const result=await adapter.execute(need);
  assert.match(calls[0].url,/\/v1\/music\?/);
  assert.equal(calls[0].body.music_length_ms,12000);
  assert.equal(calls[0].body.force_instrumental,true);
  assert.equal(result.receipt.providerModel,'elevenlabs:music_v2_5');
});

test('SFX uses text-to-sound with explicit duration and prompt influence',async()=>{
  const calls:Array<{url:string;body:any}>=[];
  const adapter=createElevenLabsAudioAdapter({
    apiKey:'test-key',
    outputDir:fs.mkdtempSync(path.join(os.tmpdir(),'fallen-eleven-sfx-')),
    verified:true,
    commercialRights:'allowed',
    allowPaidGeneration:true,
    soundPromptInfluence:.55,
    fetchImpl:(async(url:string,init?:any)=>{
      calls.push({url,body:JSON.parse(init.body)});
      return response(200,Buffer.from('sfx'));
    }) as any,
    probeDurationSec:()=>1.5,
  });
  const need:ProductionNeed={
    id:'sfx-1',
    kind:'sfx',
    prompt:'Heavy but tasteful cinematic impact.',
    durationSec:1.5,
    continuityDigest:'continuity',
    requires:['commercial_rights','provenance_receipt','timing_control'],
    status:'planned',
  };
  await adapter.execute(need);
  assert.match(calls[0].url,/\/v1\/sound-generation\?/);
  assert.equal(calls[0].body.duration_seconds,1.5);
  assert.equal(calls[0].body.prompt_influence,.55);
});

test('paid audio generation requires explicit authorization before any provider call',async()=>{
  const adapter=createElevenLabsAudioAdapter({
    apiKey:'test-key',
    outputDir:os.tmpdir(),
    verified:true,
    commercialRights:'allowed',
    defaultVoiceId:'voice',
    fetchImpl:(async()=>{throw new Error('network should not run');}) as any,
  });
  const need:ProductionNeed={
    id:'speech-no-spend',
    kind:'speech',
    prompt:'Do not spend.',
    continuityDigest:'continuity',
    requires:['commercial_rights','provenance_receipt'],
    status:'planned',
  };
  await assert.rejects(()=>adapter.execute(need),/elevenlabs_audio_paid_generation_not_authorized/);
});
