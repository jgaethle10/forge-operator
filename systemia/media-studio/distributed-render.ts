import crypto from 'node:crypto';
import type { VisualStage } from './visual-stage.js';
import { stageDigest, validateStage } from './visual-stage.js';

export interface RenderAssetManifestRow {
  id:string;
  filename:string;
  sha256:string;
  media_type:'image/png'|'image/jpeg'|'image/webp'|'video/mp4'|'video/webm';
}

export interface RenderShard {
  id:string;
  index:number;
  jobId:string;
  frameStart:number;
  frameCount:number;
}

export interface DistributedRenderPlan {
  schema:'evercraft.fallen.distributed-render-plan.v1';
  id:string;
  stageDigest:string;
  stage:VisualStage;
  assetScopeId:string;
  assets:RenderAssetManifestRow[];
  fps:number;
  totalFrames:number;
  maxFramesPerShard:number;
  shards:RenderShard[];
  createdAt:string;
}

export interface RenderWorkerFrameReceipt {
  frame:number;
  filename:string;
  bytes:number;
  sha256:string;
  time_sec:number;
}

export interface RenderWorkerReceipt {
  schema:'evercraft.fallen.render-receipt.v1';
  job_id:string;
  asset_scope_id?:string;
  stage_id:string;
  stage_sha256:string;
  frame_start:number;
  frame_count:number;
  total_frames:number;
  frames:RenderWorkerFrameReceipt[];
  receipt_sha256:string;
}

export interface ShardReceiptEnvelope {
  workerId:string;
  workerUrl?:string;
  shardId:string;
  receipt:RenderWorkerReceipt;
}

function safeId(value:string){
  const id=String(value||'').trim();
  if(!/^[a-zA-Z0-9._-]{1,128}$/.test(id)) throw new Error('render_plan_id_invalid');
  return id;
}

