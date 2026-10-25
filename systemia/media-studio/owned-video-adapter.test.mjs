import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {createOwnedVideoAdapter,ownedVideoEndpoint} from './owned-video-adapter.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
const runnerSource=`import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const index=process.argv.indexOf('--request');const outIndex=process.argv.indexOf('--output');
if(index<0||outIndex<0)process.exit(12);
const req=JSON.parse(fs.readFileSync(process.argv[index+1],'utf8'));
const output=process.argv[outIndex+1];const file=path.join(output,'shot.mp4');
const mode=process.env.EVERCRAFT_TEST_STATIC==='1'?'color=c=black:s=720x1280:r=24':'testsrc2=size=720x1280:rate=24';
const ff=spawnSync('ffmpeg',['-y','-v','error','-f','lavfi','-i',mode,'-t',String(req.durationSec),'-c:v','libx264','-preset','ultrafast','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart',file]);
if(ff.status!==0){console.error(ff.stderr.toString());process.exit(ff.status||1)}
const digest=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.writeFileSync(path.join(output,'worker-receipt.json'),JSON.stringify({
 schema:'evercraft.local-video.worker-receipt.v1',jobId:req.jobId,modelId:req.modelId,
 weightsSha256:req.weightsSha256,workerBuildDigest:req.workerBuildDigest,
 modelLicenseId:req.modelLicenseId,continuityDigest:req.continuityDigest,
 localInference:true,artifactSha256:process.env.EVERCRAFT_TEST_BAD_HASH==='1'?'0'.repeat(64):digest
}));
`;
function specimen(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-owned-video-test-'));
  const script=path.join(root,'worker.mjs');fs.writeFileSync(script,runnerSource);
  const weightsSha256=hash('sample-local-model-weights');
  const config={verified:true,runnerCommand:process.execPath,runnerArgs:[script],workerArtifactPath:script,
    outputDir:path.join(root,'out'),inputRoots:[root],weightsSha256,
    workerBuildDigest:hash(Buffer.from(runnerSource)),modelLicenseId:'test-only-license',
    rightsApproved:true,licenseEvidenceRefs:['test:fixture-rights'],'timeoutMs':120_000};
  const job={schema:'evercraft.fallen.visual-model-job.v1',id:'test-shot-001',requestId:'req-001',needId:'need-001',
    modelId:'evercraft:owned-video-v1',providerId:'evercraft-local',task:'video',
    prompt:'Closeup of hands carefully kneading dough with genuine motion.',durationSec:2,
    aspectRatio:'9:16',targetResolution:'720p',continuityDigest:'canon-001',references:[],
    requires:['commercial_rights','provenance_receipt'],outputContract:{commercialRightsRequired:true,provenanceRequired:true,
      artifactDigestRequired:true,tournamentCandidateRequired:true}};
  return {root,script,config,job,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('not-verified by default: no commercial/render authorization',async()=>{
  assert.equal(ownedVideoEndpoint().executionState,'declared');
  const f=specimen();try{const adapter=createOwnedVideoAdapter({...f.config,verified:false});
    assert.equal(adapter.verified,false);
    await assert.rejects(()=>adapter.execute(f.job),/not_attested/);
  }finally{f.cleanup()}
});
test('local moving MP4 is hashed, decoded, motion audited and remains unpublished',async()=>{
  const f=specimen();try{
    const adapter=createOwnedVideoAdapter(f.config);assert.equal(adapter.verified,true);
    const receipt=await adapter.execute(f.job);
    assert.equal(receipt.commercialRights,'allowed');
    assert.equal(receipt.providerId,'evercraft-local');
    assert.equal(receipt.artifact.width,720);assert.equal(receipt.artifact.height,1280);
    assert.equal(hash(fs.readFileSync(receipt.artifact.path)),receipt.artifact.digest);
    const proof=JSON.parse(fs.readFileSync(receipt.artifact.path+'.receipt.json','utf8'));
    assert.equal(proof.publicationAuthority,false);
    assert.equal(proof.acceptedForTournament,true);
    assert.ok(proof.motion.sampledFrames>=3);
    assert.ok(proof.motion.meanFrameDelta>=.60);
  }finally{f.cleanup()}
});
test('worker script mutation fails attestation after adapter was created',async()=>{
  const f=specimen();try{const adapter=createOwnedVideoAdapter(f.config);
    fs.appendFileSync(f.script,'// changed');
    await assert.rejects(()=>adapter.execute(f.job),/build_changed/);
  }finally{f.cleanup()}
});
test('rejects unknown commercial license state and nonlocal references',async()=>{
  const f=specimen();try{
    const denied=createOwnedVideoAdapter({...f.config,rightsApproved:false});
    assert.equal(denied.verified,false);
    await assert.rejects(()=>denied.execute(f.job),/not_attested/);
    const adapter=createOwnedVideoAdapter(f.config);
    const job={...f.job,references:[{id:'reference-1',kind:'image',role:'start_frame',
      digest:'a'.repeat(64),sourceRefs:['test:external'],locator:{kind:'url',value:'https://example.org/photo.jpg'}}]};
    await assert.rejects(()=>adapter.execute(job),/local_file_reference_required/);
  }finally{f.cleanup()}
});
test('reused or missing source digest is refused before executing worker',async()=>{
  const f=specimen();try{
    const file=path.join(f.root,'original.png');fs.writeFileSync(file,Buffer.from('test-image'));
    const ref={id:'ref-1',kind:'image',role:'start_frame',sourceRefs:['owned:test'],
      digest:hash('different-input'),locator:{kind:'url',value:new URL('file://'+file).toString()}};
    const adapter=createOwnedVideoAdapter(f.config);
    await assert.rejects(()=>adapter.execute({...f.job,references:[ref]}),/reference_digest_mismatch/);
  }finally{f.cleanup()}
});

test('static output from worker is rejected even when MP4 is valid and attested',async()=>{
  const f=specimen();try{
    const previous=process.env.EVERCRAFT_TEST_STATIC;process.env.EVERCRAFT_TEST_STATIC='1';
    try{await assert.rejects(()=>createOwnedVideoAdapter(f.config).execute(f.job),/static_or_low_motion_rejected/);}
    finally{if(previous===undefined)delete process.env.EVERCRAFT_TEST_STATIC;else process.env.EVERCRAFT_TEST_STATIC=previous;}
  }finally{f.cleanup()}
});
test('refuses to overclaim 1080p native output from a 480p model',async()=>{
  const f=specimen();try{
    await assert.rejects(()=>createOwnedVideoAdapter(f.config).execute({...f.job,targetResolution:'1080p'}),/resolution_invalid/);
  }finally{f.cleanup()}
});