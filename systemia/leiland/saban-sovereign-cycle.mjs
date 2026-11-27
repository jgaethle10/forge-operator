// Called only by the existing Saban/Yard drain; no timer or service here.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadMultiplicationRegistry,resolveMultiplicationContract} from '../saban/multiplier.mjs';
import {admitMultiplicationRequest} from '../saban/admission.mjs';
import {runRegisteredAssignment} from '../saban/registered-worker.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const schema='evercraft.leiland.saban-cycle.v1';
const software='leiland-sovereign-proof';
const hash=x=>'sha256:'+createHash('sha256').update(JSON.stringify(x)).digest('hex');
const digest=x=>typeof x==='string'&&/^sha256:[a-f0-9]{64}$/.test(x);
const base={schema,synthetic_input:true,external_actions_authorized:false,
 remote_dispatch_authorized:false,production_worker_verified:false};
function privateDir(p){
 const s=fs.lstatSync(p);
 if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0||
    (typeof process.getuid==='function'&&s.uid!==process.getuid()))throw Error('leiland_private_state_required');
}
function read(file){
 if(!fs.existsSync(file))return null;
 const s=fs.lstatSync(file);
 if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)!==0||s.size>16000||
    (typeof process.getuid==='function'&&s.uid!==process.getuid()))throw Error('leiland_state_unsafe');
 const r=JSON.parse(fs.readFileSync(file,'utf8'));
 const {state_hash,...body}=r;
 if(r.schema!==schema||!Number.isSafeInteger(r.tick)||
    !['pending','held','completed'].includes(r.state)||state_hash!==hash(body))throw Error('leiland_state_invalid');
 return r;
}
function save(file,body){
 const temp=file+'.'+randomBytes(8).toString('hex')+'.tmp';
 try{
  const fd=fs.openSync(temp,'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify({...body,state_hash:hash(body)})+'\n');fs.fsyncSync(fd)}
  finally{fs.closeSync(fd)}
  fs.renameSync(temp,file);
  const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir)}finally{fs.closeSync(dir)}
 }finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
}
export async function runLeilandSabanCycle({stateDir,now=new Date(),rootDir=ROOT,
 executionContext=null,registeredAssignment=runRegisteredAssignment}={}){
 const idle=(state,extra={})=>({...base,state,assignment_attempted:false,...extra});
 if(executionContext?.leilandLocalProofEnabled!==true)return idle('disabled');
 if(!stateDir)return idle('held_no_state');
 const tick=Math.floor(+new Date(now)/300000);
 if(!Number.isSafeInteger(tick)||tick<0)return idle('held_clock');
 const folder=path.resolve(stateDir),file=path.join(folder,'leiland-sovereign-cycle.json');
 const lock=file+'.lock';
 try{privateDir(folder);fs.mkdirSync(lock,{mode:0o700})}
 catch{return idle('held_busy_or_unsafe')}
 try{
  const prior=read(file);
  if(prior?.tick>tick)return idle('held_clock_rollback');
  if(prior&&prior.state!=='completed')return idle('held_unreconciled_checkpoint');
  if(prior&&tick-prior.tick<12)return idle('cooldown',{last_completed_tick:prior.tick});
  const registry=loadMultiplicationRegistry(path.join(rootDir,'systemia/saban/multiplication-registry.json'));
  const contract=resolveMultiplicationContract(software,registry);
  if(contract.max_logical_agents!==1||contract.max_physical_workers!==1||
     contract.max_attempts_per_job!==1||contract.side_effects?.default!=='deny'||
     contract.side_effects?.external_network!==false||
     contract.side_effects?.production_provider_calls!==false)return idle('held_contract');
  const admission=admitMultiplicationRequest({contract,requestedLogicalAgents:1,
   requestedPhysicalWorkers:1,requestedWorkItems:1,requestedAttempts:1,
   budget:{max_logical_agents:1,max_physical_workers:1,max_work_items:1,max_attempts_per_job:1}});
  if(!admission.admitted)return idle('held_capacity');
  const checkpoint={...base,state:'pending',tick,lane:'findmypart',
   assignment_key:'leiland:findmypart:'+tick,assignment_attempted:false};
  save(file,checkpoint);
  let completion;
  try{
   const receipt=await registeredAssignment({software,rootDir,executionContext,
    assignment:{agent_id:'leiland-synthetic-reviewer',role:'synthetic_repair_evidence_review',
     idempotency_key:checkpoint.assignment_key,work:{kind:'synthetic_review',key:'findmypart'}}});
   const r=receipt?.result,proof=r?.receipts?.[0];
   if(receipt?.schema!=='evercraft.saban.registered-worker-receipt.v1'||
      receipt.software_id!==software||receipt.idempotency_key!==checkpoint.assignment_key||
      r?.schema!=='evercraft.leiland.saban-proof.v1'||r.state!=='provider_reported_completed'||
      r.lane!=='findmypart'||r.synthetic_input!==true||r.inference_completed!==1||
      r.inference_request_attempted!==true||r.result_released!==true||
      r.external_actions_authorized!==false||r.receipts?.length!==1||
      proof?.lane!=='findmypart'||proof.output_quality_verified!==false||
      !digest(proof.provider_receipt)||!digest(proof.output_digest)||!digest(r.authorization_digest))
    throw Error('leiland_assignment_receipt_held');
   completion={...checkpoint,state:'completed',assignment_attempted:true,
    inference_completed:1,provider_receipt:proof.provider_receipt,
    output_digest:proof.output_digest,authorization_digest:r.authorization_digest,
    quality_reviewed:false};
  }catch{
   completion={...checkpoint,state:'held',assignment_attempted:true,
    inference_completed:null,reason:'assignment_outcome_requires_reconciliation'};
  }
  save(file,completion);
  return completion;
 }catch{return idle('held_state_or_contract')}
 finally{fs.rmdirSync(lock)}
}
