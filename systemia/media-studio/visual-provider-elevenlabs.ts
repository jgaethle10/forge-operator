import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { VisualExecutionReceipt, VisualModelAdapter } from './model-fabric-runtime.js';
import type {
  VisualModelEndpoint,
  VisualModelJob,
  VisualReference,
  VisualReferenceLocator,
} from './model-fabric.js';

export type ElevenLabsVeoModel =
  | 'veo-3.1-generate-001'
  | 'veo-3.1-fast-generate-001';

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

export interface ElevenLabsVeoAdapterConfig {
  apiKey:string;
  modelId:ElevenLabsVeoModel;
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
  'https://elevenlabs.io/docs/eleven-api/guides/cookbooks/image-and-video',
  'https://elevenlabs.io/docs/eleven-api/guides/how-to/image-and-video/references',
];

export function elevenLabsVeoEndpoint(
  modelId:ElevenLabsVeoModel,
  verified=false,
):VisualModelEndpoint{
  return {
    id:`elevenlabs:${modelId}`,
    providerId:'elevenlabs',
    displayName:`ElevenLabs ${modelId}`,
    enabled:true,
    executionState:verified?'verified':'declared',
    capabilities:[{
      task:'video',
      inputModes:['text','image_reference','start_frame','end_frame'],
      requirements:['reference_identity','commercial_rights','provenance_receipt','timing_control'],
      aspectRatios:['16:9','9:16'],
      maxDurationSec:8,
      durationOptions:[4,6,8],
      resolutions:['720p','1080p','4K'],
      maxReferences:3,
      referenceRoles:['identity','environment','style','start_frame','end_frame'],
      identityContinuityViaStartFrame:true,
      framesExclusiveWithReferences:true,
      referenceImageDurationOptions:[8],
      locatorKinds:['inline_base64','provider_asset','provider_generation'],
      providerLocatorId:'elevenlabs',
      nativeAudio:true,
      batchVariants:1,
      maxCandidateJobs:4,
      qualityTier:modelId==='veo-3.1-generate-001'?5:4,
      costTier:modelId==='veo-3.1-generate-001'?5:4,
      latencyTier:modelId==='veo-3.1-generate-001'?4:3,
    }]
  };
}

function providerReference(locator:VisualReferenceLocator|undefined){
  if(!locator) throw new Error('elevenlabs_reference_locator_missing');
  if(locator.kind==='inline_base64'){
    return {
      type:'inline_base64',
      content_base64:locator.value,
      mime_type:locator.mimeType,
    };
  }
  if(locator.kind==='provider_asset'){
    if(locator.providerId!=='elevenlabs') throw new Error('elevenlabs_reference_provider_mismatch');
    return {type:'asset',asset_id:locator.value};
  }
  if(locator.kind==='provider_generation'){
    if(locator.providerId!=='elevenlabs') throw new Error('elevenlabs_reference_provider_mismatch');
    return {type:'generation',generation_id:locator.value};
  }
  throw new Error(`elevenlabs_reference_locator_unsupported:${locator.kind}`);
}

function roleReference(job:VisualModelJob,role:'start_frame'|'end_frame'){
  const ref=job.references.find(item=>item.role===role);
  return ref?providerReference(ref.locator):undefined;
}

