import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

const shaHex=(value)=>createHash('sha256').update(
  value instanceof Uint8Array||Buffer.isBuffer(value)?value:Buffer.from(String(value))
).digest('hex');
const sha=(value)=>'sha256:'+shaHex(
  typeof value==='string'?value:JSON.stringify(value)
);

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  }
  return value;
}
function safeId(v){
  return String(v||'').trim().replace(/[^a-zA-Z0-9._:-]/g,'_').slice(0,220);
}
function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function loadState(file){
  if(!file||!fs.existsSync(file)){
    return {schema:'evercraft.saban.ambient-execution-state.v1',units:{},updated_at:null};
  }
  const parsed=JSON.parse(fs.readFileSync(file,'utf8'));
  if(parsed?.schema!=='evercraft.saban.ambient-execution-state.v1'||!parsed?.units){
    throw new Error('ambient_execution_state_invalid');
  }
  return parsed;
}
function validateGateway(url,{allowNonLoopback=false}={}){
  const parsed=new URL(String(url||''));
  const loopback=['127.0.0.1','localhost','::1'].includes(parsed.hostname.toLowerCase());
  if(parsed.protocol!=='http:'&&parsed.protocol!=='https:') throw new Error('ambient_gateway_http_required');
  if(!allowNonLoopback&&!loopback) throw new Error('ambient_gateway_loopback_required');
  if(parsed.username||parsed.password) throw new Error('ambient_gateway_url_credentials_forbidden');
  return parsed;
}
async function readJson(response,maxBytes=2*1024*1024){
  const text=await response.text();
  if(Buffer.byteLength(text)>maxBytes) throw new Error('ambient_gateway_response_too_large');
  try{return JSON.parse(text);}
  catch{throw new Error('ambient_gateway_response_invalid_json');}
}