function digest(value:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validateAssets(stage:VisualStage,assets:RenderAssetManifestRow[]){
  const map=new Map(assets.map(row=>[row.id,row]));
  if(map.size!==assets.length) throw new Error('duplicate_render_asset_id');
  for(const layer of stage.layers){
    if(layer.kind!=='media') continue;
    const match=String(layer.sourcePath||'').match(/^asset:\/\/([a-zA-Z0-9._-]{1,128})$/);
    if(!match) throw new Error(`distributed_render_requires_asset_uri:${layer.id}`);
    if(!map.has(match[1])) throw new Error(`distributed_render_asset_missing:${match[1]}`);
  }
}

export function buildDistributedRenderPlan(input:{
  id:string;
  stage:VisualStage;
  assetScopeId?:string;
  assets?:RenderAssetManifestRow[];
  maxFramesPerShard?:number;
  createdAt?:string;
}):DistributedRenderPlan{
  const validation=validateStage(input.stage);
  if(validation.status!=='accepted') throw new Error(`visual_stage_rejected:${validation.errors.join(',')}`);
  const id=safeId(input.id);
  const assetScopeId=safeId(input.assetScopeId??id);
  const assets=input.assets??[];
  validateAssets(input.stage,assets);
  const totalFrames=Math.ceil(input.stage.durationSec*input.stage.fps);
  const maxFramesPerShard=Math.max(1,Math.min(120,Math.trunc(input.maxFramesPerShard??60)));
  const shards:RenderShard[]=[];
  for(let start=0,index=0;start<totalFrames;start+=maxFramesPerShard,index+=1){
    const frameCount=Math.min(maxFramesPerShard,totalFrames-start);
    shards.push({
      id:`shard-${String(index).padStart(4,'0')}`,
      index,
      jobId:`${id}-r${String(index).padStart(4,'0')}`,
      frameStart:start,
      frameCount
    });
  }
  return {
    schema:'evercraft.fallen.distributed-render-plan.v1',
    id,
    stageDigest:stageDigest(input.stage),
    stage:input.stage,
    assetScopeId,
    assets,
    fps:input.stage.fps,
    totalFrames,
    maxFramesPerShard,
    shards,
    createdAt:input.createdAt??new Date().toISOString()
  };
}

export function renderJobForShard(plan:DistributedRenderPlan,shard:RenderShard){
  return {
    schema:'evercraft.fallen.render-job.v1' as const,
    job_id:shard.jobId,
    asset_scope_id:plan.assetScopeId,
    stage:plan.stage,
    assets:plan.assets,
    frame_start:shard.frameStart,
    frame_count:shard.frameCount
  };
}

export function buildRenderShardInventory(plan:DistributedRenderPlan){
  return {
    schema:'evercraft.fallen.saban-render-inventory.v1' as const,
    plan_id:plan.id,
    stage_digest:plan.stageDigest,
    jobs:plan.shards.map(shard=>({
      kind:'fallen_render_shard',
      key:shard.id,
      shard,
      render_job:renderJobForShard(plan,shard)
    }))
  };
}

export function verifyRenderReceipts(
  plan:DistributedRenderPlan,
  envelopes:ShardReceiptEnvelope[],
){
  const errors:string[]=[];
  const shardById=new Map(plan.shards.map(shard=>[shard.id,shard]));
  const seenShards=new Set<string>();
  const frameMap=new Map<number,RenderWorkerFrameReceipt>();

  for(const envelope of envelopes){
    const shard=shardById.get(envelope.shardId);
    if(!shard){errors.push(`unknown_shard:${envelope.shardId}`);continue}
    if(seenShards.has(shard.id)){errors.push(`duplicate_shard_receipt:${shard.id}`);continue}
    seenShards.add(shard.id);
    const receipt=envelope.receipt;
    if(receipt.schema!=='evercraft.fallen.render-receipt.v1') errors.push(`receipt_schema_invalid:${shard.id}`);
    if(receipt.job_id!==shard.jobId) errors.push(`receipt_job_mismatch:${shard.id}`);
    if(receipt.stage_id!==plan.stage.id) errors.push(`receipt_stage_id_mismatch:${shard.id}`);
    if(receipt.stage_sha256!==plan.stageDigest) errors.push(`receipt_stage_digest_mismatch:${shard.id}`);
    if(receipt.asset_scope_id&&receipt.asset_scope_id!==plan.assetScopeId) errors.push(`receipt_asset_scope_mismatch:${shard.id}`);
    if(receipt.frame_start!==shard.frameStart||receipt.frame_count!==shard.frameCount) errors.push(`receipt_frame_range_mismatch:${shard.id}`);
    if(receipt.total_frames!==plan.totalFrames) errors.push(`receipt_total_frames_mismatch:${shard.id}`);
    if(receipt.frames.length!==shard.frameCount) errors.push(`receipt_frame_count_mismatch:${shard.id}`);
    for(const frame of receipt.frames){
      const expectedTime=frame.frame/plan.fps;
      if(frame.frame<shard.frameStart||frame.frame>=shard.frameStart+shard.frameCount) errors.push(`frame_outside_shard:${shard.id}:${frame.frame}`);
      if(Math.abs(frame.time_sec-expectedTime)>.00001) errors.push(`frame_time_mismatch:${frame.frame}`);
      if(!/^[a-f0-9]{64}$/i.test(frame.sha256)) errors.push(`frame_sha_invalid:${frame.frame}`);
      if(frameMap.has(frame.frame)) errors.push(`duplicate_frame:${frame.frame}`);
      frameMap.set(frame.frame,frame);
    }
  }

  for(const shard of plan.shards){
    if(!seenShards.has(shard.id)) errors.push(`shard_receipt_missing:${shard.id}`);
  }
  for(let frame=0;frame<plan.totalFrames;frame+=1){
    if(!frameMap.has(frame)) errors.push(`frame_missing:${frame}`);
  }

  const ordered=[...frameMap.entries()].sort((a,b)=>a[0]-b[0]);
  const frameSetDigest=digest(ordered.map(([frame,row])=>[frame,row.sha256]));
  return {
    schema:'evercraft.fallen.distributed-render-reconciliation.v1' as const,
    status:errors.length?('rejected' as const):('accepted' as const),
    planId:plan.id,
    stageDigest:plan.stageDigest,
    expectedFrames:plan.totalFrames,
    observedFrames:frameMap.size,
    shardCount:plan.shards.length,
    observedShardReceipts:seenShards.size,
    frameSetDigest,
    errors
  };
}
