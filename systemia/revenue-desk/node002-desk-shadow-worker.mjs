// Proposed private Node002 workload. Importing this module does not register it.
// Fixed owner-configured database, no caller paths, shell, network or send access.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const FINDMYPART_DESK_WORKLOAD='systemia.findmypart-desk-shadow-review.v1';
const NODE='evercraft-node002-nextgen';
const script=fileURLToPath(new URL('./findmypart-queue-review-handoff.py',import.meta.url));
const hash=v=>'sha256:'+createHash('sha256').update(v).digest('hex');
const hex=/^sha256:[a-f0-9]{64}$/;
const key=/^findmypart:shop:[a-z0-9-]{1,80}$/;
const fail=c=>{throw Error(c)};
function exact(o,fields){return o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===fields.slice().sort().join(',')}
export function createFindMyPartDeskWorker({nodeId,deskRoot,enabled=false,spawn=spawnSync}={}){
 if(nodeId!==NODE||typeof deskRoot!=='string'||!path.isAbsolute(deskRoot))fail('desk_node_scope_denied');
 const db=path.join(deskRoot,'desk.sqlite3');
 return {execute({payload,idempotencyKey}={}){
  if(enabled!==true)fail('desk_workload_disabled');
  if(!exact(payload,['schema','envelope'])||payload.schema!=='evercraft.findmypart.node002-desk-request.v1'||!exact(payload.envelope,['schema','source_tick','observed_at','source_authority','candidates','contact_clearance','outreach_authorized','payload_digest']))fail('desk_request_denied');
  const e=payload.envelope;
  if(e.schema!=='evercraft.findmypart.queue-review-envelope.v1'||!hex.test(e.payload_digest)||e.contact_clearance!==false||e.outreach_authorized!==false||!Number.isSafeInteger(e.source_tick)||!Array.isArray(e.candidates)||e.candidates.length>6||e.candidates.some(c=>!exact(c,['work_key','business_name','source_url'])||!key.test(c.work_key)))fail('desk_envelope_denied');
  if(idempotencyKey!=='fmp-desk:'+e.payload_digest.slice(7))fail('desk_job_key_mismatch');
  const input=JSON.stringify(e);
  if(Buffer.byteLength(input)>16384)fail('desk_request_too_large');
  const st=fs.lstatSync(db);
  if(fs.realpathSync(db)!==db||!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||st.size>128*1024*1024)fail('desk_database_not_admitted');
  const r=spawn('/usr/bin/python3',[script,'--db',db],{input,encoding:'utf8',timeout:10000,maxBuffer:32768,shell:false,env:{PATH:'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'}});
  if(r.error||r.status!==0)fail('desk_review_held');
  let result;try{result=JSON.parse(r.stdout)}catch{fail('desk_result_invalid')}
  if(result?.source_tick!==e.source_tick||result.source_digest!==e.payload_digest||result.transport_authenticated!==false||result.contact_clearance!==false||result.outreach_authorized!==false)fail('desk_result_invalid');
  let rows=[];
  if(e.candidates.length){
   if(result.schema!=='evercraft.findmypart.desk-shadow-review.v1'||result.state!=='desk_shadow_review_completed'||result.private_customer_rows_exported!==0||result.production_modified!==false||result.gmail_history_verified!==false||result.interaction_ledger_verified!==false||!Array.isArray(result.candidates)||result.candidates.length!==e.candidates.length)fail('desk_result_invalid');
   const expected=new Set(e.candidates.map(c=>c.work_key));
   if(expected.size!==e.candidates.length)fail('desk_result_invalid');
   rows=result.candidates.map(c=>{
    if(!expected.delete(c.work_key)||!['hold_existing_desk_history_review','no_desk_match_not_clearance'].includes(c.state)||!Number.isSafeInteger(c.opportunity_matches)||c.opportunity_matches<0||!Number.isSafeInteger(c.sent_matches)||c.sent_matches<0||c.contact_clearance!==false||c.outreach_authorized!==false)fail('desk_result_invalid');
    return {work_key:c.work_key,state:c.state,opportunity_matches:c.opportunity_matches,sent_matches:c.sent_matches};
   });
  }else if(result.schema!=='evercraft.findmypart.queue-desk-handoff.v1'||result.state!=='no_candidates')fail('desk_result_invalid');
  const body={schema:'evercraft.findmypart.node002-desk-receipt.v1',node_id:NODE,workload_class:FINDMYPART_DESK_WORKLOAD,idempotency_key:idempotencyKey,source_tick:e.source_tick,source_digest:e.payload_digest,candidates:rows,contact_clearance:false,outreach_authorized:false,gmail_history_verified:false,interaction_ledger_verified:false,transport_authenticated:false,production_modified:false,private_customer_rows_exported:0,completed_at:new Date().toISOString()};
  return {...body,receipt_hash:hash(JSON.stringify(body))};
 }};
}
