// One-company next-action handoff from already-produced KAIDANCE receipts.
// Read-only reconciliation. No worker dispatch, network, merchant write, PR or social send.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';

const HASH=/^sha256:[a-f0-9]{64}$/;
const safeKey=/^[a-z0-9][a-z0-9-]{1,90}$/;
const hash=v=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
const SOURCE={
 worlds:{file:'kaidance-worlds-saban-review/latest.json',
  schema:'evercraft.kaidance.saban-world-review.v1'},
 candidate:{file:'kaidance-source-candidate/latest.json',
  schema:'evercraft.kaidance.code-improvement-beat.v1'},
 candidateProof:{file:'kaidance-source-candidate/candidate.json',
  schema:'evercraft.kaidance.source-repair-candidate.v1',timestamp_required:false},
 checkout:{file:'kaidance-offer-checkout/latest.json',
  schema:'evercraft.kaidance.offer-checkout-heartbeat.v1'},
 checkoutActions:{file:'kaidance-offer-checkout/actions.json',
  schema:'evercraft.payments.kaidance-heartbeat-actions.v1'}
};
const STATUS={fresh:'fresh',stale:'stale',missing:'missing',invalid:'invalid'};
const MAX_BYTES=256*1024,MAX_AGE_MS=15*60*1000;
function readSource(base,entry,now){
 const file=path.resolve(base,entry.file);
 try{
  const root=fs.realpathSync(base);
  const target=fs.realpathSync(file);
  if(!target.startsWith(root+path.sep)||
     fs.realpathSync(path.dirname(file))!==path.dirname(file))
   return {status:STATUS.invalid,reason:'untrusted_source_path'};
  const s=fs.lstatSync(file);
  if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)!==0||
     s.size>MAX_BYTES)return {status:STATUS.invalid,reason:'untrusted_receipt_file'};
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  if(data?.schema!==entry.schema)return {status:STATUS.invalid,reason:'schema_mismatch'};
  if(entry.timestamp_required!==false){
   const age=new Date(now).getTime()-Date.parse(data.observed_at);
   if(!Number.isFinite(age)||age< -60000||age>MAX_AGE_MS)
    return {status:STATUS.stale,reason:'receipt_not_current'};
  }
  return {status:STATUS.fresh,data};
 }catch(e){
  if(e?.code==='ENOENT')return {status:STATUS.missing,reason:'receipt_missing'};
  return {status:STATUS.invalid,reason:'receipt_unreadable'};
 }
}
function action(priority,work_key,lane_key,action_key,source,evidence_ref,authority){
 return {priority,work_key,lane_key,action_key,source,
  evidence_ref:evidence_ref||null,authority,dispatch_authorized:false};
}
function verifyCheckout(row,actions){
 if(row.status!=='fresh'||actions.status!=='fresh')return false;
 const a=actions.data,r=row.data;
 return a.candidate_count===a.actions?.length&&
   Array.isArray(a.actions)&&Array.isArray(a.proposed_checkout_placements)&&
   a.provider_write_authorized===false&&a.publisher_write_authorized===false&&
   r.changes_to_stripe_tax_settings===0&&r.sensitive_provider_data_exported===false&&
   a.observed_at===r.observed_at;
}
function verifyCandidate(row,proof){
 if(row.status!=='fresh'||proof.status!=='fresh')return false;
 const r=row.data,p=proof.data;
 return r.state==='candidate_proposed'&&r.red_green_proof===true&&
   HASH.test(r.candidate_digest||'')&&p.state==='candidate_proposed'&&
   p.candidate_digest===r.candidate_digest&&p.review_goal_key===r.current_review_goal&&
   p.red_green_proof?.postpatch_regression_passed===true&&
   p.red_green_proof?.prepatch_regression_failed===true&&
   p.red_green_proof?.tested_candidate_sha256===r.candidate_digest&&
   r.canonical_source_changes===0&&r.remote_prs_created===0&&
   p.publisher_authority_granted===false&&p.git_branch_created===false;
}
export function planKaidanceNextAction({
 now=new Date(),companyReport,companyQueue,sources={},previous=null
}={}){
 const at=new Date(now);
 if(!Number.isFinite(at.getTime()))throw Error('kaidance_next_action_clock_invalid');
 if(companyReport?.schema!=='evercraft.kaidance.company-heartbeat.v1'||
    companyQueue?.schema!=='evercraft.kaidance.company-heartbeat.queue.v1'||
    companyQueue.execution_authorized!==false)
  throw Error('kaidance_next_action_company_source_invalid');
 const observed=Date.parse(companyReport.observed_at);
 if(!Number.isFinite(observed)||Math.abs(at.getTime()-observed)>120000||
    companyQueue.observed_at!==companyReport.observed_at)
  throw Error('kaidance_next_action_company_clock_mismatch');
 const verified={};
 for(const key of Object.keys(SOURCE)){
  const v=sources[key];
  verified[key]=v?.status==='fresh'&&v.data?.schema===SOURCE[key].schema
   ?v:{status:v?.status==='stale'?'stale':
     v?.status==='invalid'?'invalid':'missing',reason:v?.reason||'not_observed'};
 }
 const choices=[];
 const sourceStatus=Object.fromEntries(Object.entries(verified)
  .map(([k,v])=>[k,v.status]));
 // Invalid trusted receipt families need reconciliation, never blind execution.
 for(const [key,value] of Object.entries(verified)){
  if(value.status==='invalid'){
   choices.push(action(0,'receipts:'+key+':investigate','systemia-core',
    'reconcile_untrusted_source_receipt',key,null,'existing_systemia_operator_review'));
  }
 }
 const checkout=verified.checkout,checkoutActions=verified.checkoutActions;
 if(checkout.status==='fresh'&&checkoutActions.status==='fresh'){
  if(!verifyCheckout(checkout,checkoutActions)){
   choices.push(action(0,'checkout:receipt-mismatch','revenue',
    'reconcile_checkout_receipt_mismatch','checkout',null,
    'existing_systemia_operator_review'));
  }else{
   const readiness=checkout.data.readiness;
   if(readiness==='exact_link_candidates_verified'&&
      checkoutActions.data.proposed_checkout_placements.length){
    choices.push(action(1,'checkout:verified-candidates','revenue',
     'review_exact_links_for_existing_authorized_clip_distribution','checkout',
     'source:kaidance-offer-checkout/actions.json','existing_clip_and_payments_policy'));
   }else if(readiness==='held_exact_link_review'){
    choices.push(action(1,'checkout:held-links','revenue',
     'resolve_merchant_and_exact_link_mismatch','checkout',
     'source:kaidance-offer-checkout/latest.json','existing_payments_review'));
   }else if(readiness==='awaiting_current_clip_promotion_receipt'){
    choices.push(action(2,'checkout:clip-promotion-needed','revenue',
     'qualify_and_promote_source_offer_via_existing_clip_policy','checkout',
     'source:kaidance-offer-checkout/actions.json','existing_clip_publisher_only'));
   }else if(readiness==='awaiting_owned_stripe_read_credentials'){
    choices.push(action(2,'checkout:private-provider-readback-needed','revenue',
     'provision_owner_private_readonly_merchant_binding','checkout',
     'source:kaidance-offer-checkout/latest.json','owner_private_config_only'));
   }
  }
 }
 const worlds=verified.worlds;
 if(worlds.status==='fresh'){
  const w=worlds.data;
  if(w.operator_reconciliation_required===true||w.local_readonly_completed!==true){
   choices.push(action(0,'worlds:goal-reconciliation','worlds',
    'reconcile_persisted_saban_goal_before_replay','worlds',
    HASH.test(w.source_fingerprint||'')?w.source_fingerprint:null,
    'existing_systemia_operator_review'));
  }
 }
 const candidate=verified.candidate,proof=verified.candidateProof;
 if(candidate.status==='fresh'){
  const c=candidate.data;
  if(c.state==='candidate_proposed'){
   if(!verifyCandidate(candidate,proof)){
    choices.push(action(0,'worlds:invalid-code-candidate','worlds',
     'reconcile_source_candidate_red_green_receipt','candidate',
     null,'existing_systemia_operator_review'));
   }else{
    choices.push(action(3,'worlds:signed-draft-pr-review','worlds',
     'prepare_exact_source_bound_signed_draft_pr_approval','candidate',
     c.candidate_digest,'signed_systemia_gate_required'));
   }
  }else if(typeof c.state==='string'&&c.state.startsWith('hold_')){
   choices.push(action(2,'worlds:source-candidate-hold','worlds',
    'inspect_source_repair_anchor_drift','candidate',null,
    'existing_systemia_operator_review'));
  }
 }
 // AIW source metadata changed or failed its bounded official-source probe.
 // This is a Systemia human-review handoff, never permission to ingest data,
 // update the map, alter Caddy, or publish an infrastructure safety claim.
 if(companyReport.infrastructure_watch?.status==='verified_receipt'){
  const aiw=companyQueue.candidates?.filter(x=>
   x?.lane_key==='infrastructure-watch'&&
   /^aiw:[a-z0-9-]+:source-(?:change|unverified)$/.test(x.work_key||'')&&
   ['review_official_source_metadata_change','investigate_official_source_reachability'].includes(x.action)&&
   x.authority==='systemia_operator_review_required'&&
   x.execution_authorized===false&&x.publication_authorized===false)||[];
  if(aiw.length){
   const first=[...aiw].sort((a,b)=>a.work_key.localeCompare(b.work_key))[0];
   choices.push(action(2,first.work_key,'infrastructure-watch',
    'review_american_infrastructure_watch_official_source_evidence','company',
    'source:systemia/infrastructure-watch/source-registry.v1.json',
    'existing_systemia_operator_review'));
  }
 }
 // Kaidance's existing revenue lane can nominate a sourced global notice.
 // This is research triage only. The final buyer/deadline/eligibility and
 // existing private Interaction Ledger / Passport permit stay separate.
 if(companyReport.global_opportunities?.status==='verified_source_receipt'){
  const global=companyQueue.candidates?.filter(x=>
   x?.lane_key==='revenue'&&
   /^global:worldbank:op[0-9]{6,10}$/.test(x.work_key||'')&&
   x.action==='verify_worldbank_notice_deadline_buyer_eligibility_and_delivery_fit'&&
   x.authority==='systemia_operator_review_required'&&
   x.execution_authorized===false&&x.outreach_authorized===false&&
   x.application_authorized===false&&x.payment_verified===false)||[];
  if(global.length){
   const first=[...global].sort((a,b)=>a.work_key.localeCompare(b.work_key))[0];
   choices.push(action(2,first.work_key,'revenue',
    'verify_global_contract_notice_and_independent_buyer_fit','company',
    'source:registry/kaidance-global-opportunity-sources.v1.json',
    'systemia_operator_review_required'));
  }
 }
 // Evercraft Network's existing source-bound Saban revival PR is reviewed by
 // the *same* company heartbeat. No auto-coding or network execution follows.
 if(companyReport.network_development?.status==='verified_receipt'){
  const rows=companyQueue.candidates?.filter(row=>
   row?.lane_key==='education-network'&&
   /^network:(ci_failed|ci_pending|field_gate_due|merged_needs_readback):[a-f0-9]{12}$/.test(row.work_key||'')&&
   ['investigate_failed_network_ci','reconcile_network_ci_run',
    'run_authorized_cross_device_encrypted_outage_test',
    'verify_owned_network_runtime_and_field_receipts'].includes(row.action)&&
   row.authority==='systemia_operator_review_required'&&
   row.source_authority==='github_rest_read_only'&&
   row.execution_authorized===false&&
   row.code_write_authorized===false&&row.production_mutation_authorized===false&&
   row.field_validated===false&&row.dispatch_authorized===false)||[];
  if(rows.length){
   const row=rows[0];
   choices.push(action(row.action==='investigate_failed_network_ci'?1:2,
    row.work_key,'education-network',row.action,'company',
    row.evidence_ref,'systemia_operator_review_required'));
  }
 }
 const unbound=companyQueue.candidates?.filter(x=>
  x?.action==='bind_existing_systemia_capability_or_admit_bounded_new_adapter'&&
  /^product:[a-z0-9-]+:adapter-admission$/.test(x.work_key||'')&&
  x.authority==='source_review_required')||[];
 if(unbound.length){
  const first=[...unbound].sort((a,b)=>a.work_key.localeCompare(b.work_key))[0];
  choices.push(action(4,first.work_key,'systemia-core',
   'review_unbound_product_lane_and_existing_capability','company',
   'source:registry/public-products.json','source_review_required'));
 }
 choices.sort((a,b)=>a.priority-b.priority||a.work_key.localeCompare(b.work_key));
 const selected=choices[0]||null;
 const stableDecision=hash({action:selected?.work_key||'none',
  action_key:selected?.action_key||'none',evidence:selected?.evidence_ref||null,
  authority:selected?.authority||'none'});
 const changed=previous?.schema==='evercraft.kaidance.next-action-state.v1'&&
   previous.decision_ref===stableDecision?0:1;
 const held=selected?.priority===0?1:0;
 const report={schema:'evercraft.kaidance.next-action.v1',
  observed_at:at.toISOString(),
  status:selected?held?'requires_reconciliation':'handoff_candidate':'no_verified_next_action',
  current_next_action:selected,
  candidate_count:choices.length,candidates:choices.slice(0,10),
  source_status:sourceStatus,decision_ref:stableDecision,
  execution_performed:false,adapter_dispatched:false,
  checkout_mutations:0,publication_actions:0,customer_contacts:0,
  code_changes:0,provider_receipt_independently_refetched:false,
  source_trust:'existing_local_receipts_not_independent_provider_attestation'};
 const state={schema:'evercraft.kaidance.next-action-state.v1',
  decision_ref:stableDecision,observed_at:report.observed_at};
 const snapshot={schema:'evercraft.kaidance.mission-snapshot.v1',
  snapshot_ref:hash({decision_ref:stableDecision,changed,held}),
  observed_at:report.observed_at,
  counts:{scanned:1+Object.keys(SOURCE).length,changed:Math.max(changed,held),admitted:0,held},
  evidence_refs:[stableDecision,selected?.evidence_ref].filter(Boolean)};
 return {report,state,snapshot};
}
function atomicJson(file,value){
 const dir=path.dirname(file);
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 if(fs.lstatSync(dir).isSymbolicLink()||
    fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())
  throw Error('kaidance_next_action_private_path_symlink');
 const temp=file+'.'+process.pid+'.'+randomBytes(6).toString('hex')+'.tmp';
 try{fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
 fs.renameSync(temp,file)}
 finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
}
export function writeKaidanceNextAction({
 outDir,companyReport,companyQueue,now=new Date()
}={}){
 if(!outDir||!path.isAbsolute(outDir))throw Error('kaidance_next_action_absolute_output_required');
 const dir=path.resolve(outDir),parent=path.dirname(dir),sources={};
 // Only the canonical sibling layout is a valid source root. A random
 // temporary output path must not inspect unrelated adjacent private files.
 const expectedLayout=path.basename(dir)==='kaidance-company-heartbeat';
 for(const [name,entry] of Object.entries(SOURCE)){
  sources[name]=expectedLayout?readSource(parent,entry,now):
   {status:STATUS.missing,reason:'canonical_sibling_layout_not_configured'};
 }
 const stateFile=path.join(dir,'next-action-state.json');
 let previous=null;
 if(fs.existsSync(stateFile)){
  const stat=fs.lstatSync(stateFile);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)
   throw Error('kaidance_next_action_state_untrusted');
  previous=JSON.parse(fs.readFileSync(stateFile,'utf8'));
  if(previous.schema!=='evercraft.kaidance.next-action-state.v1')
   throw Error('kaidance_next_action_state_schema_invalid');
 }
 const {report,state,snapshot}=planKaidanceNextAction({
  now,companyReport,companyQueue,sources,previous});
 atomicJson(path.join(dir,'next-action.json'),report);
 atomicJson(path.join(dir,'next-action-mission-snapshot.json'),snapshot);
 atomicJson(stateFile,state);
 return {report,snapshot};
}
