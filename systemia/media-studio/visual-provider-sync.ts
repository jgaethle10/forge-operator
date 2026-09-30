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

export type SyncLabsLipModel='sync-3'|'lipsync-2-pro'|'lipsync-2';

type FetchLike=(input:string,init?:{
  method?:string;
  headers?:Record<string,string>;
  body?:string|Buffer;
})=>Promise<{
  ok:boolean;
  status:number;
  json():Promise<any>;
  arrayBuffer():Promise<ArrayBuffer>;
  text():Promise<string>;
}>;

export interface SyncLabsLipAdapterConfig {
  apiKey:string;
  modelId:SyncLabsLipModel;
  outputDir:string;
  verified:boolean;
  commercialRights:'allowed'|'unknown';
  allowPaidGeneration?:boolean;
  baseUrl?:string;
  pollIntervalMs?:number;
  maxPolls?:number;
  activeSpeakerAutoDetect?:boolean;
  fetchImpl?:FetchLike;
}

const DOCS=[
  'https://sync.so/docs/api-reference/api-overview',
  'https://sync.so/docs/api-reference/api/generate-api/create',
  'https://sync.so/docs/models/lipsync',
  'https://sync.so/docs/developer-guides/speaker-selection',
  'https://sync.so/docs/api-reference/guides/idempotency',
];

export function syncLabsLipEndpoint(
  modelId:SyncLabsLipModel='sync-3',
  verified=false,
):VisualModelEndpoint{
  const quality=modelId==='sync-3'?5:modelId==='lipsync-2-pro'?5:4;
  const cost=modelId==='sync-3'?5:modelId==='lipsync-2-pro'?4:3;
  return {
    id:`sync:${modelId}`,
    providerId:'sync',
    displayName:`Sync Labs ${modelId}`,
    enabled:true,
    executionState:verified?'verified':'declared',
    capabilities:[{
      task:'lip_sync',
      inputModes:['video_reference','audio_reference'],
      requirements:[
        'reference_identity',
        'commercial_rights',
        'provenance_receipt',
        'timing_control',
      ],
      maxReferences:2,
      batchVariants:1,
      qualityTier:quality,
      costTier:cost,
      latencyTier:3,
    }],
  };
}

function sleep(ms:number){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

function fetcher(config:SyncLabsLipAdapterConfig):FetchLike{
  const impl=config.fetchImpl??(globalThis.fetch as unknown as FetchLike);
  if(!impl) throw new Error('sync_fetch_unavailable');
  return impl;
}

function providerInput(
  locator:VisualReferenceLocator|undefined,
  type:'video'|'audio',
  label:string,
){
  if(!locator) throw new Error(`sync_${label}_locator_missing`);
  if(locator.kind==='url') return {type,url:locator.value};
  if(locator.kind==='provider_asset'&&locator.providerId==='sync'){
    return {type,assetId:locator.id};
  }
  throw new Error(`sync_${label}_locator_unsupported:${locator.kind}`);
}

export interface SyncLabsStagedAsset {
  providerId:'sync';
  assetId:string;
  locator:VisualReferenceLocator;
  sourcePath:string;
  sourceSha256:string;
  providerUrl:string;
  sizeBytes:number;
}

export async function stageSyncLabsAsset(input:{
  apiKey:string;
  filePath:string;
  contentType:'video/mp4'|'audio/wav'|'audio/mpeg';
  assetType:'VIDEO'|'AUDIO';
  baseUrl?:string;
  fetchImpl?:FetchLike;
}):Promise<SyncLabsStagedAsset>{
  if(!input.apiKey?.trim()) throw new Error('sync_api_key_missing');
  if(!fs.existsSync(input.filePath)) throw new Error('sync_stage_file_missing');
  const bytes=fs.readFileSync(input.filePath);
  if(!bytes.length) throw new Error('sync_stage_file_empty');
  const base=(input.baseUrl??'https://api.sync.so').replace(/\/$/,'');
  const fetchImpl=input.fetchImpl??(globalThis.fetch as unknown as FetchLike);
  if(!fetchImpl) throw new Error('sync_fetch_unavailable');
  const fileName=path.basename(input.filePath).replace(/[^a-zA-Z0-9._-]+/g,'_');

  const presign=await fetchImpl(`${base}/v2/assets/upload`,{
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':input.apiKey},
    body:JSON.stringify({fileName,contentType:input.contentType,size:bytes.length}),
  });
  if(!presign.ok){
    throw new Error(`sync_asset_presign_failed:${presign.status}:${(await presign.text()).slice(0,500)}`);
  }
  const presigned=await presign.json();
  const uploadUrl=String(presigned?.uploadUrl??'');
  const providerUrl=String(presigned?.url??'');
  if(!uploadUrl||!providerUrl) throw new Error('sync_asset_presign_response_invalid');

  const uploaded=await fetchImpl(uploadUrl,{
    method:'PUT',
    headers:{'Content-Type':input.contentType},
    body:bytes,
  });
  if(!uploaded.ok){
    throw new Error(`sync_asset_upload_failed:${uploaded.status}:${(await uploaded.text()).slice(0,500)}`);
  }

  const registered=await fetchImpl(`${base}/v2/assets`,{
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':input.apiKey},
    body:JSON.stringify({url:providerUrl,type:input.assetType,name:fileName}),
  });
  if(!registered.ok){
    throw new Error(`sync_asset_register_failed:${registered.status}:${(await registered.text()).slice(0,500)}`);
  }
  const asset=await registered.json();
  const assetId=String(asset?.id??'');
  if(!assetId) throw new Error('sync_asset_id_missing');

  return {
    providerId:'sync',
    assetId,
    locator:{kind:'provider_asset',providerId:'sync',id:assetId},
    sourcePath:path.resolve(input.filePath),
    sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),
    providerUrl,
    sizeBytes:bytes.length,
  };
}