function sleep(ms:number){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

function fetcher(config:ElevenLabsVeoAdapterConfig):FetchLike{
  const impl=config.fetchImpl??(globalThis.fetch as unknown as FetchLike);
  if(!impl) throw new Error('elevenlabs_fetch_unavailable');
  return impl;
}

function validateJob(job:VisualModelJob,config:ElevenLabsVeoAdapterConfig){
  if(job.task!=='video') throw new Error('elevenlabs_veo_video_only');
  if(job.modelId!==`elevenlabs:${config.modelId}`) throw new Error('elevenlabs_model_binding_mismatch');
  if(job.providerId!=='elevenlabs') throw new Error('elevenlabs_provider_binding_mismatch');
  if(job.durationSec!==undefined&&![4,6,8].includes(job.durationSec)) throw new Error('elevenlabs_veo_duration_unsupported');
  if(job.aspectRatio&&!['16:9','9:16'].includes(job.aspectRatio)) throw new Error('elevenlabs_veo_aspect_unsupported');
  if(job.targetResolution&&!['720p','1080p','4K'].includes(job.targetResolution)) throw new Error('elevenlabs_veo_resolution_unsupported');
  const end=job.references.find(item=>item.role==='end_frame');
  const start=job.references.find(item=>item.role==='start_frame');
  const imageRefs=job.references.filter(item=>
    item.kind==='image'&&
    (item.role==='identity'||item.role==='environment'||item.role==='style')
  );
  if(end&&!start) throw new Error('elevenlabs_end_frame_requires_start_frame');
  if((start||end)&&imageRefs.length){
    throw new Error('elevenlabs_reference_images_cannot_mix_with_frames');
  }
  if(imageRefs.length>3) throw new Error('elevenlabs_reference_image_limit_exceeded');
  if(imageRefs.length&&job.durationSec!==8){
    throw new Error('elevenlabs_reference_images_require_eight_seconds');
  }
}

function outputName(job:VisualModelJob){
  return `${job.id.replace(/[^a-zA-Z0-9._-]+/g,'_')}.mp4`;
}

export function createElevenLabsVeoAdapter(
  config:ElevenLabsVeoAdapterConfig,
):VisualModelAdapter{
  const base=(config.baseUrl??'https://api.elevenlabs.io').replace(/\/$/,'');
  const pollIntervalMs=config.pollIntervalMs??10_000;
  const maxPolls=config.maxPolls??90;

  return {
    id:`elevenlabs-adapter:${config.modelId}`,
    modelId:`elevenlabs:${config.modelId}`,
    providerId:'elevenlabs',
    verified:config.verified,
    async execute(job:VisualModelJob):Promise<VisualExecutionReceipt>{
      validateJob(job,config);
      if(!config.apiKey?.trim()) throw new Error('elevenlabs_api_key_missing');
      if(config.allowPaidGeneration!==true) throw new Error('elevenlabs_paid_generation_not_authorized');
      const fetchImpl=fetcher(config);

      const body:any={
        model_id:config.modelId,
        prompt:job.prompt,
        duration_secs:job.durationSec??8,
        aspect_ratio:job.aspectRatio??'16:9',
        resolution:job.targetResolution??'1080p',
        generate_audio:true,
      };
      const start=roleReference(job,'start_frame');
      const end=roleReference(job,'end_frame');
      const images=job.references
        .filter(ref=>
          ref.kind==='image'&&
          (ref.role==='identity'||ref.role==='environment'||ref.role==='style')
        )
        .map(ref=>({
          image:providerReference(ref.locator),
          role:ref.role==='style'?'style':'subject',
        }));
      if(start) body.start_frame=start;
      if(end) body.end_frame=end;
      if(images.length) body.images=images;

      const created=await fetchImpl(`${base}/v1/flows/video`,{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'xi-api-key':config.apiKey,
        },
        body:JSON.stringify(body),
      });
      if(!created.ok){
        throw new Error(`elevenlabs_create_failed:${created.status}:${(await created.text()).slice(0,500)}`);
      }
      const createPayload=await created.json();
      const generationId=String(createPayload?.id??'');
      if(!generationId) throw new Error('elevenlabs_generation_id_missing');

      let terminal:any=null;
      for(let attempt=0;attempt<maxPolls;attempt++){
        if(attempt>0&&pollIntervalMs>0) await sleep(pollIntervalMs);
        const polled=await fetchImpl(`${base}/v1/flows/video/${encodeURIComponent(generationId)}`,{
          headers:{'xi-api-key':config.apiKey},
        });
        if(!polled.ok){
          throw new Error(`elevenlabs_poll_failed:${polled.status}:${(await polled.text()).slice(0,500)}`);
        }
        const payload=await polled.json();
        if(payload?.status==='completed'||payload?.status==='failed'){
          terminal=payload;
          break;
        }
      }
      if(!terminal) throw new Error('elevenlabs_generation_timeout');
      if(terminal.status==='failed'){
        throw new Error(`elevenlabs_generation_failed:${terminal.failure_reason??'unknown'}:${terminal.error_message??''}`);
      }
      if(!terminal.content_url) throw new Error('elevenlabs_content_url_missing');

      const media=await fetchImpl(String(terminal.content_url));
      if(!media.ok) throw new Error(`elevenlabs_download_failed:${media.status}`);
      const bytes=Buffer.from(await media.arrayBuffer());
      if(!bytes.length) throw new Error('elevenlabs_download_empty');

      fs.mkdirSync(config.outputDir,{recursive:true});
      const outputPath=path.resolve(config.outputDir,outputName(job));
      fs.writeFileSync(outputPath,bytes);
      const digest=crypto.createHash('sha256').update(bytes).digest('hex');

      return {
        schema:'evercraft.fallen.visual-execution-receipt.v1',
        jobId:job.id,
        requestId:job.requestId,
        needId:job.needId,
        modelId:job.modelId,
        providerId:'elevenlabs',
        providerRequestId:generationId,
        artifact:{
          path:outputPath,
          digest,
          mimeType:String(terminal.content_mime_type??'video/mp4'),
          durationSec:job.durationSec,
          aspectRatio:job.aspectRatio,
        },
        commercialRights:config.commercialRights,
        provenance:'complete',
        continuityDigest:job.continuityDigest,
        sourceRefs:[
          ...DOCS.map(url=>`provider-doc:${url}`),
          ...job.references.flatMap((ref:VisualReference)=>ref.sourceRefs),
        ],
        generatedAt:new Date().toISOString(),
      };
    }
  };
}
