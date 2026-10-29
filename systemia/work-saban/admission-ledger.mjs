import { capacityView } from './capacity-model.mjs';

/* Deterministic admission ledger. This module does not launch processes or agents.
   A real executor must explicitly acknowledge provisioning before a worker is counted. */
export function createAdmissionLedger({limit=24}={}){
  if(!Number.isSafeInteger(limit)||limit<1)throw new RangeError('invalid_worker_limit');
  const jobs=new Map();
  const valid=new Set(['requested','admitted','provisioned','running','verified','failed']);
  function transition(id,next){
    if(typeof id!=='string'||!id.trim()||id.length>160)throw new TypeError('invalid_worker_id');
    if(!valid.has(next))throw new TypeError('invalid_worker_state');
    const previous=jobs.get(id);
    const allowed={
      undefined:['requested'],
      requested:['admitted','failed'],
      admitted:['provisioned','failed'],
      provisioned:['running','failed'],
      running:['verified','failed'],
      verified:[],
      failed:[]
    };
    if(previous===next)return snapshot();
    if(!allowed[String(previous)].includes(next))throw new Error('invalid_worker_transition');
    if(next==='admitted'&&[...jobs.values()].filter(s=>['admitted','provisioned','running'].includes(s)).length>=limit)
      throw new Error('worker_capacity_exceeded');
    jobs.set(id,next);
    return snapshot();
  }
  function snapshot(){
    const values=[...jobs.values()];
    const count=s=>values.filter(x=>x===s).length;
    const requested=jobs.size,verified=count('verified'),failed=count('failed');
    const running=count('running'),provisioned=count('provisioned')+running+verified;
    const admitted=count('admitted')+provisioned+failed;
    return capacityView({requested,admitted,provisioned,running,verified,failed});
  }
  return Object.freeze({transition,snapshot,get:id=>jobs.get(id),limit});
}
