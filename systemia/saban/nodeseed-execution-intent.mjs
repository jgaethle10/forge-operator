import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';

const stable=value=>{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  }
  return value;
};
const sha=v=>'sha256:'+createHash('sha256').update(
  typeof v==='string'?v:JSON.stringify(stable(v))
).digest('hex');

function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function safeId(v){
  const text=String(v||'').trim();
  if(!text) throw new Error('nodeseed_intent_id_input_required');
  return createHash('sha256').update(text).digest('hex').slice(0,32);
}
function intentDir(root){return path.join(path.resolve(root),'nodeseed-execution-intents');}
function intentFile(root,intentId){return path.join(intentDir(root),intentId+'.json');}

export function createNodeSeedExecutionIntent({
  root,
  job,
  task,
  placement,
  plan,
  now=new Date(),
}={}){
  if(!root) throw new Error('nodeseed_intent_root_required');
  if(job?.schema!=='evercraft.saban.ambient-job.v1') throw new Error('nodeseed_intent_job_required');
  if(task?.schema!=='evercraft.saban.fabric-task.v1') throw new Error('nodeseed_intent_task_required');
  if(placement?.market!=='evercraft-nodeseed') throw new Error('nodeseed_intent_placement_market_invalid');
  if(!String(placement.provider_id||'').trim()) throw new Error('nodeseed_intent_node_id_required');

  const intentId='nsi-'+safeId([
    job.job_id,
    placement.unit_id,
    placement.provider_id,
    plan?.receipt_hash||'no-plan',
    job.payload_hash,
  ].join('|'));
  const file=intentFile(root,intentId);
  const body={
    schema:'evercraft.saban.nodeseed-execution-intent.v1',
    intent_id:intentId,
    state:'awaiting_yard_execution',
    job_id:job.job_id,
    workload_class:job.workload_class,
    node_id:String(placement.provider_id),
    offer_id:String(placement.offer_id||''),
    unit_id:String(placement.unit_id||''),
    plan_receipt:plan?.receipt_hash||null,
    payload_hash:job.payload_hash,
    idempotency_key:'nodeseed-job:'+job.job_id,
    resources:{
      cpu_units:Number(task.resources_per_execution?.cpu_units||0),
      memory_mb:Number(task.resources_per_execution?.memory_mb||0),
      storage_gb:Number(task.resources_per_execution?.storage_gb||0),
    },
    private_data:job.private_data===true,
    preemptible:job.preemptible===true,
    checkpointable:job.checkpointable===true,
    authority_boundary:'yard_remote_capacity_grant_required',
    allocator_token_persisted:false,
    control_token_persisted:false,
    payload_persisted:false,
    created_at:(now instanceof Date?now:new Date(now)).toISOString(),
    updated_at:(now instanceof Date?now:new Date(now)).toISOString(),
  };
  const intent={...body,intent_hash:sha(body)};
  if(fs.existsSync(file)){
    const prior=JSON.parse(fs.readFileSync(file,'utf8'));
    if(
      prior?.schema!==intent.schema ||
      prior?.job_id!==intent.job_id ||
      prior?.node_id!==intent.node_id ||
      prior?.payload_hash!==intent.payload_hash ||
      prior?.plan_receipt!==intent.plan_receipt
    ){
      throw new Error('nodeseed_execution_intent_conflict');
    }
    return {...prior,deduplicated:true};
  }
  atomicJson(file,intent);
  return {...intent,deduplicated:false};
}

export function getNodeSeedExecutionIntent({root,intentId}={}){
  const file=intentFile(root,String(intentId||''));
  return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
}

export function listNodeSeedExecutionIntents({root,states=null}={}){
  const dir=intentDir(root);
  if(!fs.existsSync(dir)) return [];
  const allowed=states?new Set(states.map(String)):null;
  return fs.readdirSync(dir)
    .filter(name=>name.endsWith('.json'))
    .map(name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8')))
    .filter(row=>!allowed||allowed.has(row.state))
    .sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.intent_id.localeCompare(b.intent_id));
}

export function updateNodeSeedExecutionIntent({root,intentId,patch={}}={}){
  const current=getNodeSeedExecutionIntent({root,intentId});
  if(!current) throw new Error('nodeseed_execution_intent_not_found');
  const body={
    ...current,
    ...patch,
    schema:current.schema,
    intent_id:current.intent_id,
    job_id:current.job_id,
    workload_class:current.workload_class,
    node_id:current.node_id,
    payload_hash:current.payload_hash,
    idempotency_key:current.idempotency_key,
    allocator_token_persisted:false,
    control_token_persisted:false,
    payload_persisted:false,
    updated_at:new Date().toISOString(),
  };
  delete body.intent_hash;
  const next={...body,intent_hash:sha(body)};
  atomicJson(intentFile(root,current.intent_id),next);
  return next;
}
