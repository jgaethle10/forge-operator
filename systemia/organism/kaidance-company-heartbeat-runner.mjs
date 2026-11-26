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
 now=new Date(),proveWorlds=false,proveLearning=false,learningCycle=runLearningCommunityCycle,spawn=spawnSync,aiwReceipt=null,globalOpportunityReceipt=null
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
 // Kaidance's existing 300-second company clock reconciles learning and
 // community source work. No second scheduler or source-write authority.
 let learning=null;
 try{
  learning=learningCycle({
   root:repo,outDir:path.join(out,'learning-community'),now,
   runProofs:proveLearning===true,spawn
  });
 }catch(error){
  const raw=String(error?.message||'');
  learning={held:true,reason:/^learning_[a-z0-9_]+$/.test(raw)?raw:'learning_cycle_held',
   report:null,queue:null};
 }
 const planned=planCompanyHeartbeat({manifest,products,supervisor,previous,now,
  worldsFingerprint:fingerprint,proof,workflowManifestCount:countWorkflowManifests(repo)});
 const aiw=classifyAiWReceipt(aiwReceipt,now);
 const global=classifyGlobalOpportunityReceipt(globalOpportunityReceipt,now);
 const learningSummary=learning?.report?{
  state:'source_reconciled',
  tracked:learning.report.counts.tracked,
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
 const report={...planned.report,proof,infrastructure_watch:aiw,
  global_opportunities:global,learning_community:learningSummary};
 const queue={schema:'evercraft.kaidance.company-heartbeat.queue.v1',observed_at:report.observed_at,
  execution_authorized:false,
  candidates:[
   ...(proof.status==='failed'?[{work_key:'worlds:source-proof-failure',lane_key:'worlds',priority:1,action:'investigate_failed_source_tests',authority:'review_required'}]:[]),
   ...(proof.status==='due_not_executed'?[{work_key:'worlds:source-proof-due',lane_key:'worlds',priority:2,action:'run_bounded_source_proof',authority:'existing_allowlisted_local_only'}]:[]),
   ...aiw.review_candidates.map(row=>({work_key:row.key,lane_key:'infrastructure-watch',priority:2,
    action:row.action,authority:'systemia_operator_review_required',
    execution_authorized:false,publication_authorized:false})),
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
   ...report.company_portfolio.products_not_yet_named.slice(0,12).map(key=>({
    work_key:'product:'+key+':adapter-admission',lane_key:null,priority:3,
    action:'bind_existing_systemia_capability_or_admit_bounded_new_adapter',authority:'source_review_required'
   }))
  ],
  no_remote_work_dispatched:true,no_code_changes_made:true};
 const snapshot={...planned.snapshot,
  counts:{...planned.snapshot.counts,
   scanned:planned.snapshot.counts.scanned+aiw.sources_observed+global.sources_observed+(learning?.report?.counts?.tracked||0),
   changed:planned.snapshot.counts.changed+(global.newly_seen||0),
   held:planned.snapshot.counts.held+aiw.review_candidates.length+global.review_candidates.length+(learning?.report?.counts?.failed||0)},
  evidence_refs:[
    ...planned.snapshot.evidence_refs,
    ...(learning?.report_ref?['source:registry/kaidance-learning-community-workstreams.v1.json',learning.report_ref]:[]),
    ...(aiw.status==='verified_receipt'?[
      'source:systemia/infrastructure-watch/source-registry.v1.json',sha(JSON.stringify(aiw))]:[]),
    ...(global.status==='verified_source_receipt'?[
      'source:registry/kaidance-global-opportunity-sources.v1.json',global.receipt_hash]:[])
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
    aiwReceipt,globalOpportunityReceipt});
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
   global_opportunity_outreach_authorized:false,
   next_action_key:result.next_action?.current_next_action?.work_key||null,
   learning_community_state:result.report?.learning_community?.state||null,
   learning_source_proofs_run:result.report?.learning_community?.source_proofs_run||0,
   next_action_execution_authorized:false,
   creative_development:creative,
   creative_code_changes:0,creative_auto_publication:false,
   worker_launches:0,production_mutations:0,
   output_directory:'configured_private_runtime_or_ci_artifacts'}));
  if(result.report?.proof?.status==='failed')process.exitCode=1;
 }catch(e){console.error(JSON.stringify({schema:'evercraft.kaidance.company-heartbeat-cli.v1',ok:false,
  reason:String(e?.message||e).slice(0,120)}));process.exitCode=1}
}
