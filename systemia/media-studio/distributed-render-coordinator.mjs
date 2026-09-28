#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [, , planPath, outputPath, receiptPathArg] = process.argv;
if(!planPath||!outputPath){
  console.error('Usage: node distributed-render-coordinator.mjs <plan.json> <output.mp4> [receipt.json]');
  process.exit(1);
}

const plan=JSON.parse(fs.readFileSync(path.resolve(planPath),'utf8'));
if(plan?.schema!=='evercraft.fallen.distributed-render-plan.v1') throw new Error('distributed_render_plan_schema_invalid');
const workersRaw=process.env.FALLEN_RENDER_WORKERS;
if(!workersRaw) throw new Error('FALLEN_RENDER_WORKERS is required');

let workers;
try{workers=JSON.parse(workersRaw)}catch{throw new Error('FALLEN_RENDER_WORKERS must be JSON')}
if(!Array.isArray(workers)||!workers.length) throw new Error('at_least_one_render_worker_required');

function cleanWorker(row,index){
  const id=String(row?.id||`worker-${index}`).trim();
  if(!/^[a-zA-Z0-9._-]{1,128}$/.test(id)) throw new Error('render_worker_id_invalid');
  const token=String(row?.token||'');
  if(!token) throw new Error(`render_worker_token_missing:${id}`);
  let url;
  try{url=new URL(String(row?.url||''))}catch{throw new Error(`render_worker_url_invalid:${id}`)}
  const loopback=['127.0.0.1','localhost','::1'].includes(url.hostname);
  if(!(url.protocol==='https:'||(url.protocol==='http:'&&loopback))) throw new Error(`render_worker_transport_not_allowed:${id}`);
  url.pathname='';url.search='';url.hash='';
  return {id,url:url.toString().replace(/\/$/,''),token};
}
workers=workers.map(cleanWorker);

const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function requestJson(worker,pathname,options={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Number(process.env.FALLEN_RENDER_REQUEST_TIMEOUT_MS||120000));
  try{
    const response=await fetch(worker.url+pathname,{
      ...options,
      headers:{
        ...(options.headers||{}),
        authorization:`Bearer ${worker.token}`
      },
      signal:controller.signal
    });
    const body=await response.json().catch(()=>({ok:false,error:'non_json_worker_response'}));
    if(!response.ok||body?.ok===false) throw new Error(`worker_request_failed:${worker.id}:${response.status}:${body?.error||'unknown'}`);
    return body;
  }finally{clearTimeout(timer)}
}

async function getArtifact(worker,jobId,filename,expectedSha){
  const response=await fetch(worker.url+`/v1/artifact/${encodeURIComponent(jobId)}/${encodeURIComponent(filename)}`,{
    headers:{authorization:`Bearer ${worker.token}`}
  });
  if(!response.ok) throw new Error(`artifact_fetch_failed:${worker.id}:${jobId}:${filename}:${response.status}`);
  const buffer=Buffer.from(await response.arrayBuffer());
  const observed=sha(buffer);
  if(observed!==expectedSha) throw new Error(`artifact_digest_mismatch:${filename}`);
  const header=response.headers.get('x-artifact-sha256');
  if(header&&header!==observed) throw new Error(`artifact_header_digest_mismatch:${filename}`);
  return buffer;
}

function renderJob(shard){
  return {
    schema:'evercraft.fallen.render-job.v1',
    job_id:shard.jobId,
    asset_scope_id:plan.assetScopeId,
    stage:plan.stage,
    assets:plan.assets||[],
    frame_start:shard.frameStart,
    frame_count:shard.frameCount
  };
}

const frameRoot=path.resolve(path.dirname(path.resolve(outputPath)),`.${path.basename(outputPath)}.frames`);
fs.rmSync(frameRoot,{recursive:true,force:true});
fs.mkdirSync(frameRoot,{recursive:true,mode:0o700});

