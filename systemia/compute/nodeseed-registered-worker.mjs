import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {
  executeRegisteredMicroSeedWorkload,
  microSeedWorkloadCatalog,
  microSeedWorkloadSpec,
} from '../saban/microseed-workload-registry.mjs';

const stable=value=>{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  }
  return value;
};
const digest=value=>'sha256:'+createHash('sha256')
  .update(JSON.stringify(stable(value)))
  .digest('hex');

function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}

export const NodeSeedMicroWorkloads=Object.freeze(
  microSeedWorkloadCatalog().workloads
    .filter(row=>row.product_submission_allowed!==false)
    .map(row=>row.workload_class)
);

export function runNodeSeedRegisteredWorkload({
  nodeId,
  workloadClass,
  payload,
  idempotencyKey,
  stateDir,
}={}){
  const node=String(nodeId||'').trim();
  const workload=String(workloadClass||'').trim();
  const keyText=String(idempotencyKey||'').trim();
  if(!node) throw new Error('nodeseed_registered_worker_node_id_required');
  if(!keyText) throw new Error('nodeseed_registered_worker_idempotency_required');
  if(!stateDir) throw new Error('nodeseed_registered_worker_state_dir_required');

  const spec=microSeedWorkloadSpec(workload);
  if(!spec||spec.product_submission_allowed===false){
    throw new Error('nodeseed_registered_worker_workload_not_allowed');
  }

  const root=path.resolve(stateDir);
  const requestHash=digest({
    node_id:node,
    workload_class:workload,
    idempotency_key:keyText,
    payload:payload??null,
  });
  const file=path.join(
    root,
    'idempotency',
    createHash('sha256').update(node+'|'+workload+'|'+keyText).digest('hex')+'.json'
  );

  if(fs.existsSync(file)){
    const prior=JSON.parse(fs.readFileSync(file,'utf8'));
    if(prior.request_hash!==requestHash){
      throw new Error('nodeseed_registered_worker_idempotency_conflict');
    }
    return {...prior,deduplicated:true};
  }

  const result=executeRegisteredMicroSeedWorkload(
    workload,
    payload??null,
    {stateDir:path.join(root,'workload-state'),device_id:node}
  );
  if(result==null) throw new Error('nodeseed_registered_worker_result_unavailable');

  const body={
    schema:'evercraft.compute.registered-worker-receipt.v1',
    node_id:node,
    workload_class:workload,
    idempotency_key:keyText,
    request_hash:requestHash,
    result,
    deduplicated:false,
    registered_workload_only:true,
    completed_at:new Date().toISOString(),
  };
  const receipt={...body,receipt_hash:digest(body)};
  atomicJson(file,receipt);
  return receipt;
}
