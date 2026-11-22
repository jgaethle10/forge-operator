/**
 * Read-only owned-runtime readback. Not a scheduler, deployment controller,
 * worker, provider client, or authority source. Never reads API credentials.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {worldsSabanSourceFingerprint} from './kaidance-worlds-saban-review.mjs';

const SOURCE_ROOT=fileURLToPath(new URL('../../',import.meta.url));
const hash=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
const TYPES=['kaidance-company-heartbeat','kaidance-worlds-saban-review'];
const MAX_AGE=15*60*1000;
const BAD=(reason)=>{const error=new Error(reason);error.code='KAIDANCE_READBACK_HOLD';throw error};
const timestamp=(s,now)=>{
 const t=Date.parse(s), current=new Date(now).getTime();
 if(!Number.isFinite(t)||!Number.isFinite(current)||t>current+60000||
   current-t>MAX_AGE)BAD('missing_or_stale_timestamp');
 return t;
};
function privateFile(file,root){
 if(typeof file!=='string'||!path.isAbsolute(file))BAD('private_absolute_path_required');
 const target=path.resolve(file),source=fs.realpathSync(root);
 if(target===source||target.startsWith(source+path.sep))BAD('private_state_inside_source_checkout');
 if(fs.realpathSync(target)!==target||
    fs.realpathSync(path.dirname(target))!==path.dirname(target))BAD('private_symlink_refused');
 const stat=fs.lstatSync(target);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)BAD('private_state_mode_0600_required');
 if(stat.size>2*1024*1024)BAD('private_state_file_too_large');
 return target;
}
function json(file,root){
 return JSON.parse(fs.readFileSync(privateFile(file,root),'utf8'));
}
function verifyCycleReceipts(file,root,service,now){
 const lines=fs.readFileSync(privateFile(file,root),'utf8').trim().split('\n');
 const verified=[];
 for(const line of lines){
  let v;try{v=JSON.parse(line)}catch{BAD('supervisor_receipt_line_invalid')}
  if(v?.schema!=='evercraft.systemia.resident-supervisor-receipt.v1')BAD('supervisor_receipt_schema_invalid');
  const {receipt_hash:claimed,...body}=v;
  if(claimed!==hash(JSON.stringify(body)))BAD('supervisor_receipt_hash_invalid');
  if(v.type==='cycle.completed'&&v.service_key===service){
   if(v.exit_code!==0)BAD('resident_cycle_failed');
   verified.push({at:Date.parse(v.at),receipt_hash:claimed});
  }
 }
 if(verified.length<2)BAD('two_completed_cycles_not_observed');
 const [prior,latest]=verified.slice(-2);
 if(!Number.isFinite(prior.at)||!Number.isFinite(latest.at)||
    latest.at-prior.at<120000||latest.at-prior.at>3600000)
  BAD('distinct_spaced_resident_cycles_not_verified');
 timestamp(new Date(latest.at).toISOString(),now);
 return {completed_cycles_evidenced:verified.length,latest_receipt_hash:latest.receipt_hash};
}
function cycleHealth(health,service){
 const rows=health.services||[];
 if(rows.filter(x=>x.service_key===service).length!==1)BAD('resident_service_identity_missing_or_duplicated');
 const row=rows.find(x=>x.service_key===service);
 if(!['idle','running'].includes(row.status)||row.last_exit_code!==0)
  BAD('resident_service_not_healthy');
 if(!Number.isSafeInteger(row.run_count)||row.run_count<2)BAD('resident_run_count_unverified');
 return row;
}
function normalizeSnapshot(snapshot){
 if(snapshot?.schema!=='evercraft.kaidance.mission-snapshot.v1')BAD('saban_mission_snapshot_invalid');
 const a=snapshot.counts||{};
 const counts=Object.fromEntries(['scanned','changed','admitted','held'].map(k=>[k,Math.max(0,Number(a[k]||0))]));
 if(counts.changed>counts.scanned||counts.admitted+counts.held>counts.changed)
  BAD('saban_mission_snapshot_count_invalid');
 return {...snapshot,counts,snapshot_ref:String(snapshot.snapshot_ref||''),
  observed_at:String(snapshot.observed_at||''),
  evidence_refs:Array.isArray(snapshot.evidence_refs)?snapshot.evidence_refs.map(String).slice(0,500):[]};
}

export function inspectOwnedKaidance({
 root=SOURCE_ROOT,supervisorDir='',companyDir='',worldsDir='',publisherLedger='',
 now=new Date()
}={}){
 const checks={};const reasons=[];
 function check(name,fn){
  try{checks[name]={ok:true,...fn()}}
  catch(e){
   // Never echo JSON parser excerpts, raw OS paths, tokens or private records.
   const reason=e?.code==='KAIDANCE_READBACK_HOLD'
    ?String(e.message).slice(0,100):'private_evidence_unavailable_or_invalid';
   checks[name]={ok:false,reason};reasons.push(name);
  }
 }
 let health,review,snapshot;
 check('resident_supervisor',()=>{
  health=json(path.join(supervisorDir,'health.json'),root);
  if(health.schema!=='evercraft.systemia.resident-supervisor-health.v1'||health.running!==true)
   BAD('resident_supervisor_not_running');
  timestamp(health.observed_at,now);
  const bind=json(path.join(supervisorDir,'deployment-receipt.json'),root);
  if(bind.schema!=='evercraft.systemia.core-deployment-binding.v1'||
   !bind.receipt_ref||bind.receipt_ref!==health.deployment_receipt)
   BAD('resident_deployment_binding_unverified');
  return {deployment_receipt_bound:true};
 });
 for(const service of TYPES){
  check(service,()=>{
   if(!health)BAD('supervisor_health_unavailable');
   cycleHealth(health,service);
   const receipts=verifyCycleReceipts(path.join(supervisorDir,'receipts.jsonl'),root,service,now);
   return receipts;
  });
 }
 check('company_receipt',()=>{
  const r=json(path.join(companyDir,'latest.json'),root);
  if(r.schema!=='evercraft.kaidance.company-heartbeat.v1'||r.heartbeat_seconds!==300)
   BAD('company_heartbeat_receipt_invalid');
  timestamp(r.observed_at,now);
  const state=json(path.join(companyDir,'state.json'),root);
  if(state.schema!=='evercraft.kaidance.company-heartbeat-state.v1'||
    state.tick!==r.tick)BAD('company_heartbeat_state_mismatch');
  return {company_products_observed:r.company_portfolio?.public_products||0};
 });
 check('worlds_goal_receipt',()=>{
  review=json(path.join(worldsDir,'latest.json'),root);
  if(review.schema!=='evercraft.kaidance.saban-world-review.v1'||
     !review.local_readonly_completed||!review.execution_receipt_verified||
     review.state!=='complete'||review.source_code_changes!==0||
     review.features_deployed!==0||review.payment_mutations!==0||review.publication_actions!==0)
   BAD('worlds_source_review_not_verified');
  timestamp(review.observed_at,now);
  const actual=worldsSabanSourceFingerprint(root);
  if(actual!==review.source_fingerprint)BAD('worlds_source_fingerprint_changed');
  if(!/^mossmere-engine-review-[a-f0-9]{24}$/.test(review.goal_key||''))
   BAD('worlds_goal_identity_invalid');
  const goal=json(path.join(worldsDir,'goals',review.goal_key+'.json'),root);
  const task=goal.tasks?.[0];
  if(goal.schema!=='evercraft.goal.state.v1'||goal.mission_key!=='evercraft-worlds-source-development'||
    goal.goal_key!==review.goal_key||goal.status!=='complete'||goal.tasks.length!==1||
    task.work_key!=='worlds-mossmere-source-architect-review'||task.status!=='complete'||
    task.attempt<1||task.recovery_hold||!goal.context_refs?.includes(actual)||
    !task.receipt_refs?.length||!task.receipt_refs.every(x=>review.receipt_refs.includes(x)))
    BAD('worlds_persisted_goal_mismatch');
  return {completed_goal:true,source_fingerprint_verified:true,attempt:task.attempt};
 });
 check('mission_publisher',()=>{
  snapshot=normalizeSnapshot(json(path.join(worldsDir,'mission-snapshot.json'),root));
  const ledger=json(publisherLedger,root);
  if(ledger.schema!=='evercraft.systemia.mission-publisher-ledger.v1'||!ledger.deployment_id)
   BAD('mission_publisher_ledger_invalid');
  timestamp(ledger.updated_at,now);
  const record=ledger.published?.['kaidance-worlds-saban-review'];
  if(!record||record.synthetic_hold_reason||
    record.snapshot_ref!==snapshot.snapshot_ref||
    record.snapshot_hash!==hash(JSON.stringify(snapshot))||
    !/^sha256:[a-f0-9]{64}$/.test(record.ingress_receipt_hash||''))
    BAD('current_saban_snapshot_not_accepted_by_publisher');
  return {snapshot_matched:true,publisher_ingress_receipt_verified:true};
 });
 return {
  schema:'evercraft.kaidance.owned-resident-readback.v1',
  status:reasons.length?'hold':'resident_evidence_verified',
  observed_at:new Date(now).toISOString(),
  checks,held_checks:reasons,
  authority:{read_only:true,service_started_by_this_check:false,
   physical_node_identity_verified:false,second_scheduler_absent_not_proven:true,
   production_deployment_performed:false,provider_delivery_verified:false,
   autonomous_code_generation_verified:false},
 };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const flag=(n)=>{const i=process.argv.indexOf(n);return i<0?'':process.argv[i+1]||'';};
 try{
  const result=inspectOwnedKaidance({
   supervisorDir:flag('--supervisor-state'),companyDir:flag('--company-state'),
   worldsDir:flag('--worlds-state'),publisherLedger:flag('--publisher-ledger')
  });
  // No private paths, tokens, customer details or raw ledger content in stdout.
  console.log(JSON.stringify(result));
  if(result.status!=='resident_evidence_verified')process.exitCode=2;
 }catch(e){
  console.log(JSON.stringify({schema:'evercraft.kaidance.owned-resident-readback.v1',
   status:'hold',reason:e?.code==='KAIDANCE_READBACK_HOLD'
    ?String(e.message).slice(0,100):'private_evidence_unavailable_or_invalid'}));
  process.exitCode=2;
 }
}