function refs(job:VisualModelJob){
  const video=job.references.find(
    ref=>ref.kind==='video'&&(ref.role==='identity'||ref.role==='product')
  );
  const audio=job.references.find(
    ref=>ref.kind==='audio'&&ref.role==='dialogue_audio'
  );
  if(!video) throw new Error('sync_source_video_missing');
  if(!audio) throw new Error('sync_dialogue_audio_missing');
  return {video,audio};
}

function validateJob(job:VisualModelJob,config:SyncLabsLipAdapterConfig){
  if(job.task!=='lip_sync') throw new Error('sync_lipsync_task_only');
  if(job.modelId!==`sync:${config.modelId}`) throw new Error('sync_model_binding_mismatch');
  if(job.providerId!=='sync') throw new Error('sync_provider_binding_mismatch');
  const {video,audio}=refs(job);
  if(!video.sourceRefs?.length) throw new Error('sync_source_video_provenance_missing');
  if(!audio.sourceRefs?.length) throw new Error('sync_dialogue_audio_provenance_missing');
  if(!video.digest?.match(/^[a-f0-9]{64}$/i)) throw new Error('sync_source_video_digest_missing');
  if(!audio.digest?.match(/^[a-f0-9]{64}$/i)) throw new Error('sync_dialogue_audio_digest_missing');
  providerInput(video.locator,'video','source_video');
  providerInput(audio.locator,'audio','dialogue_audio');
}

function outputName(job:VisualModelJob){
  return `${job.id.replace(/[^a-zA-Z0-9._-]+/g,'_')}.mp4`;
}

function idempotencyKey(job:VisualModelJob){
  return crypto
    .createHash('sha256')
    .update([
      'evercraft-fallen-sync-v1',
      job.id,
      job.modelId,
      job.continuityDigest,
      ...job.references.map(ref=>ref.digest??''),
    ].join('|'))
    .digest('hex')
    .slice(0,64);
}

function sourceRefs(job:VisualModelJob,video:VisualReference,audio:VisualReference){
  return [
    ...DOCS.map(url=>`provider-doc:${url}`),
    ...video.sourceRefs,
    ...audio.sourceRefs,
    `source-video-sha256:${video.digest}`,
    `dialogue-audio-sha256:${audio.digest}`,
    `continuity:${job.continuityDigest}`,
  ];
}

