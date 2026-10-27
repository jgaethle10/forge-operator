/**
 * Bind one locally attested Fallen video shot to an explicitly authorized
 * Saban GPU offer. A placement plan is NOT a remote execution capability.
 * No transport, command, shell path, model bytes or publication permissions.
 */
import {createHash} from 'node:crypto';
import {normalizeFabricTask,planHeterogeneousFabric} from '../saban/heterogeneous-fabric-planner.mjs';
import {evaluateOwnedGpuReadiness} from './owned-video-gpu-preflight.mjs';

const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const OWNED_VIDEO_WORKLOAD='evercraft.fallen.owned-video.v1';
const expect=(condition,message)=>{if(!condition)throw new Error(message);};

function validateShot(job){
  expect(job?.schema==='evercraft.fallen.visual-model-job.v1','owned_video_saban_job_schema_invalid');
  expect(job.task==='video'&&job.modelId==='evercraft:owned-video-v1'&&job.providerId==='evercraft-local','owned_video_saban_provider_invalid');
  expect(typeof job.id==='string'&&job.id.length>=3&&job.id.length<=130,'owned_video_saban_job_id_invalid');
  expect(typeof job.continuityDigest==='string'&&job.continuityDigest.length>=8,'owned_video_saban_continuity_missing');
  expect(job.targetResolution==='720p'&&['9:16','16:9'].includes(job.aspectRatio),'owned_video_saban_media_shape_invalid');
  expect(Number.isFinite(job.durationSec)&&job.durationSec>=1&&job.durationSec<=10,'owned_video_saban_duration_invalid');
  expect(Array.isArray(job.references)&&job.references.length===0,'owned_video_saban_v1_text_only');
  expect(typeof job.prompt==='string'&&job.prompt.length>=12,'owned_video_saban_prompt_invalid');
  expect(job.outputContract?.commercialRightsRequired===true&&job.outputContract?.provenanceRequired===true,'owned_video_saban_provenance_required');
}

export function planOwnedVideoPlacement({job,observation,trusted,offer,now=new Date()}={}){
  validateShot(job);
  const readiness=evaluateOwnedGpuReadiness(observation,{trusted,now});
  const holds=[];
  if(readiness.state!=='ready_for_bounded_owner_approval')holds.push(...readiness.reasons);
  const offerId=String(offer?.offer_id||'');
  if(offer?.schema!=='evercraft.saban.compute-offer.v1')holds.push('saban_offer_schema_invalid');
  if(offer?.access_class!=='authorized_compute')holds.push('unauthorized_saban_offer');
  if(offer?.trust?.attested!==true||offer?.trust?.valid_version!==true)holds.push('saban_offer_not_attested');
  if(offer?.resources?.gpu_count<1)holds.push('saban_offer_no_gpu');
  if(offer?.metadata?.generic_container_runtime===true)holds.push('generic_container_runtime_not_admissible');
  if(!offer?.metadata?.supported_workloads?.includes(OWNED_VIDEO_WORKLOAD))holds.push('saban_workload_not_registered');
  if(trusted?.boundOfferId!==offerId||trusted?.nodeId!==offer?.metadata?.device_id||trusted?.observationDigest!==observation?.observationDigest){
    holds.push('gpu_attestation_not_bound_to_offer');
  }
  if(!trusted?.attestationReceiptId||String(trusted.attestationReceiptId).trim().length<8){
    holds.push('gpu_attestation_receipt_missing');
  }
  const metadata=offer?.metadata||{};
  if(!metadata.verified_workloads?.includes(OWNED_VIDEO_WORKLOAD))holds.push('saban_workload_conformance_not_verified');
  const until=Date.parse(String(metadata.conformance_expires_at||''));
  if(!Number.isFinite(until)||until<=(now instanceof Date?now.getTime():Date.parse(String(now)))){
    holds.push('saban_workload_conformance_expired');
  }
  if(holds.length){
    return {schema:'evercraft.fallen.owned-video-placement-intent.v1',state:'held',jobId:job.id,
      reasons:[...new Set(holds)].sort(),readinessDigest:readiness.readinessDigest,
      executionAuthorized:false,workerStarted:false,publishingAuthorized:false};
  }

  const task=normalizeFabricTask({
    task_id:'fallen-owned-video-'+sha(job.id+'|'+job.continuityDigest).slice(0,20),
    workload_class:OWNED_VIDEO_WORKLOAD,
    execution_shape:'atomic',shard_count:1,replicas:1,
    resources:{cpu_units:2,memory_mb:12288,storage_gb:35,gpu_count:1},
    required_labels:['evercraft-owned-video','cuda'],
    required_locality_tags:['evercraft-owned'],
    forbidden_device_classes:['micro','micro_node','browser','mobile','gateway'],
    require_attestation:true,allowed_access_classes:['authorized_compute'],private_data:true,
    preemptible:false,checkpointable:false,max_observation_age_ms:300000,
    input_bytes:0,output_bytes:0,local_only:true,
    created_at:(now instanceof Date?now:new Date(now)).toISOString(),
  });
  const plan=planHeterogeneousFabric({tasks:[task],offers:[offer],now});
  const chosen=plan.placements?.[0];
  const matched=plan.state==='ready'&&plan.placements.length===1&&chosen.offer_id===offerId;
  const core={
    schema:'evercraft.fallen.owned-video-placement-intent.v1',
    state:matched?'placement_ready_no_execution':'held',
    jobId:job.id,jobDigest:sha({id:job.id,prompt:job.prompt,continuityDigest:job.continuityDigest}),
    taskId:task.task_id,workloadClass:OWNED_VIDEO_WORKLOAD,offerId,
    readinessDigest:readiness.readinessDigest,planDigest:plan.receipt_hash,
    reasons:matched?[]:['saban_fabric_no_eligible_placement',...new Set(plan.held?.flatMap(h=>h.candidate_rejections?.flatMap(r=>r.reasons)??[])??[])],
    executionAuthorized:false,workerStarted:false,publishingAuthorized:false,
    nextAction:'Owner and Systemia must explicitly authorize a bounded NodeSeed lease and rerun admission at execution time.',
  };
  return {...core,intentDigest:sha(core)};
}