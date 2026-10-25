import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNvidiaSmi,evaluateOwnedGpuReadiness,observeLocalGpuHost} from './owned-video-gpu-preflight.mjs';
const TIME='2026-10-25T12:00:00.000Z';
const hex='a'.repeat(64);
const good={schema:'evercraft.fallen.gpu-observation.v1',observedAt:TIME,observationDigest:hex,
 gpuProbeOk:true,gpus:[{index:0,model:'NVIDIA RTX 4090',observed:true,totalVramMiB:24564,freeVramMiB:20480,computeCapability:'8.9'}],
 systemRamGiB:32,outputDiskFreeGiB:90,ffmpegAvailable:true,ffprobeAvailable:true,modelRootPresent:true};
const trust={authorizedNodeSeed:true,attestationVerified:true,modelRuntimeVerified:true,weightsManifestVerified:true,commercialRightsReviewed:true,
 licenseReceiptId:'license-audit-20261025',workerSha256:hex,weightsManifestSha256:hex};
const evaluate=(observation=good,trusted=trust)=>evaluateOwnedGpuReadiness(observation,{trusted,now:new Date(TIME)});

test('nvidia-smi parser differentiates unknown from actual GPU metrics',()=>{
 const [gpu]=parseNvidiaSmi('NVIDIA RTX 4090, 24564, 20000, 8.9\n');
 assert.equal(gpu.observed,true);assert.equal(gpu.freeVramMiB,20000);
 assert.equal(parseNvidiaSmi('NVIDIA RTX 4090, [Not Supported], ???, unknown')[0].observed,false);
});
test('eligible attested physical GPU is only ready for bounded owner approval, never execution',()=>{
 const r=evaluate();assert.equal(r.state,'ready_for_bounded_owner_approval');assert.equal(r.hardwareReady,true);
 assert.deepEqual(r.eligibleGpuIndices,[0]);assert.equal(r.boundaries.executionStarted,false);
 assert.equal(r.boundaries.publicationAuthority,false);
});
test('local-only hardware readings alone never constitute attestation',()=>{
 const r=evaluate(good,{});assert.equal(r.state,'blocked');assert.equal(r.hardwareReady,true);
 assert.ok(r.reasons.includes('owned_node_not_authorized'));
});
test('low VRAM, missing model or insufficient disk reject hardware',()=>{
 const r=evaluate({...good,modelRootPresent:false,outputDiskFreeGiB:4,gpus:[{...good.gpus[0],freeVramMiB:512}]});
 assert.equal(r.hardwareReady,false);assert.ok(r.reasons.includes('no_suitable_cuda_gpu_observed'));
 assert.ok(r.reasons.includes('free_output_storage_insufficient_or_unknown'));
});
test('stale and future observations block admission',()=>{
 assert.ok(evaluate({...good,observedAt:'2026-10-25T11:00:00.000Z'}).reasons.includes('gpu_observation_stale_or_future'));
 assert.ok(evaluate({...good,observedAt:'2026-10-25T12:00:01.000Z'}).reasons.includes('gpu_observation_stale_or_future'));
});
test('malformed attestation hashes and unknown commercial rights block admission',()=>{
 const r=evaluate(good,{...trust,workerSha256:'faker',commercialRightsReviewed:false});
 assert.equal(r.hardwareReady,true);assert.equal(r.state,'blocked');
 assert.ok(r.reasons.includes('commercial_rights_unreviewed'));
});
test('read-only physical observer explicitly disables enrollment and publication',()=>{
 const o=observeLocalGpuHost({clock:new Date(TIME)});
 assert.equal(o.nodeAuthorized,false);assert.equal(o.hardwareAttested,false);assert.equal(o.remoteAccessEnabled,false);
 assert.equal(evaluate(o,{}).state,'blocked');
});