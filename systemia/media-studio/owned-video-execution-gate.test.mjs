import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {planOwnedVideoPlacement} from './owned-video-saban-placement.mjs';
import {makeOwnedVideoLeasePayload,validateOwnedVideoLease,executeApprovedOwnedVideo} from './owned-video-execution-gate.mjs';

const now=new Date('2026-10-25T12:00:00Z');
const worker='b'.repeat(64),weights='c'.repeat(64);
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'
  ?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,ordered(v)])):value;
const sha=value=>createHash('sha256').update(value).digest('hex');
const obsRaw={schema:'evercraft.fallen.gpu-observation.v1',observedAt:now.toISOString(),gpuProbeOk:true,
  gpus:[{index:0,model:'RTX 4090',observed:true,totalVramMiB:24564,freeVramMiB:21000,computeCapability:'8.9'}],
  systemRamGiB:32,outputDiskFreeGiB:90,ffmpegAvailable:true,ffprobeAvailable:true,modelRootPresent:true};
const observation={...obsRaw,observationDigest:sha(JSON.stringify(obsRaw))};
const trusted={authorizedNodeSeed:true,attestationVerified:true,modelRuntimeVerified:true,weightsManifestVerified:true,
  commercialRightsReviewed:true,licenseReceiptId:'wan-license-reviewed-123',workerSha256:worker,weightsManifestSha256:weights,
  boundOfferId:'gpu-offer-01',nodeId:'gpu-node-01',observationDigest:observation.observationDigest,attestationReceiptId:'node-lease-attest-01'};
const offer={schema:'evercraft.saban.compute-offer.v1',offer_id:'gpu-offer-01',provider_id:'evercraft-internal',market:'owned',
  access_class:'authorized_compute',observed_at:now.toISOString(),trust:{attested:true,valid_version:true,audited:true,uptime_7d:1},
  economics:{zero_cost:true},resources:{cpu_units:8,memory_mb:32000,storage_gb:140,gpu_count:1,gpu_models:['rtx 4090']},
  metadata:{device_id:'gpu-node-01',device_class:'desktop',max_concurrency:1,
    supported_workloads:['evercraft.fallen.owned-video.v1'],verified_workloads:['evercraft.fallen.owned-video.v1'],
    conformance_expires_at:'2026-10-25T14:00:00Z',conformance_required:true,
    placement_labels:['evercraft-owned-video','cuda'],locality_tags:['evercraft-owned']}};
const job={schema:'evercraft.fallen.visual-model-job.v1',id:'bakery-opening-01',
  requestId:'bakery-request-1',needId:'dough-shot-1',modelId:'evercraft:owned-video-v1',providerId:'evercraft-local',
  task:'video',prompt:'Cinematic hands folding dough at dawn, warm practical light.',
  durationSec:2,aspectRatio:'9:16',targetResolution:'720p',continuityDigest:'abc12345',references:[],
  outputContract:{commercialRightsRequired:true,provenanceRequired:true}};
const owner=generateKeyPairSync('ed25519'),systemia=generateKeyPairSync('ed25519');
const plan=(args={})=>planOwnedVideoPlacement({job,observation,trusted,offer,now,...args});
const signPayload=(payload,privateKey)=>sign(null,Buffer.from(JSON.stringify(ordered(payload))),privateKey).toString('base64');
function lease(p=plan(),over={}){
  const payload=makeOwnedVideoLeasePayload({placement:p,trusted,
    leaseId:over.leaseId||'lease-'+'4'.repeat(32),issuedAt:over.issuedAt||now.toISOString(),
    expiresAt:over.expiresAt||'2026-10-25T12:02:00Z'});
  return {payload,signatures:{owner:signPayload(payload,owner.privateKey),systemia:signPayload(payload,systemia.privateKey)}};
}
const inputs=more=>({job,observation,trusted,offer,now,ownerPublicKey:owner.publicKey,systemiaPublicKey:systemia.publicKey,...more});
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-lease-candidate-'));
const file=path.join(fixture,'candidate.mp4');
fs.writeFileSync(file,'Synthetic adapter fixture, NOT actual generated footage.');
const fileDigest=sha(fs.readFileSync(file));
after(()=>fs.rmSync(fixture,{recursive:true,force:true}));
const adapter=callback=>({id:'evercraft-local-owned-video-v1',verified:true,modelId:job.modelId,providerId:job.providerId,
  async execute(j){if(callback)callback();return {
    schema:'evercraft.fallen.visual-execution-receipt.v1',jobId:j.id,requestId:j.requestId,needId:j.needId,
    modelId:j.modelId,providerId:j.providerId,continuityDigest:j.continuityDigest,
    commercialRights:'allowed',provenance:'complete',artifact:{path:file,digest:fileDigest,mimeType:'video/mp4'},
    sourceRefs:['owned-worker-sha256:'+worker,'owned-weights-sha256:'+weights]
  };}});

