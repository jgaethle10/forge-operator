import { createHash,generateKeyPairSync } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compile,run,verifyReceipt,signCapabilityManifest,MemoryMeter,MemoryReplayStore } from '../everscript/everscript.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const ID=/^[a-zA-Z0-9._-]{1,128}$/;
export function trustedWorkerUrl(baseUrl){
 const url=new URL(baseUrl);
 if(url.protocol!=='http:'||!['127.0.0.1','[::1]','localhost'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/') throw Error('worker_url_must_be_local_loopback');
 return url;
}
export async function renderWithFallenWorker(job,{baseUrl,token,outputDir,timeoutMs=20_000,fetchImpl=fetch}={}){
 const base=trustedWorkerUrl(baseUrl);
 if(typeof token!=='string'||token.length<8)throw Error('worker_token_invalid');
 if(!job||job.schema!=='evercraft.fallen.render-job.v1'||!ID.test(job.job_id)||job.assets?.length!==0)throw Error('job_contract_rejected');
 if(job.stage?.schema!=='evercraft.fallen.visual-stage.v1'||job.stage?.layers?.some(x=>x.evidenceState==='observed'))throw Error('unsupported_stage');
 if(!Number.isInteger(job.frame_count)||job.frame_count<1||job.frame_count>48)throw Error('frame_count_outside_rc05_budget');
 const ctrl=new AbortController();
 const stop=setTimeout(()=>ctrl.abort(new Error('worker_timeout')),Math.min(30_000,Math.max(1000,timeoutMs)));
 try{
  const response=await fetchImpl(new URL('v1/render',base),{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(job),signal:ctrl.signal,redirect:'error'});
  if(!response.ok)throw Error(`worker_http_${response.status}`);
  const receipt=await response.json();
  if(receipt.ok!==true||receipt.schema!=='evercraft.fallen.render-receipt.v1'||receipt.engine!=='evercraft-fallen-render-worker-v1'||receipt.job_id!==job.job_id||receipt.frame_count!==job.frame_count||receipt.frames?.length!==job.frame_count)throw Error('worker_receipt_contract_invalid');
  const {ok,...body}=receipt;
  const withoutHash={...body}; delete withoutHash.receipt_sha256;
  if(sha(JSON.stringify(withoutHash))!==receipt.receipt_sha256)throw Error('worker_receipt_hash_invalid');
  if(receipt.boundaries?.external_network_allowed!==false||receipt.boundaries?.exact_frame_control!==true||receipt.boundaries?.asset_sha256_verified!==true) throw Error('worker_boundary_receipt_invalid');
  if(receipt.console_errors?.length)throw Error('worker_console_errors');
  if(!receipt.frames.every((r,i)=>r.frame===job.frame_start+i&&r.filename===`frame-${String(r.frame).padStart(8,'0')}.png`&&/^[a-f0-9]{64}$/.test(r.sha256)))throw Error('worker_frame_receipt_invalid');
  const verified=[];
  if(outputDir)await mkdir(outputDir,{recursive:true});
  for(const frame of receipt.frames){
    const art=await fetchImpl(new URL(`v1/artifact/${job.job_id}/${frame.filename}`,base),{headers:{authorization:`Bearer ${token}`},signal:ctrl.signal,redirect:'error'});
    if(!art.ok)throw Error('worker_artifact_unavailable');
    const buffer=Buffer.from(await art.arrayBuffer());
    if(buffer.length!==frame.bytes||sha(buffer)!==frame.sha256||buffer.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('worker_artifact_hash_mismatch');
    if(outputDir)await writeFile(join(outputDir,frame.filename),buffer,{flag:'wx'});
    verified.push({frame:frame.frame,sha256:frame.sha256,bytes:buffer.length});
  }
  if(outputDir)await writeFile(join(outputDir,'worker-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  return {job_id:job.job_id,frames:verified,receipt_sha256:receipt.receipt_sha256,engine:receipt.engine,classification:'synthetic_visualization',production_authority:false};
 }finally{clearTimeout(stop)}
}
export async function executeEverScriptFallenJob(job,{baseUrl,token,outputDir,approve=false,fetchImpl=fetch}={}){
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const manifest=signCapabilityManifest({name:'FallenWorker',version:'1.0.0',description:'Fallen bounded exact-frame job',actions:{render:{arity:1}},scope:'local-authorized',network:'loopback-only'},privateKey,{keyId:'rc05-dev-ephemeral'});
 const source=await readFile(new URL('./mission.ever',import.meta.url),'utf8');
 const plan=compile(source,{manifests:[manifest],requireSignedManifests:true,trustedManifestKeys:{'rc05-dev-ephemeral':publicKey}});
 const meter=new MemoryMeter(),replayStore=new MemoryReplayStore();
 let dispatches=0;
 const capability={manifest,quote:async()=>1,invoke:async(action,args)=>{
  if(action!=='render')throw Error('capability_action_denied');
  dispatches++;
  const value=await renderWithFallenWorker(args[0],{baseUrl,token,outputDir,fetchImpl});
  return {value,costCents:1,evidence:{engine:value.engine,receipt_sha256:value.receipt_sha256,classification:value.classification}};
 }};
 const result=await run(plan,{job},{capabilities:[capability],approvalProvider:{request:async()=>approve===true},meter,replayStore});
 if(!verifyReceipt(result.receipt))throw Error('everscript_receipt_invalid');
 return {result,dispatches,budget:{fictitious_cost_cents:1,real_money_moved:false},systemia_admitted:false};
}