export async function executeAmbientFabricPlan({
  plan,
  tasks=[],
  gatewayUrl,
  gatewayToken,
  inputProvider,
  telemetryProvider=null,
  stateFile='',
  maxConcurrency=4,
  allowNonLoopbackGateway=false,
  fetchImpl=fetch,
}={}){
  if(plan?.schema!=='evercraft.saban.heterogeneous-fabric-plan.v1'){
    throw new Error('ambient_executor_plan_required');
  }
  if(typeof inputProvider!=='function') throw new Error('ambient_executor_input_provider_required');
  if(!String(gatewayToken||'').trim()) throw new Error('ambient_executor_gateway_token_required');
  const gateway=validateGateway(gatewayUrl,{allowNonLoopback:allowNonLoopbackGateway});
  const taskMap=new Map((tasks||[]).map(t=>[String(t.task_id||''),t]));
  const state=loadState(stateFile);
  const placements=(plan.placements||[]).filter(p=>p.market==='ambient-fabric');
  const skipped=(plan.placements||[])
    .filter(p=>p.market!=='ambient-fabric')
    .map(p=>({
      unit_id:p.unit_id,
      task_id:p.task_id,
      reason:'execution_fabric_not_microseed',
      market:p.market,
    }));
  const results=new Array(placements.length);
  let cursor=0;

  async function runOne(index){
    const placement=placements[index];
    const task=taskMap.get(String(placement.task_id||''));
    if(!task){
      return {
        status:'held',
        unit_id:placement.unit_id,
        task_id:placement.task_id,
        reason:'task_definition_missing',
      };
    }
    if(!placement.device_id){
      return {
        status:'held',
        unit_id:placement.unit_id,
        task_id:placement.task_id,
        reason:'microseed_device_id_missing',
      };
    }

    const provided=await inputProvider({task,placement,plan});
    if(provided===undefined){
      return {
        status:'held',
        unit_id:placement.unit_id,
        task_id:placement.task_id,
        reason:'workload_input_unavailable',
      };
    }
    const payload=provided?.payload!==undefined?provided.payload:provided;
    const payloadHash=sha(stable(payload));
    const stateKey=safeId(placement.unit_id);
    const prior=state.units[stateKey]||null;
    if(
      prior?.status==='completed' &&
      prior?.plan_receipt===plan.receipt_hash &&
      prior?.payload_hash===payloadHash
    ){
      return {
        ...prior,
        status:'completed',
        deduplicated:true,
        resumed_from_state:true,
      };
    }

    const idempotencyKey='ambient:'+shaHex(
      [
        plan.receipt_hash||'no-plan-receipt',
        placement.unit_id,
        task.task_hash||task.workload_class,
        payloadHash,
      ].join('|')
    ).slice(0,48);

    const telemetry=typeof telemetryProvider==='function'
      ? await telemetryProvider({task,placement,plan})
      : provided?.telemetry||undefined;

    const requestBody={
      request:{
        device_id:placement.device_id,
        workload_class:task.workload_class,
        idempotency_key:idempotencyKey,
        payload,
        requested_memory_mb:Number(task.resources_per_execution?.memory_mb||0),
        requested_cpu_fraction:Math.min(1,Math.max(0,Number(task.resources_per_execution?.cpu_units||0))),
      },
      ...(telemetry?{telemetry}:{}),
    };

    const endpoint=new URL('/v1/execute',gateway);
    const startedAt=Date.now();
    try{
      const response=await fetchImpl(endpoint,{
        method:'POST',
        headers:{
          authorization:'Bearer '+String(gatewayToken).trim(),
          'content-type':'application/json',
          accept:'application/json',
        },
        body:JSON.stringify(requestBody),
      });
      const body=await readJson(response);
      if(!response.ok||body?.ok!==true){
        throw new Error('ambient_gateway_http_'+response.status+':'+String(body?.error||'execution_failed'));
      }
      const row={
        status:'completed',
        unit_id:placement.unit_id,
        task_id:placement.task_id,
        workload_class:task.workload_class,
        device_id:placement.device_id,
        offer_id:placement.offer_id,
        idempotency_key:idempotencyKey,
        payload_hash:payloadHash,
        plan_receipt:plan.receipt_hash||null,
        gateway_receipt_hash:body.receipt_hash||null,
        execution_location:body.execution_location||null,
        duration_ms:Math.max(0,Date.now()-startedAt),
        deduplicated:body.deduplicated===true,
        result:body.result??null,
        checkpoint:{
          completed:true,
          gateway_receipt_hash:body.receipt_hash||null,
          payload_hash:payloadHash,
        },
        completed_at:new Date().toISOString(),
      };
      state.units[stateKey]=row;
      state.updated_at=new Date().toISOString();
      if(stateFile) atomicJson(stateFile,state);
      return row;
    }catch(error){
      const row={
        status:'failed',
        unit_id:placement.unit_id,
        task_id:placement.task_id,
        workload_class:task.workload_class,
        device_id:placement.device_id,
        offer_id:placement.offer_id,
        idempotency_key:idempotencyKey,
        payload_hash:payloadHash,
        plan_receipt:plan.receipt_hash||null,
        duration_ms:Math.max(0,Date.now()-startedAt),
        reason:String(error?.message||error),
        failed_at:new Date().toISOString(),
      };
      state.units[stateKey]=row;
      state.updated_at=new Date().toISOString();
      if(stateFile) atomicJson(stateFile,state);
      return row;
    }
  }

  async function worker(){
    while(true){
      const index=cursor++;
      if(index>=placements.length)return;
      results[index]=await runOne(index);
    }
  }

  const workerCount=Math.max(1,Math.min(
    placements.length||1,
    Math.max(1,Math.floor(Number(maxConcurrency||4)))
  ));
  await Promise.all(Array.from({length:workerCount},()=>worker()));

  const completed=results.filter(r=>r?.status==='completed');
  const failed=results.filter(r=>r?.status==='failed');
  const held=[...skipped,...results.filter(r=>r?.status==='held')];
  const checkpoints=Object.fromEntries(
    completed
      .filter(r=>r.checkpoint)
      .map(r=>[r.unit_id,r.checkpoint])
  );

  return {
    schema:'evercraft.saban.ambient-fabric-execution-receipt.v1',
    plan_receipt:plan.receipt_hash||null,
    requested_placements:(plan.placements||[]).length,
    microseed_placements:placements.length,
    completed_units:completed.length,
    failed_units:failed.length,
    held_units:held.length,
    replan_required:failed.length>0||held.length>0,
    gateway_scope:allowNonLoopbackGateway?'explicit_non_loopback_allowed':'loopback_only',
    gateway_token_exposed:false,
    arbitrary_code_execution:false,
    results,
    held,
    checkpoints,
    generated_at:new Date().toISOString(),
  };
}