export function createSyncLabsLipAdapter(
  config:SyncLabsLipAdapterConfig,
):VisualModelAdapter{
  const base=(config.baseUrl??'https://api.sync.so').replace(/\/$/,'');
  const pollIntervalMs=config.pollIntervalMs??5_000;
  const maxPolls=config.maxPolls??180;

  return {
    id:`sync-adapter:${config.modelId}`,
    modelId:`sync:${config.modelId}`,
    providerId:'sync',
    verified:config.verified,
    async execute(job:VisualModelJob):Promise<VisualExecutionReceipt>{
      validateJob(job,config);
      if(!config.apiKey?.trim()) throw new Error('sync_api_key_missing');
      if(config.allowPaidGeneration!==true) throw new Error('sync_paid_generation_not_authorized');

      const fetchImpl=fetcher(config);
      const {video,audio}=refs(job);
      const requestBody:any={
        model:config.modelId,
        input:[
          providerInput(video.locator,'video','source_video'),
          providerInput(audio.locator,'audio','dialogue_audio'),
        ],
        outputFileName:job.id.replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,100),
        options:{
          active_speaker_detection:{
            auto_detect:config.activeSpeakerAutoDetect!==false,
          },
        },
      };

      const created=await fetchImpl(`${base}/v2/generate`,{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-api-key':config.apiKey,
          'Idempotency-Key':idempotencyKey(job),
        },
        body:JSON.stringify(requestBody),
      });
      if(!created.ok){
        throw new Error(
          `sync_create_failed:${created.status}:${(await created.text()).slice(0,500)}`
        );
      }
      const createPayload=await created.json();
      const generationId=String(createPayload?.id??'');
      if(!generationId) throw new Error('sync_generation_id_missing');

      let terminal:any=null;
      for(let attempt=0;attempt<maxPolls;attempt+=1){
        if(attempt>0&&pollIntervalMs>0) await sleep(pollIntervalMs);
        const polled=await fetchImpl(
          `${base}/v2/generate/${encodeURIComponent(generationId)}?wait=true`,
          {headers:{'x-api-key':config.apiKey}}
        );
        if(!polled.ok){
          throw new Error(
            `sync_poll_failed:${polled.status}:${(await polled.text()).slice(0,500)}`
          );
        }
        const payload=await polled.json();
        const status=String(payload?.status??'').toUpperCase();
        if(['COMPLETED','FAILED','REJECTED'].includes(status)){
          terminal=payload;
          break;
        }
      }
      if(!terminal) throw new Error('sync_generation_timeout');
      if(String(terminal.status).toUpperCase()!=='COMPLETED'){
        throw new Error(
          `sync_generation_failed:${terminal.status}:${terminal.errorCode??''}:${terminal.error??''}`
        );
      }
      const outputUrl=String(terminal.outputUrl??'');
      if(!outputUrl) throw new Error('sync_output_url_missing');

      const media=await fetchImpl(outputUrl);
      if(!media.ok) throw new Error(`sync_download_failed:${media.status}`);
      const bytes=Buffer.from(await media.arrayBuffer());
      if(!bytes.length) throw new Error('sync_download_empty');

      fs.mkdirSync(config.outputDir,{recursive:true});
      const outputPath=path.resolve(config.outputDir,outputName(job));
      fs.writeFileSync(outputPath,bytes);
      const artifactDigest=crypto.createHash('sha256').update(bytes).digest('hex');

      return {
        schema:'evercraft.fallen.visual-execution-receipt.v1',
        jobId:job.id,
        requestId:job.requestId,
        needId:job.needId,
        modelId:job.modelId,
        providerId:'sync',
        providerRequestId:generationId,
        artifact:{
          path:outputPath,
          digest:artifactDigest,
          mimeType:'video/mp4',
          durationSec:Number.isFinite(Number(terminal.outputDuration))
            ?Number(terminal.outputDuration)
            :job.durationSec,
          aspectRatio:job.aspectRatio,
        },
        commercialRights:config.commercialRights,
        provenance:'complete',
        continuityDigest:job.continuityDigest,
        sourceRefs:sourceRefs(job,video,audio),
        generatedAt:new Date().toISOString(),
      };
    }
  };
}
