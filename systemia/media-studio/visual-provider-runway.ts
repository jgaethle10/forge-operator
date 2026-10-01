import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { VisualExecutionReceipt, VisualModelAdapter } from './model-fabric-runtime.js';
import type { VisualModelEndpoint, VisualModelJob, VisualReferenceLocator } from './model-fabric.js';

type FetchLike=(input:string,init?:{
  method?:string;
  headers?:Record<string,string>;
  body?:string;
})=>Promise<{
  ok:boolean;
  status:number;
  json():Promise<any>;
  arrayBuffer():Promise<ArrayBuffer>;
  text():Promise<string>;
}>;

export interface RunwayGen45AdapterConfig {
  apiKey:string;
  outputDir:string;
  verified:boolean;
  commercialRights:'allowed'|'unknown';
  allowPaidGeneration?:boolean;
  baseUrl?:string;
  pollIntervalMs?:number;
  maxPolls?:number;
  fetchImpl?:FetchLike;
}

const DOCS=[
  'https://docs.dev.runwayml.com/guides/using-the-api/',
  'https://docs.dev.runwayml.com/assets/outputs/',
  'https://docs.dev.runwayml.com/assets/inputs/',
];

export function runwayGen45Endpoint(verified=false):VisualModelEndpoint{
  return {
    id:'runway:gen4.5',
    providerId:'runway',
    displayName:'Runway Gen-4.5',
    enabled:true,
    executionState:verified?'verified':'declared',
    capabilities:[{
      task:'video',
      inputModes:['text','image_reference','start_frame'],
      requirements:['reference_identity','commercial_rights','provenance_receipt','timing_control'],
      aspectRatios:['16:9','9:16'],
      maxDurationSec:10,
      maxReferences:1,
      referenceRoles:['identity','start_frame'],
      identityContinuityViaStartFrame:true,
      framesExclusiveWithReferences:true,
      batchVariants:1,
      qualityTier:5,
      costTier:4,
      latencyTier:3,
    }]
  };
}

