/**
 * Node002 fixed-purpose inventory adapter, source review candidate.
 * No broker polling, no remote execution authority, no installer, no writes,
 * no network I/O, no child processes, and no device-key handling.
 *
 * This module is deliberately NOT a Systemia Compute execution worker.
 * It records owner-initiated observations only; its SHA256 is integrity, not
 * proof of device provenance, human approval, or executable authority.
 */
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {detectHardwareCapacity} from '../hardware-inventory.mjs';

export const NODE_ID='evercraft-node002-nextgen';
export const NODE_KEY='personal:hp-nextgen:node-002:v1';
export const WORKLOAD_KEY='evercraft.source.inventory.readonly.v1';
const STATEMENT_SCHEMA='evercraft.node002.inventory.operator-local.v1';
const REPORT_SCHEMA='evercraft.node002.inventory.operator-report.v1';
const own=(obj,k)=>Object.prototype.hasOwnProperty.call(obj,k);
function reject(code){const err=new Error(code);err.code=code;throw err;}
function plain(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||
   Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))reject('inventory_fields_invalid');
}
function canonical(value){
 const seen={count:0};
 const normalize=(v,depth)=>{
  if(depth>8||++seen.count>64)reject('inventory_complexity_invalid');
  if(v===null||typeof v==='string'||typeof v==='boolean')return v;
  if(typeof v==='number'&&Number.isFinite(v))return v;
  if(Array.isArray(v))return v.map(x=>normalize(x,depth+1));
  if(!v||typeof v!=='object'||Object.getPrototypeOf(v)!==Object.prototype)reject('inventory_type_invalid');
  const x={};
  for(const k of Object.keys(v).sort()){
   if(['__proto__','constructor','prototype'].includes(k))reject('inventory_key_invalid');
   x[k]=normalize(v[k],depth+1);
  }
  return x;
 };
 const raw=JSON.stringify(normalize(value,0));
 if(Buffer.byteLength(raw)>4096)reject('inventory_too_large');
 return raw;
}
const hash=value=>'sha256:'+createHash('sha256').update(canonical(value),'utf8').digest('hex');
const integer=(n,low,high)=>Number.isSafeInteger(n)&&n>=low&&n<=high;
function assertFacts(facts){
 plain(facts,['cpu_units','memory_mb','root_available_gb','evidence']);
 plain(facts.evidence,['cpu','memory','storage','gpu']);
 if(!integer(facts.cpu_units,1,1024)||!integer(facts.memory_mb,64,64*1024*1024)||
   typeof facts.root_available_gb!=='number'||!Number.isFinite(facts.root_available_gb)||
   facts.root_available_gb<0||facts.root_available_gb>100000000)reject('inventory_measurement_invalid');
 if(facts.evidence.cpu!=='os.cpus'||facts.evidence.memory!=='os.totalmem'||
   !['fs.statfs','unavailable'].includes(facts.evidence.storage)||
   facts.evidence.gpu!=='not_probed')reject('inventory_source_invalid');
}

/** A read-only measurement with the GPU process probe explicitly disabled. */
export function collectOperatorInventory({
 operatorConfirmed=false,
 localOnly=true,
 hardwareProbe=detectHardwareCapacity,
 now=()=>new Date(),
}={}){
 if(operatorConfirmed!==true||localOnly!==true)reject('owner_local_consent_required');
 if(typeof hardwareProbe!=='function'||typeof now!=='function')reject('probe_invalid');
 // Fixed root; external job payloads never select files or programs.
 const h=hardwareProbe({
   root:'/',
   run:()=>({status:127,stdout:''}), // prevent even fixed nvidia-smi subprocess
 });
 if(!h||h.schema!=='evercraft.compute.hardware-capacity.v1')reject('probe_schema_invalid');
 if(h.evidence?.gpu!=='unavailable'||h.gpu_units!==0||h.vram_mb!==0)reject('gpu_process_probe_forbidden');
 const facts={
   cpu_units:h.cpu_units,memory_mb:h.memory_mb,
   root_available_gb:h.storage_gb,
   evidence:{cpu:h.evidence.cpu,memory:h.evidence.memory,storage:h.evidence.storage,gpu:'not_probed'}
 };
 assertFacts(facts);
 const timestamp=now();
 if(!(timestamp instanceof Date)||!Number.isFinite(timestamp.getTime()))reject('clock_invalid');
 const statement={
   schema:STATEMENT_SCHEMA,
   node_id:NODE_ID,node_key:NODE_KEY,workload_key:WORKLOAD_KEY,
   execution_context:'owner_operator_local',
   remote_execution_authorized:false,
   independently_attested:false,
   device_signature_present:false,
   observed_at:timestamp.toISOString(),
   facts
 };
 return Object.freeze({
   schema:REPORT_SCHEMA,statement,
   statement_sha256:hash(statement),
   evidence_state:'UNSIGNED_OWNER_LOCAL_ONLY',
   production_execution_receipt:false,
 });
}

/** Checks only structure and digest, never authentication or authority. */
export function verifyOperatorInventoryReport(report,{now=Date.now(),maxAgeMs=5*60*1000}={}){
 plain(report,['schema','statement','statement_sha256','evidence_state','production_execution_receipt']);
 if(report.schema!==REPORT_SCHEMA||report.evidence_state!=='UNSIGNED_OWNER_LOCAL_ONLY'||report.production_execution_receipt!==false)
   reject('report_authority_claim_forbidden');
 const s=report.statement;
 plain(s,['schema','node_id','node_key','workload_key','execution_context',
   'remote_execution_authorized','independently_attested','device_signature_present','observed_at','facts']);
 if(s.schema!==STATEMENT_SCHEMA||s.node_id!==NODE_ID||s.node_key!==NODE_KEY||s.workload_key!==WORKLOAD_KEY||
  s.execution_context!=='owner_operator_local'||s.remote_execution_authorized!==false||
  s.independently_attested!==false||s.device_signature_present!==false)
   reject('report_authority_claim_forbidden');
 assertFacts(s.facts);
 if(typeof s.observed_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s.observed_at)||
    !Number.isFinite(Date.parse(s.observed_at))||!Number.isFinite(now)||!integer(maxAgeMs,1,300000)||
    Date.parse(s.observed_at)>now+30000||now-Date.parse(s.observed_at)>maxAgeMs)reject('report_timestamp_invalid');
 if(typeof report.statement_sha256!=='string'||!/^sha256:[0-9a-f]{64}$/.test(report.statement_sha256)||
    report.statement_sha256!==hash(s))reject('report_digest_invalid');
 return Object.freeze({
  structure_and_digest_valid:true,
  cryptographically_device_authenticated:false,
  execution_authorized:false,
  independent_compute_receipt_verified:false,
  evidence_level:'owner_reported_unsigned_local',
 });
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 if(process.argv.length!==3||process.argv[2]!=='--operator-local'){
   console.error('usage: node operator-inventory.mjs --operator-local (unsigned, local, no remote work)');
   process.exitCode=2;
 }else{
   const report=collectOperatorInventory({operatorConfirmed:true});
   console.log(JSON.stringify(report,null,2));
 }
}
