import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildCrmHeartbeat,INPUT_SCHEMA} from './heartbeat.mjs';

const MODES=new Set(['paused','manual_review_only','preflight_eligible']);
const KINDS=new Set(['prospect','customer','partner','operator','vendor','collaborator','other']);
const EVENT_TYPES=new Set(['interest_expressed','contact_window_requested','contact_window_acknowledged','meeting_discussed','meeting_scheduled','meeting_held','work_in_progress','payment_processing_reported','payment_verified','followup_requested','followup_completed','no_contact_requested','relationship_changed','issue_opened','issue_resolved','note']);
const sha=(value)=>'sha256:'+createHash('sha256').update(value).digest('hex');
const req=(v,name)=>{if(typeof v!=='string'||!v.trim())throw Error(name+'_invalid');return v.trim()};
const ms=(v,name)=>{const n=Date.parse(req(v,name));if(!Number.isFinite(n))throw Error(name+'_invalid');return n};
const MAX_ROWS=10000;

export function validateRelationshipRecord(r,{now=new Date()}={}) {
  if(!r || typeof r!=='object'||Array.isArray(r))throw Error('relationship_invalid');
  if(r.schema!=='evercraft.crm.relationship.v1')throw Error('relationship_schema_invalid');
  for(const k of ['relationship_ref','subject_ref','division_id','stage','source_ref','observed_at'])req(r[k],k);
  if(!KINDS.has(r.kind))throw Error('relationship_kind_invalid');
  if(!MODES.has(r.outbound_policy))throw Error('relationship_outbound_policy_invalid');
  if(!Array.isArray(r.allowed_purposes)||r.allowed_purposes.length>32||new Set(r.allowed_purposes).size!==r.allowed_purposes.length)throw Error('relationship_purposes_invalid');
  for(const p of r.allowed_purposes)if(!/^[a-z][a-z0-9_.-]{1,80}$/.test(p))throw Error('relationship_purpose_invalid');
  if(ms(r.observed_at,'observed_at')>now.getTime()+120000)throw Error('relationship_future_state');
  if(r.not_before!=null)ms(r.not_before,'not_before');
  if(r.next_review_at!=null)ms(r.next_review_at,'next_review_at');
  const nextState=r.next_action_state||'open';
  if(!['open','snoozed','completed','cancelled'].includes(nextState))throw Error('relationship_next_action_state_invalid');
  // Closing a follow-up is a recorded fact, not an inference from time passing.
  if(nextState==='completed'||nextState==='cancelled') {
    req(r.next_action_evidence_ref,'next_action_evidence_ref');
    if(ms(r.next_action_decided_at,'next_action_decided_at')>now.getTime()+120000)
      throw Error('relationship_next_action_future_decision');
  }
  if(!Array.isArray(r.timeline)||r.timeline.length>2000)throw Error('relationship_timeline_invalid');
  const ids=new Set();
  for(const e of r.timeline) {
    const id=req(e?.event_ref,'event_ref');
    if(ids.has(id))throw Error('relationship_event_duplicate');ids.add(id);
    if(!EVENT_TYPES.has(e.type))throw Error('relationship_event_type_invalid');
    req(e.evidence_ref,'evidence_ref');
    if(ms(e.occurred_at,'occurred_at')>now.getTime()+120000)throw Error('relationship_future_event');
  }
  // A claimed right to message is never created by a record, even if preflight_eligible.
  if(r.outbound_policy==='preflight_eligible'&&r.allowed_purposes.length===0)throw Error('relationship_unscoped_eligibility');
  return r;
}
function loadJsonPrivate(file,{maxBytes=5*1024*1024}={}) {
  const dir=path.dirname(path.resolve(file));
  const d=fs.lstatSync(dir);
  if(!d.isDirectory()||d.isSymbolicLink()||(process.platform!=='win32'&&(d.mode&0o077)!==0))throw Error('relationship_dir_unsafe');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  try{
    const st=fs.fstatSync(fd);
    if(!st.isFile()||(process.platform!=='win32'&&(st.mode&0o077)!==0))throw Error('relationship_file_unsafe');
    if(st.size>maxBytes)throw Error('relationship_file_oversize');
    return JSON.parse(fs.readFileSync(fd,'utf8'));
  }finally{fs.closeSync(fd);}
}
export function readPrivateRelationships(file,{now=new Date()}={}) {
  const ledger=loadJsonPrivate(file);
  if(ledger?.schema!=='evercraft.crm.relationship-ledger.v1'||ledger.tenant_id!=='evercraft')throw Error('relationship_ledger_schema_invalid');
  req(ledger.revision,'relationship_revision');
  if(!Array.isArray(ledger.records)||ledger.records.length>MAX_ROWS)throw Error('relationship_ledger_records_invalid');
  const refs=new Set();
  const records=ledger.records.map(r=>{
    validateRelationshipRecord(r,{now});
    if(refs.has(r.relationship_ref))throw Error('relationship_duplicate');
    refs.add(r.relationship_ref);
    return r;
  });
  return {...ledger,records};
}