test('placement stays non-executing until two distinct signer keys verify',()=>{
  const p=plan();assert.equal(p.state,'placement_ready_no_execution');
  const v=validateOwnedVideoLease(inputs({placement:p,lease:lease(p)}));
  assert.equal(v.signaturesVerified,true);assert.equal(v.publicationAuthority,false);
});
test('a modified job cannot reuse old approval',()=>{
  const p=plan(),l=lease(p),updated=plan({job:{...job,prompt:'Different bakery and actor with different story.'}});
  assert.throws(()=>validateOwnedVideoLease(inputs({placement:updated,lease:l})),/lease_binding_mismatch/);
});
test('lease expiry and extra command fields fail closed',()=>{
  const p=plan();
  assert.throws(()=>validateOwnedVideoLease(inputs({placement:p,lease:lease(p,{expiresAt:'2026-10-25T11:59:59Z'})})),/lease_expired_or_too_long/);
  assert.throws(()=>validateOwnedVideoLease(inputs({placement:p,lease:lease(p,{expiresAt:'2026-10-25T12:10:00Z'})})),/lease_expired_or_too_long/);
  const l=lease(p);l.payload.command='bash -c anything';
  assert.throws(()=>validateOwnedVideoLease(inputs({placement:p,lease:l})),/lease_fields_unexpected/);
});
test('signatures are separated and may not be forged',()=>{
  const p=plan(),l=lease(p);l.signatures.systemia=l.signatures.owner;
  assert.throws(()=>validateOwnedVideoLease(inputs({placement:p,lease:l})),/systemia_signature_invalid/);
  assert.throws(()=>validateOwnedVideoLease(inputs({placement:p,lease:lease(p),systemiaPublicKey:owner.publicKey})),/signer_separation_required/);
});
test('single-use bound lease produces one tournament candidate but cannot replay',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-lease-'));let runs=0;
  try{
    const l=lease(),args=inputs({lease:l,ledgerRoot:dir,adapter:adapter(()=>runs++)});
    const finished=await executeApprovedOwnedVideo(args);
    assert.equal(finished.receipt.state,'produced_candidate_for_tournament');
    assert.equal(finished.receipt.publicationAuthority,false);assert.equal(runs,1);
    await assert.rejects(()=>executeApprovedOwnedVideo(args),/lease_already_used/);
    assert.equal(runs,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('tampered GPU observation cannot start any worker',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-lease-'));
  try{
    await assert.rejects(()=>executeApprovedOwnedVideo(inputs({lease:lease(),ledgerRoot:dir,
      observation:{...observation,systemRamGiB:999},adapter:adapter()})),/observation_digest_mismatch/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('failed worker burns one-time lease, preserving failure receipt',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-lease-'));let calls=0;
  try{
    const l=lease(),bad=adapter();bad.execute=async()=>{calls++;throw new Error('fake_model_failure');};
    const args=inputs({lease:l,ledgerRoot:dir,adapter:bad});
    await assert.rejects(()=>executeApprovedOwnedVideo(args),/fake_model_failure/);
    assert.equal(fs.existsSync(path.join(dir,l.payload.leaseId,'failure.json')),true);
    await assert.rejects(()=>executeApprovedOwnedVideo(args),/lease_already_used/);
    assert.equal(calls,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('an unverified adapter is rejected before ledger mutation',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-lease-'));
  try{const bad=adapter();bad.verified=false;
    await assert.rejects(()=>executeApprovedOwnedVideo(inputs({lease:lease(),ledgerRoot:dir,adapter:bad})),/registered_attested_adapter_required/);
    assert.deepEqual(fs.readdirSync(dir),[]);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