const shardResults=new Array(plan.shards.length);
let cursor=0;
async function workerLoop(worker){
  for(;;){
    const index=cursor++;
    if(index>=plan.shards.length) return;
    const shard=plan.shards[index];
    const started=Date.now();
    const receipt=await requestJson(worker,'/v1/render',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(renderJob(shard))
    });
    if(receipt.schema!=='evercraft.fallen.render-receipt.v1') throw new Error(`render_receipt_schema_invalid:${shard.id}`);
    if(receipt.job_id!==shard.jobId) throw new Error(`render_receipt_job_mismatch:${shard.id}`);
    if(receipt.stage_sha256!==plan.stageDigest) throw new Error(`render_receipt_stage_digest_mismatch:${shard.id}`);
    if(receipt.frame_start!==shard.frameStart||receipt.frame_count!==shard.frameCount) throw new Error(`render_receipt_range_mismatch:${shard.id}`);
    if(!Array.isArray(receipt.frames)||receipt.frames.length!==shard.frameCount) throw new Error(`render_receipt_frame_count_mismatch:${shard.id}`);

    for(const frame of receipt.frames){
      if(frame.frame<shard.frameStart||frame.frame>=shard.frameStart+shard.frameCount) throw new Error(`render_frame_outside_shard:${shard.id}:${frame.frame}`);
      const bytes=await getArtifact(worker,shard.jobId,frame.filename,frame.sha256);
      const filename=`frame-${String(frame.frame).padStart(8,'0')}.png`;
      fs.writeFileSync(path.join(frameRoot,filename),bytes,{mode:0o600});
    }
    shardResults[index]={
      shard_id:shard.id,
      worker_id:worker.id,
      duration_ms:Date.now()-started,
      receipt
    };
  }
}

await Promise.all(workers.map(workerLoop));

const seen=new Map();
const errors=[];
for(const row of shardResults){
  if(!row){errors.push('shard_result_missing');continue}
  const shard=plan.shards.find(item=>item.id===row.shard_id);
  if(!shard){errors.push(`unknown_shard:${row.shard_id}`);continue}
  for(const frame of row.receipt.frames){
    if(seen.has(frame.frame)) errors.push(`duplicate_frame:${frame.frame}`);
    seen.set(frame.frame,frame);
  }
}
for(let frame=0;frame<plan.totalFrames;frame+=1){
  const expectedPath=path.join(frameRoot,`frame-${String(frame).padStart(8,'0')}.png`);
  if(!seen.has(frame)||!fs.existsSync(expectedPath)) errors.push(`frame_missing:${frame}`);
  else{
    const observed=sha(fs.readFileSync(expectedPath));
    if(observed!==seen.get(frame).sha256) errors.push(`materialized_frame_digest_mismatch:${frame}`);
  }
}
if(errors.length) throw new Error(`distributed_render_reconciliation_failed:${errors.slice(0,20).join(',')}`);

const ffmpeg=spawnSync('ffmpeg',[
  '-y','-v','error',
  '-framerate',String(plan.fps),
  '-start_number','0',
  '-i',path.join(frameRoot,'frame-%08d.png'),
  '-c:v','libx264','-preset','medium','-crf','18',
  '-pix_fmt','yuv420p','-movflags','+faststart',
  path.resolve(outputPath)
],{encoding:'utf8'});
if(ffmpeg.error) throw ffmpeg.error;
if(ffmpeg.status!==0) throw new Error(`ffmpeg_assembly_failed:${String(ffmpeg.stderr||'').slice(-1000)}`);

const ordered=[...seen.entries()].sort((a,b)=>a[0]-b[0]).map(([frame,row])=>[frame,row.sha256]);
const outputBuffer=fs.readFileSync(path.resolve(outputPath));
const finalReceipt={
  schema:'evercraft.fallen.distributed-render-receipt.v1',
  plan_id:plan.id,
  stage_id:plan.stage.id,
  stage_digest:plan.stageDigest,
  total_frames:plan.totalFrames,
  fps:plan.fps,
  shard_count:plan.shards.length,
  workers:[...new Set(shardResults.map(row=>row.worker_id))],
  frame_set_sha256:sha(JSON.stringify(ordered)),
  output_path:path.resolve(outputPath),
  output_bytes:outputBuffer.length,
  output_sha256:sha(outputBuffer),
  shards:shardResults.map(row=>({
    shard_id:row.shard_id,
    worker_id:row.worker_id,
    duration_ms:row.duration_ms,
    receipt_sha256:row.receipt.receipt_sha256
  })),
  boundaries:{
    every_frame_materialized:true,
    every_frame_sha256_verified:true,
    no_gap_no_duplicate_gate:true,
    worker_artifact_paths_not_trusted:true,
    publication_authority:false
  }
};
finalReceipt.receipt_sha256=sha(JSON.stringify(finalReceipt));
const receiptPath=path.resolve(receiptPathArg||`${outputPath}.receipt.json`);
fs.writeFileSync(receiptPath,JSON.stringify(finalReceipt,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({output:path.resolve(outputPath),receipt:receiptPath,sha256:finalReceipt.output_sha256,frames:plan.totalFrames,workers:finalReceipt.workers}));
