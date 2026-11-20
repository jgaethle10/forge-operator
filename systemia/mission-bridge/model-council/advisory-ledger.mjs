import fs from 'node:fs';
import path from 'node:path';

// Durable read-only advice billing gate. Use only on Evercraft-owned private
// storage; the atomic global lock serializes multi-worker daily reservations.
const KEY=/^advice:[a-f0-9]{32}$/;
const MAX_24H_MS=24*60*60*1000;
function positiveInt(v){return Number.isSafeInteger(v)&&v>0;}
function ledgerRoot(root){
 if(typeof root!=='string'||!path.isAbsolute(root))throw Error('absolute_private_ledger_dir_required');
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 const stat=fs.lstatSync(root);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('unsafe_advisory_ledger_root');
 fs.chmodSync(root,0o700);
 return root;
}
function records(root){
 const out=[];
 for(const file of fs.readdirSync(root)){
  if(!/^[a-f0-9]{32}\.json$/.test(file))continue;
  const stat=fs.lstatSync(path.join(root,file));
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('unsafe_advisory_ledger_record');
  const x=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  if(!KEY.test(x.key||'')||!Number.isSafeInteger(x.reserved_at_ms)||!positiveInt(x.estimated_cost_cents))
    throw Error('invalid_advisory_ledger_record');
  out.push(x);
 }
 return out;
}
export function loadAdvisoryHistory({ledgerDir}){
 return records(ledgerRoot(ledgerDir)).map(x=>({key:x.key,state:'attempted',recorded_at_ms:x.reserved_at_ms}));
}
export function reserveAdvisoryAttempt({
 ledgerDir,job,rolling_budget_cents,now_ms=Date.now()
}={}){
 const root=ledgerRoot(ledgerDir);
 if(!KEY.test(job?.key||'')||!positiveInt(job?.estimated_cost_cents))
   throw Error('invalid_advisory_reservation');
 if(!positiveInt(rolling_budget_cents)||!Number.isSafeInteger(now_ms)||now_ms<0)
   throw Error('missing_or_invalid_rolling_budget');
 const lock=path.join(root,'.reservation.lock');
 try{fs.mkdirSync(lock,{mode:0o700});}
 catch(e){if(e?.code==='EEXIST')return {reserved:false,reason:'ledger_locked'};throw e;}
 try{
  const all=records(root);
  if(all.some(x=>x.key===job.key))return {reserved:false,reason:'already_attempted'};
  const consumed=all.filter(x=>now_ms-x.reserved_at_ms<MAX_24H_MS && now_ms>=x.reserved_at_ms)
    .reduce((sum,x)=>sum+x.estimated_cost_cents,0);
  if(consumed+job.estimated_cost_cents>rolling_budget_cents)
    return {reserved:false,reason:'rolling_budget_limit'};
  const record={schema:'evercraft.systemia.advisory-attempt.v1',
    key:job.key,mission_id:String(job.mission_id||''),provider:String(job.provider||''),
    model:String(job.model||''),estimated_cost_cents:job.estimated_cost_cents,
    reserved_at_ms:now_ms,state:'attempted',provider_result:'unknown'};
  const file=path.join(root,job.key.slice(7)+'.json');
  fs.writeFileSync(file,JSON.stringify(record)+'\n',{encoding:'utf8',flag:'wx',mode:0o600});
  return {reserved:true,key:job.key,rolling_reserved_cents:consumed+job.estimated_cost_cents};
 }finally{fs.rmdirSync(lock);}
}
