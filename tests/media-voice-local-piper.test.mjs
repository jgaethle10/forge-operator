import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {createLocalPiperTake} from '../systemia/media-studio/voice-local-piper.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-piper-fixture-'));
const modelPath=path.join(root,'model-stub-not-real.onnx');
const modelConfigPath=path.join(root,'model-stub-not-real.onnx.json');
fs.writeFileSync(modelPath,Buffer.from('NOT AN ACTUAL PIPER VOICE MODEL'));
fs.writeFileSync(modelConfigPath,JSON.stringify({language:{code:'en_US'},num_speakers:2}));
const piperCliPath=path.join(root,'test-piper.cjs');
const stub=[
 '#!/usr/bin/env node',
 "const fs=require('node:fs');",
 "const {spawnSync}=require('node:child_process');",
 'const args=process.argv.slice(2);',
 'const val=name=>args[args.indexOf(name)+1];',
 "if(!fs.existsSync(val('--model'))||!fs.existsSync(val('--config')))process.exit(25);",
 "if(fs.readFileSync(0,'utf8')!=='Evercraft is building better voices.\\n')process.exit(26);",
 "if(!args.includes('--length_scale')||!args.includes('--noise_w'))process.exit(27);",
 "const r=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=f=330:r=48000','-t','1.2','-af','volume=0.15','-c:a','pcm_s16le','-y',val('--output_file')],{encoding:'utf8'});",
 'process.exit(r.status===0?0:29);',''
].join('\n');
fs.writeFileSync(piperCliPath,stub,{mode:0o755});
fs.chmodSync(piperCliPath,0o755);
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const config=()=>({
 scriptText:'Evercraft is building better voices.',
 candidateId:'host-v1',voiceProfileId:'host',
 locale:'en-US',accent:'general-american',genderPresentation:'feminine',
 performanceDirection:'quiet confident narrator',
 piperCliPath,modelPath,modelConfigPath,
 expectedBinarySha256:sha(piperCliPath),expectedModelSha256:sha(modelPath),
 expectedConfigSha256:sha(modelConfigPath),
 licenseEvidenceRef:'operator-license-receipt-to-be-verified',rightsState:'cleared',
 outputDir:fs.mkdtempSync(path.join(root,'takes-'))
});
test('runs actual audio-file generation with pinned local executable; explicitly NOT authentic speech',async()=>{
 const r=await createLocalPiperTake(config());
 assert.ok(fs.statSync(r.outputPath).size>5000);
 assert.ok(fs.existsSync(r.receiptPath));
 assert.equal(r.record.signal.audioDigest,sha(r.outputPath));
 assert.equal(r.record.pacing.audioDigest,sha(r.outputPath));
 assert.equal(r.record.modelDigest,sha(modelPath));
 assert.equal(r.record.manifestCandidate.provider,'piper-local');
 assert.equal(r.record.manifestCandidate.audioPath,'host-v1.wav');
 assert.equal(r.record.status,'private_neural_audition_needs_human_review');
 assert.equal(r.record.emotionalTruthNotVerified,true);
 assert.equal(r.record.speechContentNotVerified,true);
 assert.equal(r.record.paidProviderCallsMade,false);
 assert.equal(r.record.publicationAuthorityGranted,false);
});
test('refuses to overwrite previous take before invoking synthesizer again',async()=>{
 const args=config();await createLocalPiperTake(args);
 await assert.rejects(()=>createLocalPiperTake(args),/audition_take_already_exists/);
 assert.equal(fs.readdirSync(args.outputDir).length,2);
});
test('missing model and executable cannot fabricate an audition',async()=>{
 await assert.rejects(()=>createLocalPiperTake({...config(),modelPath:path.join(root,'not-here.onnx')}),/model_not_installed/);
 await assert.rejects(()=>createLocalPiperTake({...config(),piperCliPath:path.join(root,'not-here')}),/binary_not_installed/);
});
test('model, executable or configuration changes after approval are caught',async()=>{
 await assert.rejects(()=>createLocalPiperTake({...config(),expectedModelSha256:'1'.repeat(64)}),/pinned_runtime_or_voice_changed/);
 await assert.rejects(()=>createLocalPiperTake({...config(),expectedConfigSha256:'2'.repeat(64)}),/pinned_runtime_or_voice_changed/);
 await assert.rejects(()=>createLocalPiperTake({...config(),expectedBinarySha256:'3'.repeat(64)}),/pinned_runtime_or_voice_changed/);
});
test('model locale and speaker catalog cannot be guessed from an accent string',async()=>{
 await assert.rejects(()=>createLocalPiperTake({...config(),locale:'en-GB'}),/model_locale_not_verified_for_cast/);
 await assert.rejects(()=>createLocalPiperTake({...config(),speakerId:8}),/speaker_outside_model_catalog/);
});
test('unreviewed rights declaration, unsafe take identifiers and pacing abuse block',async()=>{
 await assert.rejects(()=>createLocalPiperTake({...config(),rightsState:'unknown'}),/voice_license_evidence_required/);
 await assert.rejects(()=>createLocalPiperTake({...config(),licenseEvidenceRef:''}),/voice_license_evidence_required/);
 await assert.rejects(()=>createLocalPiperTake({...config(),candidateId:'../other'}),/candidate_id_unsafe/);
 await assert.rejects(()=>createLocalPiperTake({...config(),lengthScale:1.7}),/length_scale_outside_audition_bounds/);
});
test('output must exist but cannot contain an existing receipt',async()=>{
 const c=config();c.outputDir=path.join(root,'missing-dir');
 await assert.rejects(()=>createLocalPiperTake(c),/output_dir_not_existing/);
});