/** This check MUST precede Passport + Interaction Ledger preflight, which are still separately mandatory. */
export function preflightRelationshipIntent({ledger,subjectRef,divisionId,purpose,at=new Date()}={}) {
  const subject=req(subjectRef,'subject_ref'),division=req(divisionId,'division_id'),intent=req(purpose,'purpose');
  if(!ledger||ledger.schema!=='evercraft.crm.relationship-ledger.v1'||ledger.tenant_id!=='evercraft')throw Error('relationship_ledger_invalid');
  const atMs=at instanceof Date?at.getTime():ms(at,'at');
  if(!Number.isFinite(atMs))throw Error('at_invalid');
  const records=(ledger.records||[]).filter(r=>r.subject_ref===subject&&r.division_id===division);
  if(records.length!==1)return {decision:'deny',reasons:[records.length?'relationship_ambiguous':'relationship_missing'],
    passport_preflight_required:true,send_performed:false};
  const record=validateRelationshipRecord(records[0],{now:new Date(atMs)});
  const reasons=[];
  if(record.outbound_policy==='paused')reasons.push('relationship_contact_paused');
  if(record.outbound_policy==='manual_review_only')reasons.push('relationship_human_review_required');
  if(record.not_before&&atMs<ms(record.not_before,'not_before'))reasons.push('relationship_contact_window_not_open');
  if(!record.allowed_purposes.includes(intent))reasons.push('relationship_purpose_not_approved');
  if(record.timeline.some(e=>e.type==='no_contact_requested')&&record.outbound_policy!=='paused')reasons.push('relationship_optout_requires_review');
  // Do not let another division treat the same party as a new prospect after
  // a no-contact request was recorded anywhere in this company tenant.
  if((ledger.records||[]).some(r=>r.subject_ref===subject&&
      Array.isArray(r.timeline)&&r.timeline.some(e=>e.type==='no_contact_requested')))
    reasons.push('subject_no_contact_hold_across_divisions');
  return {decision:reasons.length?'deny':'allow_to_existing_preflight',reasons,
    relationship_state:record.stage,relationship_kind:record.kind,
    passport_preflight_required:true,send_performed:false,
    // No subject, relationship ID, source refs, or timeline contents in the receipt.
  };
}

/** Only an authorized private caller may apply this to a real outbound action. */
export function preflightGovernedContact({ledger,interactionLedger,input,now=new Date()}={}) {
  const context=preflightRelationshipIntent({ledger,subjectRef:input?.subject_ref,
    divisionId:input?.division_id,purpose:input?.purpose,at:now});
  if(context.decision!=='allow_to_existing_preflight')return {...context,interaction_preflight_ran:false};
  if(!interactionLedger||typeof interactionLedger.preflightContact!=='function')
    return {decision:'deny',reasons:['interaction_ledger_unavailable'],send_performed:false};
  const result=interactionLedger.preflightContact({...input,at:now.toISOString()});
  return {decision:result.decision==='allow'?'allow_to_provider_checks':'deny',
    reasons:result.reasons||[],interaction_preflight_ran:true,
    passport_preflight_required:true,send_performed:false};
}

/** Review signals only, NEVER outreach actions. Identifiers stay private. */
export function projectRelationshipReview(ledger,{now=new Date()}={}) {
  const records=ledger.records||[];
  const signals=records.filter(r=>(r.next_action_state||'open')!=='completed'&&(r.next_action_state||'open')!=='cancelled'&&r.next_review_at&&ms(r.next_review_at,'next_review_at')<=now.getTime())
    .map(r=>({signal_key:sha('relationship-review:'+r.relationship_ref),
      domain:'relationships',kind:'partner_followup',state:'held',severity:'normal',
      evidence_state:'reported',observed_at:r.observed_at,due_at:r.next_review_at}));
  return {
    schema:INPUT_SCHEMA,tenant_id:'evercraft',generated_at:now.toISOString(),
    source_revision:'relationship:'+sha(ledger.revision),
    connectors:[{source_key:'private-relationship-ledger',state:'current',
      checked_at:now.toISOString(),evidence_ref:'private-review-watermark:'+sha(ledger.revision).slice(7,31)}],
    signals
  };
}