function sleep(ms:number){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

function fetcher(config:RunwayGen45AdapterConfig):FetchLike{
  const impl=config.fetchImpl??(globalThis.fetch as unknown as FetchLike);
  if(!impl) throw new Error('runway_fetch_unavailable');
  return impl;
}

function promptImage(locator:VisualReferenceLocator|undefined){
  if(!locator) throw new Error('runway_start_frame_locator_missing');
  if(locator.kind==='url'||locator.kind==='data_uri') return locator.value;
  throw new Error(`runway_start_frame_locator_unsupported:${locator.kind}`);
}

function validateJob(job:VisualModelJob){
  if(job.task!=='video') throw new Error('runway_gen45_video_only');
  if(job.modelId!=='runway:gen4.5') throw new Error('runway_model_binding_mismatch');
  if(job.providerId!=='runway') throw new Error('runway_provider_binding_mismatch');
  if(job.durationSec!==undefined&&(job.durationSec<2||job.durationSec>10)){
    throw new Error('runway_gen45_duration_unsupported');
  }
  if(job.aspectRatio&&!['16:9','9:16'].includes(job.aspectRatio)){
    throw new Error('runway_gen45_aspect_unsupported');
  }
  if(job.references.some(ref=>ref.role==='end_frame')){
    throw new Error('runway_gen45_end_frame_not_supported_by_adapter');
  }
  const promptRefs=job.references.filter(
    ref=>ref.role==='start_frame'||(ref.role==='identity'&&ref.kind==='image')
  );
  if(promptRefs.length>1){
    throw new Error('runway_gen45_multiple_prompt_images_unsupported');
  }
}

function ratio(job:VisualModelJob){
  return job.aspectRatio==='9:16'?'720:1280':'1280:720';
}

export function createRunwayGen45Adapter(
  config:RunwayGen45AdapterConfig,
):VisualModelAdapter{
  const base=(config.baseUrl??'https://api.dev.runwayml.com').replace(/\/$/,'');
  const pollIntervalMs=config.pollIntervalMs??5_000;
  const maxPolls=config.maxPolls??120;
  return {
    id:'runway-adapter:gen4.5',
    modelId:'runway:gen4.5',
    providerId:'runway',
    verified:config.verified,
    async execute(job:VisualModelJob):Promise<VisualExecutionReceipt>{
      validateJob(job);
      if(!config.apiKey?.trim()) throw new Error('runway_api_key_missing');
      if(config.allowPaidGeneration!==true) throw new Error('runway_paid_generation_not_authorized');
      const fetchImpl=fetcher(config);
      const start=job.references.find(ref=>ref.role==='start_frame');
      const identity=job.references.find(ref=>ref.role==='identity'&&ref.kind==='image');
      const promptRef=start??identity;
      const body:any={
        model:'gen4.5',
        promptText:job.prompt,
        ratio:ratio(job),
        duration:job.durationSec??5,
      };
      if(promptRef) body.promptImage=promptImage(promptRef.locator);

      const created=await fetchImpl(`${base}/v1/image_to_video`,{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Authorization':`Bearer ${config.apiKey}`,
          'X-Runway-Version':'2024-11-06',
        },
        body:JSON.stringify(body),
      });
      if(!created.ok){
        throw new Error(`runway_create_failed:${created.status}:${(await created.text()).slice(0,500)}`);
      }
      const createPayload=await created.json();
      const taskId=String(createPayload?.id??'');
      if(!taskId) throw new Error('runway_task_id_missing');

      let terminal:any=null;
      for(let attempt=0;attempt<maxPolls;attempt++){
        if(attempt>0&&pollIntervalMs>0) await sleep(pollIntervalMs);
        const polled=await fetchImpl(`${base}/v1/tasks/${encodeURIComponent(taskId)}`,{
          headers:{
            'Authorization':`Bearer ${config.apiKey}`,
            'X-Runway-Version':'2024-11-06',
          },
        });
        if(!polled.ok){
          throw new Error(`runway_poll_failed:${polled.status}:${(await polled.text()).slice(0,500)}`);
        }
        const payload=await polled.json();
        if(['SUCCEEDED','FAILED','CANCELED'].includes(String(payload?.status))){
          terminal=payload;
          break;
        }
      }
      if(!terminal) throw new Error('runway_generation_timeout');
      if(terminal.status!=='SUCCEEDED'){
        throw new Error(`runway_generation_failed:${terminal.status}:${terminal.failure??terminal.failureCode??''}`);
      }
      const url=Array.isArray(terminal.output)?terminal.output[0]:undefined;
      if(!url) throw new Error('runway_output_url_missing');

      const media=await fetchImpl(String(url));
      if(!media.ok) throw new Error(`runway_download_failed:${media.status}`);
      const bytes=Buffer.from(await media.arrayBuffer());
      if(!bytes.length) throw new Error('runway_download_empty');

      fs.mkdirSync(config.outputDir,{recursive:true});
      const outputPath=path.resolve(
        config.outputDir,
        `${job.id.replace(/[^a-zA-Z0-9._-]+/g,'_')}.mp4`,
      );
      fs.writeFileSync(outputPath,bytes);
      const digest=crypto.createHash('sha256').update(bytes).digest('hex');

      return {
        schema:'evercraft.fallen.visual-execution-receipt.v1',
        jobId:job.id,
        requestId:job.requestId,
        needId:job.needId,
        modelId:job.modelId,
        providerId:'runway',
        providerRequestId:taskId,
        artifact:{
          path:outputPath,
          digest,
          mimeType:'video/mp4',
          durationSec:job.durationSec,
          aspectRatio:job.aspectRatio,
        },
        commercialRights:config.commercialRights,
        provenance:'complete',
        continuityDigest:job.continuityDigest,
        sourceRefs:[
          ...DOCS.map(url=>`provider-doc:${url}`),
          ...job.references.flatMap(ref=>ref.sourceRefs),
        ],
        generatedAt:new Date().toISOString(),
      };
    }
  };
}
