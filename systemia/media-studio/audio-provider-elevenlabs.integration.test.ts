import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createElevenLabsAudioAdapter } from './audio-provider-elevenlabs.js';
import type { ProductionNeed } from './types.js';

function run(args:string[]){
  const result=spawnSync('ffmpeg',args,{encoding:'utf8'});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(result.stderr||'ffmpeg failed');
}

test('real FFmpeg timing finish turns provider speech bytes into an admitted 3 second artifact',async()=>{
  const fixtureDir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-audio-provider-fixture-'));
  const fixture=path.join(fixtureDir,'provider.mp3');
  run([
    '-y','-v','error',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=44100',
    '-t','3.3',
    '-c:a','libmp3lame','-b:a','128k',
    fixture,
  ]);
  const bytes=fs.readFileSync(fixture);
  const adapter=createElevenLabsAudioAdapter({
    apiKey:'test-key',
    outputDir:fs.mkdtempSync(path.join(os.tmpdir(),'fallen-audio-finish-')),
    verified:true,
    commercialRights:'allowed',
    allowPaidGeneration:true,
    voiceProfiles:{'host-v1':'provider-voice'},
    maxSpeechTempoAdjustmentPct:20,
    fetchImpl:(async()=>({
      ok:true,
      status:200,
      async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);},
      async text(){return '';},
    })) as any,
  });
  const need:ProductionNeed={
    id:'speech-real-finish',
    kind:'speech',
    prompt:'Timing proof.',
    durationSec:3,
    voiceProfileId:'host-v1',
    continuityDigest:'continuity',
    requires:['voice_profile','commercial_rights','provenance_receipt','timing_control'],
    status:'planned',
  };
  const result=await adapter.execute(need);
  assert.equal(result.artifact.kind,'audio');
  assert.ok(fs.existsSync(result.artifact.path));
  assert.ok(Math.abs((result.artifact.durationSec??0)-3)<=.05);
  assert.equal(result.artifact.digest.length,64);
  assert.equal(result.receipt.durationSec,result.artifact.durationSec);
});
