import test from 'node:test';
import assert from 'node:assert/strict';
import {planOwnedVideoPlacement,OWNED_VIDEO_WORKLOAD} from './owned-video-saban-placement.mjs';
const time='2026-10-25T12:00:00Z',hex='a'.repeat(64);
const obs={schema:'evercraft.fallen.gpu-observation.v1',observationDigest:hex,observedAt:time,gpuProbeOk:true,
 gpus:[{index:0,model:'RTX 4090',observed:true,totalVramMiB:24564,freeVramMiB:21000,computeCapability:'8.9'}],
 systemRamGiB:32,outputDiskFreeGiB:90,ffmpegAvailable:true,ffprobeAvailable:true,modelRootPresent:true};
const trust={authorizedNodeSeed:true,attestationVerified:true,modelRuntimeVerified:true,weightsManifestVerified:true,commercialRightsReviewed:true,
 licenseReceiptId:'wan-license-reviewed-123',workerSha256:hex,weightsManifestSha256:hex,
 boundOfferId:'gpu-offer-01',nodeId:'gpu-node-01',observationDigest:hex,attestationReceiptId:'node-lease-attest-01'};
const offer={schema:'evercraft.saban.compute-offer.v1',offer_id:'gpu-offer-01',provider_id:'evercraft-internal',market:'owned',
 access_class:'authorized_compute',observed_at:time,
 trust:{attested:true,valid_version:true,audited:true,uptime_7d:1},
 economics:{zero_cost:true},resources:{cpu_units:8,memory_mb:32000,storage_gb:140,gpu_count:1,gpu_models:['rtx 4090']},
 metadata:{device_id:'gpu-node-01',device_class:'desktop',max_concurrency:1,supported_workloads:[OWNED_VIDEO_WORKLOAD],
 verified_workloads:[OWNED_VIDEO_WORKLOAD],conformance_expires_at:'2026-10-25T14:00:00Z',conformance_required:true,
 placement_labels:['evercraft-owned-video','cuda'],locality_tags:['evercraft-owned']}};
const job={schema:'evercraft.fallen.visual-model-job.v1',id:'bakery-opening-01',modelId:'evercraft:owned-video-v1',providerId:'evercraft-local',
 task:'video',prompt:'Cinematic hands folding dough at dawn, warm practical light.',durationSec:2,aspectRatio:'9:16',targetResolution:'720p',
 continuityDigest:'abc12345',references:[],outputContract:{commercialRightsRequired:true,provenanceRequired:true}};
const plan=(over={})=>planOwnedVideoPlacement({job,observation:obs,trusted:trust,offer,now:new Date(time),...over});

test('fresh attested owned GPU offer yields placement only, never execution',()=>{
 const p=plan();assert.equal(p.state,'placement_ready_no_execution');assert.equal(p.workerStarted,false);
 assert.equal(p.executionAuthorized,false);assert.equal(p.publishingAuthorized,false);assert.equal(p.offerId,offer.offer_id);
});
test('unattested GPU node cannot be placed',()=>{
 const p=plan({trusted:{...trust,authorizedNodeSeed:false}});assert.equal(p.state,'held');
 assert.ok(p.reasons.includes('owned_node_not_authorized'));
});
test('GPU observation must be bound to same Saban offer and device',()=>{
 const p=plan({trusted:{...trust,boundOfferId:'some-other-offer'}});
 assert.equal(p.state,'held');assert.ok(p.reasons.includes('gpu_attestation_not_bound_to_offer'));
});
test('generic container or missing verified workload fails closed',()=>{
 const p=plan({offer:{...offer,metadata:{...offer.metadata,generic_container_runtime:true,verified_workloads:[]}}});
 assert.equal(p.state,'held');assert.ok(p.reasons.includes('generic_container_runtime_not_admissible'));
});
test('stale capacity fails Saban placement, even if GPU observations are fresh',()=>{
 const p=plan({offer:{...offer,observed_at:'2026-10-25T10:00:00Z'}});
 assert.equal(p.state,'held');assert.ok(p.reasons.includes('offer_stale'));
});
test('Saban-held capacity and insufficient memory reject placement',()=>{
 const p=plan({offer:{...offer,resources:{...offer.resources,memory_mb:512}}});
 assert.equal(p.state,'held');assert.ok(p.reasons.includes('insufficient_memory'));
});
test('rejects unsupported models and input references',()=>{
 assert.throws(()=>plan({job:{...job,references:[{id:'x'}]}}),/text_only/);
 assert.throws(()=>plan({job:{...job,modelId:'runway:gen4.5'}}),/provider_invalid/);
});