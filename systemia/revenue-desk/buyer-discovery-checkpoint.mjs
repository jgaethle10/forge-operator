// Private research checkpoint; not CRM admission or delivery authority.
// One coordinator owns this directory. Lock contention and corrupt state fail closed.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {runDiscovery,sourceRegistry} from './buyer-discovery-cycle.mjs';
const schema='evercraft.kaidance.discovery-checkpoint.v1';
export async function checkpointCycle({directory,sources=sourceRegistry(),now=new Date()}={}){
 if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('absolute_private_directory_required');
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const dir=fs.lstatSync(directory);
 if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)!==0||dir.uid!==process.getuid())throw Error('unsafe_private_directory');
 const lock=path.join(directory,'cycle.lock'),file=path.join(directory,'checkpoint.json');
 const fd=fs.openSync(lock,'wx',0o600);
 let tmp;
 try{
  let prior={schema,records:[],cycles:0};
  if(fs.existsSync(file)){
   const st=fs.lstatSync(file);
   if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||st.uid!==process.getuid()||st.size>16000000)throw Error('unsafe_checkpoint');
   prior=JSON.parse(fs.readFileSync(file,'utf8'));
  }
  if(prior.schema!==schema||!Array.isArray(prior.records)||prior.records.length>20000||!Number.isSafeInteger(prior.cycles)||prior.cycles<0)throw Error('invalid_checkpoint');
  if(prior.last_cycle_at&&Date.parse(prior.last_cycle_at)>+now)throw Error('clock_rollback');
  const map=new Map();
  for(const r of prior.records){
   if(typeof r?.candidate_ref!=='string'||map.has(r.candidate_ref)||r.qualified!==false||r.contact_authorized!==false||r.stage!=='research_required')throw Error('invalid_prior_candidate');
   map.set(r.candidate_ref,r);
  }
  const cycle=await runDiscovery({sources,now});
  let added=0,reobserved=0;
  for(const c of cycle.candidates){
   const old=map.get(c.candidate_ref);
   if(old)reobserved++;else added++;
   map.set(c.candidate_ref,{...c,first_seen_at:old?.first_seen_at??cycle.observed_at,last_seen_at:cycle.observed_at});
  }
  if(map.size>20000)throw Error('checkpoint_capacity_review_required');
  const receipt={schema:'evercraft.kaidance.discovery-checkpoint-receipt.v1',observed_at:cycle.observed_at,sources:cycle.sources,new_candidates:added,reobserved_candidates:reobserved,retained_candidates:map.size,qualified_count:0,send_performed:false,crm_write_performed:false};
  const next={schema,cycles:prior.cycles+1,last_cycle_at:cycle.observed_at,records:[...map.values()],receipt};
  tmp=path.join(directory,'.checkpoint-'+randomUUID());
  const body=JSON.stringify(next);
  if(Buffer.byteLength(body)>16000000)throw Error('checkpoint_capacity_review_required');
  const out=fs.openSync(tmp,'wx',0o600);
  try{fs.writeFileSync(out,body);fs.fsyncSync(out);}finally{fs.closeSync(out);}
  fs.renameSync(tmp,file);
  const dfd=fs.openSync(directory,'r');try{fs.fsyncSync(dfd);}finally{fs.closeSync(dfd);}
  return receipt;
 }finally{
  if(tmp&&fs.existsSync(tmp))fs.unlinkSync(tmp);
  fs.closeSync(fd);fs.unlinkSync(lock);
 }
}
