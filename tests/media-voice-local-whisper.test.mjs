import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {runLocalWhisperAudit} from '../systemia/media-studio/voice-local-whisper.mjs';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-local-whisper-tests-'));
const audioPath=path.join(temp,'tone-not-human-speech.wav');
const generated=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=f=230:r=16000','-t','1.5','-c:a','pcm_s16le','-y',audioPath],{encoding:'utf8'});
if(generated.status!==0)throw new Error(generated.stderr);
const modelPath=path.join(temp,'test-model-not-actual-whisper.bin');
fs.writeFileSync(modelPath,'NOT A REAL MODEL: STUB ONLY');
const whisperCliPath=path.join(temp,'fixture-cli.cjs');
const fixtureCode=[
 '#!/usr/bin/env node',
 "const fs=require('node:fs');",
 'const args=process.argv.slice(2);',
 'const val=name=>args[args.indexOf(name)+1];',
 "if(!fs.existsSync(val('-m'))||!fs.existsSync(val('-f')))process.exit(12);",
 "if(!args.includes('-otxt')||!args.includes('-np'))process.exit(13);",
 "if(val('-l')!=='en')process.exit(14);",
 "fs.writeFileSync(val('-of')+'.txt','We build the future.');",
 ''].join('\n');
fs.writeFileSync(whisperCliPath,fixtureCode,{mode:0o755});
fs.chmodSync(whisperCliPath,0o755);
const session={schema:'evercraft.voice-foundry.session.v1',status:'ready_for_authorized_generation',
 cues:[{cueId:'scene-001',status:'ready_for_authorized_generation',text:'We build the future.',locale:'en-US',pronunciation:[]}]};
const dir=()=>fs.mkdtempSync(path.join(temp,'out-'));
const run=(override={})=>runLocalWhisperAudit({session,cueId:'scene-001',audioPath,modelPath,whisperCliPath,outputDir:dir(),expectedModelSha256:digest(modelPath),expectedBinarySha256:digest(whisperCliPath),...override});
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

test('invokes a configured local CLI, records true audio/model/binary hashes, without claiming human speech',async()=>{
 const out=await run();
 assert.equal(out.record.status,'text_match_needs_human_review');
 assert.equal(out.observation.audioDigest,digest(audioPath));
 assert.equal(out.record.binaryDigest,digest(whisperCliPath));
 assert.equal(out.record.modelDigest,digest(modelPath));
 assert.equal(out.record.pcmDigest.length,64);
 assert.equal(out.record.sourceAudioActuallyHashed,true);
 assert.equal(out.record.transcriptionProcessActuallyInvoked,true);
 assert.equal(out.record.recognizerIdentityExternallyAuthenticated,false);
 assert.equal(out.record.actualSpeakerIdentityVerified,false);
 assert.equal(out.record.truePronunciationVerified,false);
 assert.equal(out.record.publicationAuthorityGranted,false);
 assert.ok(fs.existsSync(out.observationPath));
 assert.ok(fs.existsSync(out.auditPath));
 assert.equal(out.observation.recognizedText,'We build the future.');
});
test('absent recognizer executable or model holds instead of inventing a transcript',async()=>{
 await assert.rejects(()=>run({whisperCliPath:path.join(temp,'not-installed')}),/binary_not_installed/);
 await assert.rejects(()=>run({modelPath:path.join(temp,'model-not-present.bin')}),/model_not_installed/);
});
test('existing audit results cannot be silently overwritten',async()=>{
 const outputDir=dir(); const first=await run({outputDir});
 assert.ok(fs.existsSync(first.auditPath));
 await assert.rejects(()=>run({outputDir}),/output_already_exists/);
});
test('invalid recording, unsafe cue and unready casting fail closed',async()=>{
 await assert.rejects(()=>run({audioPath:path.join(temp,'nonexistent.wav')}),/audio_not_installed/);
 await assert.rejects(()=>run({cueId:'../escape'}),/cue_id_unsafe/);
 await assert.rejects(()=>run({session:{...session,status:'held'}}),/casting_session_not_ready/);
});
test('failed CLI returns an error without generating audit evidence',async()=>{
 const bad=path.join(temp,'bad-cli.cjs');
 fs.writeFileSync(bad,'#!/usr/bin/env node\nprocess.exit(55)\n',{mode:0o755});
 fs.chmodSync(bad,0o755);
 const outputDir=dir();
 await assert.rejects(()=>run({whisperCliPath:bad,outputDir,expectedBinarySha256:digest(bad)}),/process_failed:55/);
 assert.deepEqual(fs.readdirSync(outputDir),[]);
});
test('local CLI output is still unverified speech and rights evidence',async()=>{
 const out=await run();
 assert.equal(out.observation.schema,'evercraft.voice-foundry.asr-observation.v1');
 assert.equal(out.observation.method,'automated_asr');
 assert.equal(out.record.consentAndRightsVerified,false);
 assert.equal(out.record.transcript.acousticPronunciationVerified,false);
 assert.equal(out.record.transcript.humanListeningVerified,false);
});

test('model or executable changed since authorization is rejected before inference',async()=>{
 await assert.rejects(()=>run({expectedModelSha256:'a'.repeat(64)}),/digest_pin_mismatch/);
 await assert.rejects(()=>run({expectedBinarySha256:'b'.repeat(64)}),/digest_pin_mismatch/);
});
test('production cannot run with unpinned models or executable',async()=>{
 await assert.rejects(()=>run({expectedModelSha256:undefined}),/digest_pins_required/);
 await assert.rejects(()=>run({expectedBinarySha256:undefined}),/digest_pins_required/);
});
