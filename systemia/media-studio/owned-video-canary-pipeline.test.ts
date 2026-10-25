import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildVisualModelPlan} from './model-fabric.js';
import {ownedVideoEndpoint} from './owned-video-adapter.mjs';
import {planOwnedVideoPlacement,OWNED_VIDEO_WORKLOAD} from './owned-video-saban-placement.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const request=JSON.parse(fs.readFileSync(path.join(here,'campaigns/before-the-doors-canary-01.json'),'utf8'));
const hex='f'.repeat(64);
const clock='2026-10-25T12:00:00Z';
const trusted={
  authorizedNodeSeed:true,attestationVerified:true,modelRuntimeVerified:true,
  weightsManifestVerified:true,commercialRightsReviewed:true,licenseReceiptId:'wan-reviewed-20261025',
  workerSha256:hex,weightsManifestSha256:hex,boundOfferId:'node-gpu-01',
  nodeId:'node-gpu-01',observationDigest:hex,attestationReceiptId:'node-attest-20261025',
};
const observation={
  schema:'evercraft.fallen.gpu-observation.v1',observedAt:clock,observationDigest:hex,
  gpuProbeOk:true,gpus:[{index:0,model:'RTX 4090',observed:true,totalVramMiB:24564,freeVramMiB:20000,computeCapability:'8.9'}],
  ffmpegAvailable:true,ffprobeAvailable:true,modelRootPresent:true,
  systemRamGiB:32,outputDiskFreeGiB:90
};
const offer={
  schema:'evercraft.saban.compute-offer.v1',offer_id:'node-gpu-01',provider_id:'evercraft-internal',market:'owned',
  access_class:'authorized_compute',observed_at:clock,
  trust:{attested:true,valid_version:true,audited:true,uptime_7d:1},
  economics:{zero_cost:true},resources:{cpu_units:8,memory_mb:32000,storage_gb:120,gpu_count:1,gpu_models:['RTX 4090']},
  metadata:{device_id:'node-gpu-01',device_class:'desktop',max_concurrency:1,
    supported_workloads:[OWNED_VIDEO_WORKLOAD],verified_workloads:[OWNED_VIDEO_WORKLOAD],
    conformance_expires_at:'2026-10-25T13:00:00Z',conformance_required:true,
    placement_labels:['evercraft-owned-video','cuda'],locality_tags:['evercraft-owned']}
};

test('the original first shot cannot route while the actual model adapter is unverified',()=>{
  const p=buildVisualModelPlan(request,[ownedVideoEndpoint(false)]);
  assert.equal(p.status,'blocked');
  assert.deepEqual(p.jobs,[]);
  assert.deepEqual(p.rejectedModels[0].reasons,['endpoint_not_verified']);
  assert.equal(p.boundaries.directPublicationAuthority,false);
});

test('verified model endpoint converts the exact canary into one bounded Saban-compatible job',()=>{
  // This endpoint is a routing fixture only. It does not attest to a GPU,
  // weights, a model runtime, a signature, or real media generation.
  const p=buildVisualModelPlan(request,[ownedVideoEndpoint(true)]);
  assert.equal(p.status,'routed');
  assert.equal(p.jobs.length,1);
  const job=p.jobs[0];
  assert.equal(job.requestId,request.id);
  assert.equal(job.needId,request.needId);
  assert.equal(job.modelId,'evercraft:owned-video-v1');
  assert.equal(job.providerId,'evercraft-local');
  assert.equal(job.prompt,request.prompt);
  assert.equal(job.continuityDigest,request.continuityDigest);
  assert.equal(job.targetResolution,'720p');
  assert.equal(job.durationSec,2);
  assert.deepEqual(job.references,[]);
  assert.equal(job.outputContract.commercialRightsRequired,true);
  assert.equal(job.outputContract.provenanceRequired,true);
  assert.equal(job.outputContract.tournamentCandidateRequired,true);
  const placement=planOwnedVideoPlacement({
    job,observation,trusted,offer,now:new Date(clock)
  });
  assert.equal(placement.state,'placement_ready_no_execution');
  assert.equal(placement.executionAuthorized,false);
  assert.equal(placement.workerStarted,false);
  assert.equal(placement.publishingAuthorized,false);
  assert.equal(placement.workloadClass,OWNED_VIDEO_WORKLOAD);
});

test('the routed job cannot gain execution permission from fictitious or stale Saban capacity',()=>{
  const job=buildVisualModelPlan(request,[ownedVideoEndpoint(true)]).jobs[0];
  const held=planOwnedVideoPlacement({
    job,observation,trusted,offer:{...offer,resources:{...offer.resources,gpu_count:0}},now:new Date(clock)
  });
  assert.equal(held.state,'held');
  assert.equal(held.executionAuthorized,false);
  assert.ok(held.reasons.includes('saban_offer_no_gpu'));
  const stale=planOwnedVideoPlacement({
    job,observation,trusted,offer,now:new Date('2026-10-25T12:07:00Z')
  });
  assert.equal(stale.state,'held');
  assert.equal(stale.executionAuthorized,false);
});

test('no historical commercial is an asset source for the first canary',()=>{
  const sources=[...request.sourceRefs,...request.references.flatMap((r:any)=>r.sourceRefs||[])].join(' ').toLowerCase();
  assert.equal(/relay|rc35|rc02|rc03/.test(sources),false);
  assert.equal(request.task,'video');
});
