/**
 * Owned GPU readiness witness. Read-only, local-only and fail-closed.
 * Observing hardware NEVER enrolls a NodeSeed or authorizes video generation.
 */
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const sha=obj=>createHash('sha256').update(JSON.stringify(obj)).digest('hex');
const ONE_GIB=1024**3;
const sortUnique=a=>[...new Set(a)].sort();

/** Parse nvidia-smi's comma-separated fields without treating unknown as 0. */
export function parseNvidiaSmi(text=''){
  return String(text).split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map((line,index)=>{
    const fields=line.split(',').map(s=>s.trim());
    if(fields.length!==4)return {index,model:null,totalVramMiB:null,freeVramMiB:null,computeCapability:null,observed:false};
    const [model,total,free,compute]=fields;
    const totalMib=Number(total),freeMib=Number(free);
    const cc=/^\d+\.\d+$/.test(compute)?compute:null;
    const valid=model.length>2&&Number.isFinite(totalMib)&&totalMib>0&&Number.isFinite(freeMib)&&freeMib>=0&&freeMib<=totalMib&&cc!==null;
    return {index,model:valid?model:null,totalVramMiB:valid?totalMib:null,freeVramMiB:valid?freeMib:null,computeCapability:cc,observed:valid};
  });
}

function boundedCommand(cmd,args,{maxBytes=4096,timeout=5000}={}){
  const r=spawnSync(cmd,args,{encoding:'utf8',timeout,maxBuffer:maxBytes,windowsHide:true,env:{...process.env,HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1'}});
  return r.error||r.status!==0?{ok:false}: {ok:true,output:r.stdout.slice(0,maxBytes)};
}

/** Raw facts only. Does not grant attestation, authorization, or rights. */
export function observeLocalGpuHost({clock=new Date(),modelRoot=null,outputRoot=null}={}){
  const probe=boundedCommand('nvidia-smi',[
    '--query-gpu=name,memory.total,memory.free,compute_cap','--format=csv,noheader,nounits',
  ]);
  const tool=name=>boundedCommand(name,['-version']).ok;
  let diskFreeGiB=null;
  if(outputRoot){
    try{const stat=fs.statfsSync(path.resolve(outputRoot));diskFreeGiB=Number((stat.bavail*stat.bsize/ONE_GIB).toFixed(2));}catch{}
  }
  const raw={
    schema:'evercraft.fallen.gpu-observation.v1',
    observedAt:new Date(clock).toISOString(),
    observationSource:'local-readonly',
    osPlatform:process.platform,architecture:process.arch,
    systemRamGiB:Number((os.totalmem()/ONE_GIB).toFixed(2)),
    gpuProbeOk:probe.ok,
    gpus:probe.ok?parseNvidiaSmi(probe.output):[],
    ffmpegAvailable:tool('ffmpeg'),
    ffprobeAvailable:tool('ffprobe'),
    modelRootPresent:Boolean(modelRoot&&fs.existsSync(path.resolve(modelRoot))),
    outputDiskFreeGiB:diskFreeGiB,
    nodeAuthorized:false,hardwareAttested:false,
    installedModelLicenseReviewed:false,weightsManifestVerified:false,
    modelRuntimeVerified:false,
    privatePathsDisclosed:false,remoteAccessEnabled:false,
  };
  return {...raw,observationDigest:sha(raw)};
}

function positive(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0;}

/**
 * Pure admission evaluator. `trusted` must be set by independent operator/Saban
 * attestation; never copy it from the local self-observation payload.
 */
export function evaluateOwnedGpuReadiness(observation,{trusted={},now=new Date(),minimumVramGiB=10,minimumFreeVramGiB=8,minimumRamGiB=12,minimumDiskGiB=25,maxAgeMs=300_000}={}){
  const reasons=[];
  const requireGate=(ok,reason)=>{if(!ok)reasons.push(reason);};
  const at=Date.parse(String(observation?.observedAt||''));
  const time=now instanceof Date?now.getTime():Date.parse(String(now));
  requireGate(observation?.schema==='evercraft.fallen.gpu-observation.v1','gpu_observation_schema_invalid');
  requireGate(Number.isFinite(time)&&Number.isFinite(at)&&at<=time&&time-at<=maxAgeMs,'gpu_observation_stale_or_future');
  requireGate(observation?.gpuProbeOk===true,'nvidia_gpu_probe_unavailable');
  const minTotal=minimumVramGiB*1024,minFree=minimumFreeVramGiB*1024;
  const eligible=(observation?.gpus||[]).filter(g=>g.observed===true&&positive(g.totalVramMiB)&&positive(g.freeVramMiB)&&g.totalVramMiB>=minTotal&&g.freeVramMiB>=minFree&&/^\d+\.\d+$/.test(g.computeCapability||''));
  requireGate(eligible.length>0,'no_suitable_cuda_gpu_observed');
  requireGate(positive(observation?.systemRamGiB)&&observation.systemRamGiB>=minimumRamGiB,'host_ram_insufficient_or_unknown');
  requireGate(positive(observation?.outputDiskFreeGiB)&&observation.outputDiskFreeGiB>=minimumDiskGiB,'free_output_storage_insufficient_or_unknown');
  requireGate(observation?.ffmpegAvailable===true&&observation.ffprobeAvailable===true,'media_toolchain_missing');
  requireGate(observation?.modelRootPresent===true,'local_model_files_missing');
  const hardwareReasons=[...reasons];
  requireGate(trusted.authorizedNodeSeed===true,'owned_node_not_authorized');
  requireGate(trusted.attestationVerified===true,'hardware_attestation_missing');
  requireGate(trusted.modelRuntimeVerified===true,'local_model_runtime_not_verified');
  requireGate(trusted.weightsManifestVerified===true,'model_weights_manifest_not_verified');
  requireGate(trusted.commercialRightsReviewed===true,'commercial_rights_unreviewed');
  requireGate(typeof trusted.licenseReceiptId==='string'&&trusted.licenseReceiptId.trim().length>5,'license_evidence_missing');
  requireGate(typeof trusted.workerSha256==='string'&&/^[a-f0-9]{64}$/i.test(trusted.workerSha256),'worker_artifact_digest_missing');
  requireGate(typeof trusted.weightsManifestSha256==='string'&&/^[a-f0-9]{64}$/i.test(trusted.weightsManifestSha256),'weights_manifest_digest_missing');
  const result={
    schema:'evercraft.fallen.gpu-readiness.v1',
    state:reasons.length===0?'ready_for_bounded_owner_approval':'blocked',
    hardwareReady:hardwareReasons.length===0,
    eligibleGpuIndices:eligible.map(g=>g.index),
    reasons:sortUnique(reasons),
    observationDigest:observation?.observationDigest||null,
    requirements:{minimumVramGiB,minimumFreeVramGiB,minimumRamGiB,minimumDiskGiB,maxAgeMs},
    boundaries:{remoteWorkerEnrolled:false,paidGenerationAuthorized:false,publicationAuthority:false,executionStarted:false},
  };
  return {...result,readinessDigest:sha(result)};
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
  const args=process.argv.slice(2);
  if(args.includes('--help')){
    process.stdout.write('Usage: node owned-video-gpu-preflight.mjs --observe [--model-root PATH] [--output-root PATH]\n');
  }else if(args[0]==='--observe'){
    const value=flag=>{const i=args.indexOf(flag);return i>=0?args[i+1]??null:null;};
    const observed=observeLocalGpuHost({modelRoot:value('--model-root'),outputRoot:value('--output-root')});
    const readiness=evaluateOwnedGpuReadiness(observed);
    process.stdout.write(JSON.stringify({observed,readiness},null,2)+'\n');
  }else{
    process.stderr.write('Specify --observe or --help. Never authorizes an actual job.\n');process.exitCode=2;
  }
}