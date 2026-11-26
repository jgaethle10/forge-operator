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
import {writeKaidanceNextAction} from './kaidance-next-action.mjs';
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
function eventScoutReview(out,now){
 // A sibling receipt from the SAME existing Kaidance workflow, never a new runner.
 if(path.basename(out)!=='kaidance-company-heartbeat')
  return {status:'not_in_canonical_heartbeat_root',candidates:[]};
 const file=path.join(path.dirname(out),'event-opportunity-scout/state.json');
 try{
  if(!fs.existsSync(file))return {status:'no_source_receipt',candidates:[]};
  const st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||st.size>256*1024)
   return {status:'unsafe_source_receipt',candidates:[]};
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  if(data.schema!=='evercraft.events.opportunity-scout-state.v1'||
    data.observation?.schema!=='evercraft.events.opportunity-review.v1')
   return {status:'wrong_source_schema',candidates:[]};
  const age=new Date(now).getTime()-Date.parse(data.last_success_at);
  if(!Number.isFinite(age)||age<0||age>8*3600000)
   return {status:'stale_or_unverified_source',candidates:[]};
  const candidates=(data.observation.candidates||[]).filter(c=>
   /^event:[a-f0-9]{20}$/.test(c?.opportunity_key||'')&&
   c.outreach_authorized===false&&c.dispatch_authorized===false&&
   c.source_url?.startsWith('https://www.find-tender.service.gov.uk/')&&
   c.buyer_contact_verified===false&&c.revenue_confirmed===false&&
   (!c.deadline||Date.parse(c.deadline)>new Date(now).getTime()))
   .slice(0,6);
  return {status:'read_only_review_candidates',candidates};
 }catch{return {status:'unreadable_source_receipt',candidates:[]}}
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
export function runCompanyHeartbeat({
 root=sourceRoot,outDir=path.join(sourceRoot,'artifacts/kaidance-company-heartbeat'),
 now=new Date(),proveWorlds=false,spawn=spawnSync
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
 const planned=planCompanyHeartbeat({manifest,products,supervisor,previous,now,
  worldsFingerprint:fingerprint,proof,workflowManifestCount:countWorkflowManifests(repo)});
 const scout=eventScoutReview(out,now);
 const report={...planned.report,proof,
  event_discovery:{lane_key:'events',source_status:scout.status,
   candidates_for_review:scout.candidates.length,
   external_work_performed:false,public_uk_procurement_only:true,
   any_buyer_contact:false,any_sponsor_commitment:false}};
 const queue={schema:'evercraft.kaidance.company-heartbeat.queue.v1',observed_at:report.observed_at,
  execution_authorized:false,
  candidates:[
   ...(proof.status==='failed'?[{work_key:'worlds:source-proof-failure',lane_key:'worlds',priority:1,action:'investigate_failed_source_tests',authority:'review_required'}]:[]),
   ...(proof.status==='due_not_executed'?[{work_key:'worlds:source-proof-due',lane_key:'worlds',priority:2,action:'run_bounded_source_proof',authority:'existing_allowlisted_local_only'}]:[]),
   ...scout.candidates.map((c)=>({
    work_key:c.opportunity_key,lane_key:'events',priority:3,
    action:'verify_event_tender_source_buyer_eligibility_and_delivery_capacity',
    evidence_ref:c.source_url,authority:'founder_review_required',
    outreach_authorized:false,dispatch_authorized:false,
    source_region:'United Kingdom',deadline:c.deadline
   })),
   ...report.company_portfolio.products_not_yet_named.slice(0,12).map(key=>({
    work_key:'product:'+key+':adapter-admission',lane_key:null,priority:3,
    action:'bind_existing_systemia_capability_or_admit_bounded_new_adapter',authority:'source_review_required'
   }))
  ],
  no_remote_work_dispatched:true,no_code_changes_made:true};
 fs.mkdirSync(out,{recursive:true,mode:0o700});
 // Commit the cycle watermark LAST. An interrupted write must be retryable
 // without falsely reporting a completed tick with missing evidence receipts.
 atomicJson(path.join(out,'latest.json'),report);
 atomicJson(path.join(out,'queue.json'),queue);
 atomicJson(path.join(out,'mission-snapshot.json'),planned.snapshot);
 // Read-only next-step reconciliation uses already-written prior/sibling
 // receipts. No external effects or second scheduler. State watermark stays last.
 const next=writeKaidanceNextAction({outDir:out,companyReport:report,companyQueue:queue,now});
 atomicJson(statePath,planned.state);
 return {duplicate:false,tick,executed:true,report,queue,
  next_action:next.report,mission_snapshot:planned.snapshot,
  receipt_ref:sha(JSON.stringify(planned.snapshot))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const opt=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:''};
 try{
  const outDir=opt('--out')||process.env.SYSTEMIA_COMPANY_HEARTBEAT_OUT_DIR||path.join(sourceRoot,'artifacts/kaidance-company-heartbeat');
  const result=runCompanyHeartbeat({outDir,proveWorlds:process.argv.includes('--prove-worlds')});
  console.log(JSON.stringify({schema:'evercraft.kaidance.company-heartbeat-cli.v1',ok:true,
   duplicate:result.duplicate,source_proof:result.report?.proof?.status||null,
   public_products_observed:result.report?.company_portfolio?.public_products||null,
   next_action_key:result.next_action?.current_next_action?.work_key||null,
   next_action_execution_authorized:false,
   worker_launches:0,production_mutations:0,
   output_directory:'configured_private_runtime_or_ci_artifacts'}));
  if(result.report?.proof?.status==='failed')process.exitCode=1;
 }catch(e){console.error(JSON.stringify({schema:'evercraft.kaidance.company-heartbeat-cli.v1',ok:false,
  reason:String(e?.message||e).slice(0,120)}));process.exitCode=1}
}
