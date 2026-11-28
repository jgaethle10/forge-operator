#!/usr/bin/env node
// A source-bound, bounded company heartbeat lane. This does not grant code-write
// authority, send outreach, deploy software, or forge a production Kaidance pulse.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {planCompanyHeartbeat,validateCompanyLanes} from './kaidance-company-heartbeat.mjs';
import {researchCycle} from '../evermaps/cemetery/research-cycle.mjs';
import {classifyNext} from '../evermaps/cemetery/source-classification.mjs';
import {writeKaidanceNextAction} from './kaidance-next-action.mjs';
import {runGlobalOpportunityScout} from './kaidance-global-opportunity-scout.mjs';
import {runKaidanceCreativeDevelopment} from './kaidance-creative-development.mjs';
import {runLearningCommunityCycle} from './kaidance-learning-community-cycle.mjs';
import {runAirCoreDevelopmentCycle} from './kaidance-aircore-development.mjs';
import {runPrivateResearchContinuity} from './kaidance-rd-continuity.mjs';
import {reviewKaidanceExternalSkills} from './kaidance-external-skill-intake.mjs';
const sourceRoot=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const sha=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'))}
function atomicJson(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 if(fs.lstatSync(path.dirname(file)).isSymbolicLink())throw Error('company_output_symlink_refused');
 if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('company_output_file_symlink_refused');
 const temp=file+'.'+process.pid+'.'+randomBytes(5).toString('hex')+'.tmp';
 try{fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(temp,file)}
 finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
}
export function sourceFingerprint(root,files){
 const hash=createHash('sha256');
 for(const file of [...files].sort()){
  if(!/^(?:public\/worlds|tests)\/[a-z0-9./-]+$/.test(file)||file.includes('..'))throw Error('untrusted_company_source_path');
  const full=path.join(root,file);
  if(fs.lstatSync(full).isSymbolicLink())throw Error('company_source_symlink_refused');
  hash.update(file+'\0');hash.update(fs.readFileSync(full));hash.update('\0');
 }
 return 'sha256:'+hash.digest('hex');
}
function countWorkflowManifests(root,max=30000){
 let files=0,count=0;
 function walk(dir,depth=0){
  if(depth>7)return;
  for(const item of fs.readdirSync(dir,{withFileTypes:true})){
   if(++files>max)throw Error('company_workflow_inventory_budget_exceeded');
   if(item.isSymbolicLink())continue;
   const abs=path.join(dir,item.name);
   if(item.isDirectory())walk(abs,depth+1);
   else if(item.isFile()&&item.name.endsWith('.workflow.json'))count++;
  }
 }
 walk(path.join(root,'systemia'));
 return count;
}
// Only a bounded, dated source-observation receipt can enter the company
// heartbeat. Receipt data is not publication permission or a live hazard claim.
export function classifyAiWReceipt(value,now=new Date()){
 if(!value)return {status:'not_connected',review_candidates:[],sources_observed:0};
 if(value.schema!=='evercraft.aiw.evidence-watch.v1'||
    value.project_key!=='american-infrastructure-watch'||
    value.source_authority!=='fhwa_official_public_only'||
    value.no_auto_approval!==true||
    value.no_public_data_mutation!==true||
    value.production_changes!==0||value.publications_authorized!==0||
    value.ingested_bridge_records!==0||
    !Array.isArray(value.sources)||value.sources.length>8||
    !Array.isArray(value.review_candidates)||value.review_candidates.length>8)
  return {status:'invalid',review_candidates:[],sources_observed:0};
 const age=new Date(now).getTime()-Date.parse(value.observed_at);
 if(!Number.isFinite(age)||age< -60000||age>48*3600*1000)
  return {status:'stale',review_candidates:[],sources_observed:0};
 const validCandidates=value.review_candidates.every(x=>
  typeof x.key==='string'&&/^aiw:[a-z0-9-]+:source-(?:change|unverified)$/.test(x.key)&&
  typeof x.source_key==='string'&&
  x.approval_required===true&&x.publication_authorized===false);
 if(!validCandidates)return {status:'invalid',review_candidates:[],sources_observed:0};
 return {status:'verified_receipt',last_observed_at:value.observed_at,
  source_state:value.status,review_candidates:value.review_candidates,
  sources_observed:value.sources.length,
  changed_source_keys:value.changed_source_keys||[],
  unverified_source_keys:value.unverified_source_keys||[],
  publication_authorized:false};
}
export function classifyGlobalOpportunityReceipt(value,now=new Date()){
 if(!value)return {status:'not_connected',review_candidates:[],sources_observed:0};
 if(value.schema!=='evercraft.kaidance.global-opportunity-scout.v1'||
    value.heartbeat_seconds!==300||
    !['fetched','cooldown','stale','held_source_error'].includes(value.status)||
    value.authority?.source_metadata_only!==true||
    value.authority?.systemia_review_required!==true||
    value.authority?.real_buyer_verified!==false||
    value.authority?.contract_eligibility_verified!==false||
    value.authority?.outreach_authorized!==false||
    value.authority?.bid_or_application_authorized!==false||
    value.authority?.payment_authorized!==false||
    value.authority?.production_mutations!==0||
    !Array.isArray(value.review_candidates)||value.review_candidates.length>12||
    typeof value.receipt_hash!=='string'||
    value.receipt_hash!==sha(JSON.stringify({...value,receipt_hash:null})))
   return {status:'invalid',review_candidates:[],sources_observed:0};
 const clock=+new Date(now),age=clock-Date.parse(value.observed_at);
 if(!Number.isFinite(age)||age< -60000||age>15*60000)
   return {status:'stale',review_candidates:[],sources_observed:0};
 if(value.status==='stale'||value.status==='held_source_error')
   return {status:value.status,review_candidates:[],sources_observed:0};
 const sourceAge=clock-Date.parse(value.last_source_checked_at||'');
 if(!Number.isFinite(sourceAge)||sourceAge< -60000||sourceAge>24*3600000)
  return {status:'stale',review_candidates:[],sources_observed:0};
 const accepted=new Set(['faie','evermaps','evercraft-research','evercraft-remote-ops','site-survive']);
 const valid=value.review_candidates.every(row=>
   /^global:worldbank:op[0-9]{6,10}$/.test(row?.work_key||'')&&
   /^https:\/\/projects\.worldbank\.org\/en\/projects-operations\/procurement-detail\/OP[0-9]{6,10}$/.test(row?.source_url||'')&&
   typeof row.country==='string'&&row.country.length<=100&&
   typeof row.title==='string'&&row.title.length<=220&&
   Array.isArray(row.fit_offer_keys)&&row.fit_offer_keys.length>0&&
   row.fit_offer_keys.every(x=>accepted.has(x))&&
   row.contract_eligibility==='unverified'&&
   row.deadline_status==='verify_on_official_notice'&&row.deadline_at===null&&
   row.revenue_usd===null&&row.outreach_authorized===false&&
   row.application_authorized===false&&row.payment_verified===false);
 if(!valid)return {status:'invalid',review_candidates:[],sources_observed:0};
 return {status:'verified_source_receipt',review_candidates:value.review_candidates,
  sources_observed:value.source_request_performed?Number(value.source_rows_observed||0):0,
  newly_seen:value.new_candidate_count||0,last_source_checked_at:value.last_source_checked_at,
  last_source_state:value.status,receipt_hash:value.receipt_hash,
  outreach_authorized:false,payment_verified:false};
}
// Authenticated, bounded GitHub source report from Kaidance's own Network PR
// observer. A CI pass or a source commit is never a physical outage receipt.
export function classifyNetworkDevelopmentReceipt(v,now=new Date()){
 const empty={status:'not_connected',review_candidates:[],newly_seen:0};
 if(!v)return empty;
 const accepted=new Set(['ci_failed','ci_pending','field_gate_due','merged_needs_readback','held_source']);
 const allowed={
  ci_failed:'investigate_failed_network_ci',
  ci_pending:'reconcile_network_ci_run',
  field_gate_due:'run_authorized_cross_device_encrypted_outage_test',
  merged_needs_readback:'verify_owned_network_runtime_and_field_receipts',
  held_source:'reconcile_network_pr_source'
 };
 const age=+new Date(now)-Date.parse(v.observed_at);
 if(!Number.isFinite(age)||age< -60000||age>15*60000)return {...empty,status:'stale'};
 const valid=v.schema==='evercraft.kaidance.network-development.v1'&&
  v.repo==='jgaethle10/forge-operator'&&v.pr_number===2240&&
  v.heartbeat_seconds===300&&accepted.has(v.phase)&&
  v.source_reference==='github:jgaethle10/forge-operator:pull:2240'&&
  v.worker_dispatched===false&&v.code_changes===0&&v.automatic_pr_writes===0&&
  v.production_deployments===0&&v.carrier_contacts===0&&
  v.operator_review_required===true&&v.field_validation_verified===false&&
  v.encrypted_two_host_delivery_verified===false&&v.real_wan_outage_verified===false&&
  /^sha256:[a-f0-9]{64}$/.test(v.decision_ref||'')&&
  v.receipt_hash===sha(JSON.stringify({...v,receipt_hash:null}))&&
  (v.head_sha===null||/^[a-f0-9]{40}$/.test(v.head_sha))&&
  (v.source_authority==='github_rest_read_only'||v.source_authority==='not_connected')&&
  Array.isArray(v.checks)&&v.checks.length<=2&&
  v.checks.every(x=>['Network Saban Offline Resilience Tests','Forge checks'].includes(x.name)&&
   ['success','failed','held','pending'].includes(x.status))&&
  v.candidate?.lane_key==='education-network'&&
  v.candidate?.work_key==='network:'+v.phase+':'+(v.head_sha?v.head_sha.slice(0,12):'unverified')&&
  v.candidate?.action===allowed[v.phase]&&
  v.candidate?.execution_authorized===false&&
  v.candidate?.code_write_authorized===false&&
  v.candidate?.production_mutation_authorized===false&&
  v.candidate?.field_validated===false&&
  [0,1].includes(v.newly_seen);
 if(!valid)return {...empty,status:'invalid'};
 if(v.source_authority!=='github_rest_read_only'||v.phase==='held_source')
  return {...empty,status:'held_source'};
 return {status:'verified_receipt',phase:v.phase,head_sha:v.head_sha,
  decision_ref:v.decision_ref,last_observed_at:v.observed_at,
  newly_seen:v.newly_seen,review_candidates:[v.candidate],
  field_validation_verified:false,execution_authorized:false};
}
function readAiWReceipt(file){
 if(!file)return null;
 const abs=path.resolve(file),dir=path.dirname(abs);
 if(!fs.existsSync(abs))return null;
 if(fs.lstatSync(abs).isSymbolicLink()||fs.lstatSync(dir).isSymbolicLink())throw Error('aiw_receipt_symlink_refused');
 const stats=fs.statSync(abs);
 if(!stats.isFile()||stats.size>256000)throw Error('aiw_receipt_invalid_file');
 return JSON.parse(fs.readFileSync(abs,'utf8'));
}
export function runCompanyHeartbeat({
 root=sourceRoot,outDir=path.join(sourceRoot,'artifacts/kaidance-company-heartbeat'),
 now=new Date(),proveWorlds=false,proveLearning=false,proveAirCore=false,
 learningCycle=runLearningCommunityCycle,aircoreCycle=runAirCoreDevelopmentCycle,
 spawn=spawnSync,aiwReceipt=null,globalOpportunityReceipt=null,networkDevelopmentReceipt=null,rdContinuityEnabled=false
}={}){
 const repo=path.resolve(root),out=path.resolve(outDir);
 const manifest=readJson(path.join(repo,'registry/kaidance-company-lanes.v1.json'));
 const products=readJson(path.join(repo,'registry/public-products.json'));
 const supervisor=readJson(path.join(repo,'systemia/core/resident-services.json'));
 validateCompanyLanes(manifest,products,supervisor);
 const statePath=path.join(out,'state.json');
 const previous=fs.existsSync(statePath)?readJson(statePath):null;
 const tick=Math.floor(new Date(now).getTime()/300000);
 if(previous&&previous.tick===tick)return {duplicate:true,tick,executed:false,reason:'heartbeat_tick_already_recorded'};
 if(previous&&previous.tick>tick)throw Error('company_clock_rollback');
 const worlds=manifest.lanes.find(x=>x.lane_key==='worlds');
 const fingerprint=sourceFingerprint(repo,worlds.source_files);
 const lastVerified=previous?.worlds_last_verified_at?Date.parse(previous.worlds_last_verified_at):0;
 const expired=!Number.isFinite(lastVerified)||new Date(now).getTime()-lastVerified>=worlds.proof_expiry_seconds*1000;
 const due=previous?.worlds_last_verified_fingerprint!==fingerprint||expired;
 let proof={status:due?'due_not_executed':'fresh_prior_evidence',executed:false,scope:'worlds_read_only_source_contracts'};
 if(due&&proveWorlds){
  const result=spawn(process.execPath,['--test',...worlds.proof_tests],{
   cwd:repo,encoding:'utf8',timeout:30000,maxBuffer:65536,
   env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:process.env.HOME||os.homedir()}
  });
  proof={status:result.status===0&&!result.error?'passed':'failed',executed:true,
   scope:'worlds_read_only_source_contracts',exit_code:Number.isInteger(result.status)?result.status:null,
   timeout:result.error?.code==='ETIMEDOUT',output_persisted:false};
 }
 // The same five-minute company clock owns a bounded learning/community
 // source ledger. No new scheduler, code writer, private data or publication.
 let learning=null;
 try{
  learning=learningCycle({root:repo,outDir:path.join(out,'learning-community'),
   now,runProofs:proveLearning===true,spawn});
 }catch(error){
  const raw=String(error?.message||'');
  learning={held:true,reason:/^learning_[a-z0-9_]+$/.test(raw)?raw:'learning_cycle_held',
   report:null,queue:null};
 }
 // AirCore is an unpublished product-engineering stream. Advance its bounded
 // source evidence on the existing company clock; never fabricate a bench test.
 let aircore=null;
 try{
  aircore=aircoreCycle({root:repo,outDir:path.join(out,'aircore-development'),
   now,runProofs:proveAirCore===true,spawn});
 }catch(error){
  const raw=String(error?.message||'');
  aircore={held:true,reason:/^aircore_[a-z0-9_]+$/.test(raw)?raw:'aircore_cycle_held',
   report:null,queue:null};
 }
 const planned=planCompanyHeartbeat({manifest,products,supervisor,previous,now,
  worldsFingerprint:fingerprint,proof,workflowManifestCount:countWorkflowManifests(repo)});
 const aiw=classifyAiWReceipt(aiwReceipt,now);
 const global=classifyGlobalOpportunityReceipt(globalOpportunityReceipt,now);
 const network=classifyNetworkDevelopmentReceipt(networkDevelopmentReceipt,now);
 const learningSummary=learning?.report?{
  state:'source_reconciled',tracked:learning.report.counts.tracked,
  source_proofs_run:learning.report.counts.source_proofs_run,
  passed:learning.report.counts.passed,
  failed:learning.report.counts.failed,
  development_review_count:learning.report.counts.needing_development_review,
  publication_authorized:false,autonomous_code_writes:0,
  child_or_member_data_access:false,
  execution_receipt_ref:learning.report_ref,
  authority:'existing_kaidance_heartbeat'
 }:{
  state:learning?.held?'held':learning?.duplicate?'duplicate_tick':'not_executed',
  reason:learning?.reason||null,
  tracked:0,source_proofs_run:0,passed:0,failed:0,
  publication_authorized:false,autonomous_code_writes:0,
  child_or_member_data_access:false
 };
 const aircoreSummary=aircore?.report?{
  state:'source_reconciled',mission_key:aircore.report.mission_key,
  source_status:aircore.report.source_status,
  source_fingerprint:aircore.report.source_fingerprint,
  source_proof_executed_this_tick:aircore.report.proof_executed_this_tick,
  physical_prototype_built:false,measured_cadr_cfm:null,
  worker_dispatched:false,partnership_outreach_authorized:false,
  execution_receipt_ref:aircore.receipt_ref
 }:{state:aircore?.held?'held':'not_executed',reason:aircore?.reason||null,
  physical_prototype_built:false,worker_dispatched:false};
 const researchContinuity=runPrivateResearchContinuity({enabled:rdContinuityEnabled,root:repo,outDir:out,now});
 // Existing 300-second company pulse observes only source metadata; no skill is run.
 const externalSkills=reviewKaidanceExternalSkills({root:repo,now});
 const report={...planned.report,proof,infrastructure_watch:aiw,
  research_continuity:researchContinuity,external_skill_intake:externalSkills,
  global_opportunities:global,network_development:network,
  learning_community:learningSummary,aircore_development:aircoreSummary};
 const queue={schema:'evercraft.kaidance.company-heartbeat.queue.v1',observed_at:report.observed_at,
  execution_authorized:false,
  candidates:[
   ...(proof.status==='failed'?[{work_key:'worlds:source-proof-failure',lane_key:'worlds',priority:1,action:'investigate_failed_source_tests',authority:'review_required'}]:[]),
   ...(proof.status==='due_not_executed'?[{work_key:'worlds:source-proof-due',lane_key:'worlds',priority:2,action:'run_bounded_source_proof',authority:'existing_allowlisted_local_only'}]:[]),
   ...aiw.review_candidates.map(row=>({work_key:row.key,lane_key:'infrastructure-watch',priority:2,
    action:row.action,authority:'systemia_operator_review_required',
    execution_authorized:false,publication_authorized:false})),
   ...network.review_candidates.map(row=>({...row,
    evidence_ref:'source:github:pull:2240:'+network.head_sha,
    source_authority:'github_rest_read_only',dispatch_authorized:false})),
   ...global.review_candidates.slice(0,8).map(row=>({
    work_key:row.work_key,lane_key:'revenue',priority:2,
    action:'verify_worldbank_notice_deadline_buyer_eligibility_and_delivery_fit',
    source_url:row.source_url,country:row.country,offer_keys:row.fit_offer_keys,
    authority:'systemia_operator_review_required',execution_authorized:false,
    outreach_authorized:false,application_authorized:false,payment_verified:false
   })),
   ...(learning?.queue?.candidates||[]).map(row=>({
    ...row,execution_authorized:false,release_authorized:false,
    authority:'systemia_goal_review_required'
   })),
   ...(aircore?.queue?.candidates||[]).map(row=>({
    ...row,execution_authorized:false,hardware_purchase_authorized:false,
    partner_contact_authorized:false,authority:'systemia_operator_review_required'
   })),
   ...externalSkills.review_candidates.map(row=>({...row,dispatch_authorized:false})),
   ...report.company_portfolio.products_not_yet_named.slice(0,12).map(key=>({
    work_key:'product:'+key+':adapter-admission',lane_key:null,priority:3,
    action:'bind_existing_systemia_capability_or_admit_bounded_new_adapter',authority:'source_review_required'
   }))
  ],
  no_remote_work_dispatched:true,no_code_changes_made:true};
 const snapshot={...planned.snapshot,
  counts:{...planned.snapshot.counts,
   scanned:planned.snapshot.counts.scanned+aiw.sources_observed+global.sources_observed+(network.status==='verified_receipt'?1:0)+(learning?.report?.counts?.tracked||0)+(aircore?.report?1:0)+externalSkills.candidate_count+externalSkills.technology_candidate_count,
   changed:planned.snapshot.counts.changed+(global.newly_seen||0)+(network.newly_seen||0)+(aircore?.report?.newly_seen||0),
   held:planned.snapshot.counts.held+externalSkills.quarantined+externalSkills.technology_quarantined+aiw.review_candidates.length+global.review_candidates.length+network.review_candidates.length+(learning?.report?.counts?.failed||0)+
    (aircore?.held||['source_proof_failed','missing_source_hold'].includes(aircore?.report?.source_status)?1:0)},
  evidence_refs:[
    ...planned.snapshot.evidence_refs,
    ...(learning?.report_ref?['source:registry/kaidance-learning-community-workstreams.v1.json',learning.report_ref]:[]),
    ...(aircore?.receipt_ref?['source:registry/kaidance-aircore-development.v1.json',aircore.receipt_ref]:[]),
    ...(aiw.status==='verified_receipt'?[
      'source:systemia/infrastructure-watch/source-registry.v1.json',sha(JSON.stringify(aiw))]:[]),
    ...(global.status==='verified_source_receipt'?[
      'source:registry/kaidance-global-opportunity-sources.v1.json',global.receipt_hash]:[]),
    ...(network.status==='verified_receipt'?[
      'source:registry/kaidance-network-development.v1.json',network.decision_ref]:[]),
    ...(externalSkills.source_fingerprint?[
      'source:systemia/saban/external-skill-candidates.json',externalSkills.source_fingerprint]:[])
  ].slice(0,30)};
 fs.mkdirSync(out,{recursive:true,mode:0o700});
 // Commit the cycle watermark LAST. An interrupted write must be retryable
 // without falsely reporting a completed tick with missing evidence receipts.
 atomicJson(path.join(out,'latest.json'),report);
 atomicJson(path.join(out,'queue.json'),queue);
 atomicJson(path.join(out,'mission-snapshot.json'),snapshot);
 // Read-only next-step reconciliation uses already-written prior/sibling
 // receipts. No external effects or second scheduler. State watermark stays last.
 const next=writeKaidanceNextAction({outDir:out,companyReport:report,companyQueue:queue,now});
 atomicJson(statePath,planned.state);
 return {duplicate:false,tick,executed:true,report,queue,
  next_action:next.report,mission_snapshot:snapshot,
  receipt_ref:sha(JSON.stringify(snapshot))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const opt=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:''};
 try{
  const outDir=opt('--out')||process.env.SYSTEMIA_COMPANY_HEARTBEAT_OUT_DIR||path.join(sourceRoot,'artifacts/kaidance-company-heartbeat');
  const aiwReceipt=readAiWReceipt(opt('--aiw-receipt')||process.env.SYSTEMIA_AIW_EVIDENCE_RECEIPT_FILE||'');
  const networkDevelopmentReceipt=readAiWReceipt(opt('--network-development-receipt')||process.env.SYSTEMIA_NETWORK_DEVELOPMENT_RECEIPT_FILE||'');
  let globalOpportunityReceipt=null;
  try{
   const globalOut=path.join(path.dirname(path.resolve(outDir)),'kaidance-global-opportunities');
   const globalPulse=await runGlobalOpportunityScout({outDir:globalOut});
   globalOpportunityReceipt=globalPulse.report;
  }catch(e){
   // Source failure never prevents the existing company pulse. No stale
   // opportunity enters the Systemia review queue on failed validation.
   console.error(JSON.stringify({schema:'evercraft.kaidance.global-opportunity-hold.v1',
    status:'held',reason:String(e?.message||e).slice(0,120)}));
  }
  const result=runCompanyHeartbeat({outDir,proveWorlds:process.argv.includes('--prove-worlds'),
    proveLearning:process.argv.includes('--prove-learning')||process.env.SYSTEMIA_KAIDANCE_LEARNING_SOURCE_PROOFS==='true',
    proveAirCore:process.argv.includes('--prove-aircore')||process.env.SYSTEMIA_KAIDANCE_AIRCORE_SOURCE_PROOFS==='true',
    aiwReceipt,globalOpportunityReceipt,networkDevelopmentReceipt,
    rdContinuityEnabled:process.env.SYSTEMIA_KAIDANCE_RD_CONTINUITY_ENABLED==='true'});
  // The same company heartbeat owns Leiland + visual art-direction review.
  // This is not another scheduler or a remote code-generation worker.
  let creative={status:'held',reviewed_this_tick:0};
  try{
   const creativeOut=path.join(path.dirname(path.resolve(outDir)),'kaidance-creative-development');
   const cycle=await runKaidanceCreativeDevelopment({root:sourceRoot,outDir:creativeOut});
   creative={status:cycle.duplicate?'duplicate':'reconciled',
    reviewed_this_tick:cycle.report?.source_review_completed_this_tick||0,
    held_projects:cycle.report?.held_projects||0,
    snapshot_written:!cycle.duplicate};
  }catch(error){
   console.error(JSON.stringify({schema:'evercraft.kaidance.creative-hold.v1',
    status:'held',reason:String(error?.message||error).slice(0,120),
    new_code_changes:0,publication_authorized:false}));
  }
  // Explicit owner opt-in only; CI and existing installations default off.
  let cemetery=null, cemeteryClassification=null;
  if(process.env.SYSTEMIA_CEMETERY_RESEARCH_OUT_DIR){
   const target=path.resolve(process.env.SYSTEMIA_CEMETERY_RESEARCH_OUT_DIR);
   if(target===sourceRoot||target.startsWith(sourceRoot+path.sep)||target===path.resolve(outDir)||path.dirname(target)!==path.dirname(path.resolve(outDir))||path.basename(target)!=='kaidance-cemetery-research')throw Error('cemetery_private_sibling_required');
   cemetery=await researchCycle({outDir:target});
   // Classification advances only on a newly committed company tick.
   if(!result.duplicate) cemeteryClassification=await classifyNext({outDir:target});
  }
  console.log(JSON.stringify({schema:'evercraft.kaidance.company-heartbeat-cli.v1',ok:true,
   cemetery_research:cemetery,cemetery_classification:cemeteryClassification,duplicate:result.duplicate,source_proof:result.report?.proof?.status||null,
   public_products_observed:result.report?.company_portfolio?.public_products||null,
   infrastructure_watch_receipt:result.report?.infrastructure_watch?.status||null,
   infrastructure_watch_publication_authorized:false,
   global_opportunity_receipt:result.report?.global_opportunities?.status||null,
   network_development_receipt:result.report?.network_development?.status||null,
   global_opportunity_outreach_authorized:false,
   next_action_key:result.next_action?.current_next_action?.work_key||null,
   learning_community_state:result.report?.learning_community?.state||null,
   learning_source_proofs_run:result.report?.learning_community?.source_proofs_run||0,
   aircore_source_status:result.report?.aircore_development?.source_status||null,
   external_skill_intake_status:result.report?.external_skill_intake?.status||null,
   external_skills_quarantined:result.report?.external_skill_intake?.quarantined||0,
   external_skills_installed:0,
   external_technologies_quarantined:result.report?.external_skill_intake?.technology_quarantined||0,
   aircore_verified_cadr_cfm:null,aircore_prototype_built:false,
   next_action_execution_authorized:false,
   creative_development:creative,
   creative_code_changes:0,creative_auto_publication:false,
   worker_launches:0,production_mutations:0,
   output_directory:'configured_private_runtime_or_ci_artifacts'}));
  if(result.report?.proof?.status==='failed')process.exitCode=1;
 }catch(e){console.error(JSON.stringify({schema:'evercraft.kaidance.company-heartbeat-cli.v1',ok:false,
  reason:String(e?.message||e).slice(0,120)}));process.exitCode=1}
}
