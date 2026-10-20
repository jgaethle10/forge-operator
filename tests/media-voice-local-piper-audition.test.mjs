import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {buildLocalPiperAudition} from '../systemia/media-studio/voice-local-piper-audition.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'piper-ab-fixture-'));
const model=path.join(root,'stub.onnx'),config=path.join(root,'stub.onnx.json'),cli=path.join(root,'stub.cjs');
fs.writeFileSync(model,'not a neural voice model');
fs.writeFileSync(config,JSON.stringify({language:{code:'en_US'},num_speakers:2}));
fs.writeFileSync(cli,[
 '#!/usr/bin/env node',
 "const fs=require('node:fs');",
 "const {spawnSync}=require('node:child_process');",
 'const args=process.argv.slice(2);',
 'const val=k=>args[args.indexOf(k)+1];',
 "if(!fs.existsSync(val('--model'))||!fs.existsSync(val('--config')))process.exit(51);",
 "if(fs.readFileSync(0,'utf8')!=='Our voice is only the beginning.\\n')process.exit(52);",
 "const freq=val('--speaker')==='1'?'460':'330';",
 "const p=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=f='+freq+':r=48000','-t','1.2','-af','volume=0.15','-c:a','pcm_s16le','-y',val('--output_file')],{encoding:'utf8'});",
 'process.exit(p.status===0?0:53);',''
].join('\n'),{mode:0o755});
fs.chmodSync(cli,0o755);
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const candidate=(id,speakerId)=>({
 id,voiceProfileId:'host',accent:'general-american',
 genderPresentation:'unspecified',performanceDirection:'conversational',
 piperCliPath:cli,modelPath:model,modelConfigPath:config,
 expectedBinarySha256:sha(cli),expectedModelSha256:sha(model),expectedConfigSha256:sha(config),
 speakerId,licenseEvidenceRef:'fixture-declaration-unverified',rightsState:'cleared',
});
const plan=()=>({schema:'evercraft.voice-foundry.local-piper-batch.v1',projectId:'batch-fixture',
 scriptText:'Our voice is only the beginning.',locale:'en-US',
 candidates:[candidate('candidate-a',0),candidate('candidate-b',1)]});
const folder=()=>fs.mkdtempSync(path.join(root,'room-'));
test('batch creates two distinct actual audio fixture WAVs and an offline playable listening room',async()=>{
 const dir=folder();const result=await buildLocalPiperAudition({plan:plan(),outputDir:dir});
 assert.equal(result.candidates,2);
 assert.ok(fs.existsSync(result.roomPath));
 assert.equal(result.publicationAuthorityGranted,false);
 assert.equal(result.rightsEvidenceIndependentlyVerified,false);
 const report=JSON.parse(fs.readFileSync(path.join(dir,'listening-room','audition-report.json'),'utf8'));
 assert.equal(report.candidates.length,2);
 assert.equal(report.publicationAuthorityGranted,false);
 assert.equal(report.candidates[0].provider,'piper-local');
 assert.notEqual(report.candidates[0].signal.audioDigest,report.candidates[1].signal.audioDigest);
 assert.equal(report.candidates[0].audibleQualityReviewed,false);
 for(const id of ['candidate-a','candidate-b'])assert.ok(fs.existsSync(path.join(dir,id+'.voice-take.json')));
});
test('zero-cost audition refuses a second batch overwriting its source WAVs or room',async()=>{
 const dir=folder();await buildLocalPiperAudition({plan:plan(),outputDir:dir});
 await assert.rejects(()=>buildLocalPiperAudition({plan:plan(),outputDir:dir}),/audition_already_exists/);
});
test('one model cannot silently switch from American to British English',async()=>{
 const dir=folder();
 await assert.rejects(()=>buildLocalPiperAudition({plan:{...plan(),locale:'en-GB'},outputDir:dir}),/batch_model_locale_mismatch/);
 assert.equal(fs.existsSync(path.join(dir,'listening-room')),false);
});
test('unlicensed or unapproved model in second slot cannot be quietly substituted',async()=>{
 const cfg=plan();cfg.candidates[1].rightsState='unknown';
 const dir=folder();
 await assert.rejects(()=>buildLocalPiperAudition({plan:cfg,outputDir:dir}),/batch_license_evidence_incomplete/);
 assert.equal(fs.existsSync(path.join(dir,'listening-room')),false);
 assert.deepEqual(fs.readdirSync(dir),[],'invalid second candidate must not leave a first take');
});
test('rejects duplicate names and any paid-generation request',async()=>{
 const dupe=plan();dupe.candidates[1].id='candidate-a';
 await assert.rejects(()=>buildLocalPiperAudition({plan:dupe,outputDir:folder()}),/candidate_id_invalid_or_duplicate/);
 await assert.rejects(()=>buildLocalPiperAudition({plan:{...plan(),allowPaidGeneration:true},outputDir:folder()}),/paid_generation_unsupported/);
});

test('second model changing after approved hashes blocks entire batch before creating first WAV',async()=>{
 const cfg=plan();cfg.candidates[1].expectedModelSha256='a'.repeat(64);
 const dir=folder();
 await assert.rejects(()=>buildLocalPiperAudition({plan:cfg,outputDir:dir}),/batch_runtime_digest_mismatch/);
 assert.deepEqual(fs.readdirSync(dir),[]);
});

test('invalid second-take pacing cannot leave a partly completed studio audition',async()=>{
 const cfg=plan();cfg.candidates[1].lengthScale=1.9;
 const dir=folder();
 await assert.rejects(()=>buildLocalPiperAudition({plan:cfg,outputDir:dir}),/batch_candidate_parameter_invalid/);
 assert.deepEqual(fs.readdirSync(dir),[]);
});
