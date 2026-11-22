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
 const report={...planned.report,proof};
 const queue={schema:'evercraft.kaidance.company-heartbeat.queue.v1',observed_at:report.observed_at,
  execution_authorized:false,
  candidates:[
   ...(proof.status==='failed'?[{work_key:'worlds:source-proof-failure',lane_key:'worlds',priority:1,action:'investigate_failed_source_tests',authority:'review_required'}]:[]),
   ...(proof.status==='due_not_executed'?[{work_key:'worlds:source-proof-due',lane_key:'worlds',priority:2,action:'run_bounded_source_proof',authority:'existing_allowlisted_local_only'}]:[]),
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
 atomicJson(statePath,planned.state);
 return {duplicate:false,tick,executed:true,report,queue,
  mission_snapshot:planned.snapshot,receipt_ref:sha(JSON.stringify(planned.snapshot))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const opt=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:''};
 try{
  const outDir=opt('--out')||process.env.SYSTEMIA_COMPANY_HEARTBEAT_OUT_DIR||path.join(sourceRoot,'artifacts/kaidance-company-heartbeat');
  const result=runCompanyHeartbeat({outDir,proveWorlds:process.argv.includes('--prove-worlds')});
  // The optional private Systemia goal is advanced by the SAME existing
  // heartbeat invocation. Even if the source tick is duplicate, a crashed
  // post-source dispatch can reconcile its durable goal state without replay.
  const {advanceAdmittedCompanyGoal,goalBeatMissionSnapshot}=
   await import('./kaidance-goal-advance.mjs');
  const goalFile=opt('--goal-file')||process.env.SYSTEMIA_KAIDANCE_GOAL_STATE_FILE||'';
  const beat=await advanceAdmittedCompanyGoal({goalFile,
   companyReport:result.report||readJson(path.join(outDir,'latest.json')),
   sourceRoot});
  atomicJson(path.join(outDir,'goal-dispatch.json'),beat);
  atomicJson(path.join(outDir,'goal-mission-snapshot.json'),goalBeatMissionSnapshot(beat));
  console.log(JSON.stringify({schema:'evercraft.kaidance.company-heartbeat-cli.v1',ok:true,
   duplicate:result.duplicate,source_proof:result.report?.proof?.status||null,
   public_products_observed:result.report?.company_portfolio?.public_products||null,
   admitted_goal_work_executed:beat.executed,admitted_goal_work_completed:beat.ok,
   goal_hold:beat.ok?null:beat.reason,
   worker_launches:beat.executed?1:0,production_mutations:0,
   output_directory:'configured_private_runtime_or_ci_artifacts'}));
  if(result.report?.proof?.status==='failed')process.exitCode=1;
 }catch(e){console.error(JSON.stringify({schema:'evercraft.kaidance.company-heartbeat-cli.v1',ok:false,
  reason:String(e?.message||e).slice(0,120)}));process.exitCode=1}
}
