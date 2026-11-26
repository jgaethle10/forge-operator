// KAIDANCE's existing five-minute company heartbeat: education + community development.
// Bounded SOURCE validation and durable engineering queue, not an AI code-writer.
// No separate timer, external requests, private student/member data or publishing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const DEFAULT_ROOT=fileURLToPath(new URL('../../',import.meta.url));
const SCHEMA='evercraft.kaidance.learning-community-workstreams.v1';
const STATUS='evercraft.kaidance.learning-community-cycle.v1';
const SOURCE=/^(?:systemia|public|registry|tests)\/[A-Za-z0-9][A-Za-z0-9./-]{0,175}$/;
const SHA=/^sha256:[a-f0-9]{64}$/;
const sha=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
function fail(code){throw Error(code)}
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'))}
function safeSource(repo,relative){
 if(typeof relative!=='string'||!SOURCE.test(relative)||relative.includes('..')||
   relative.includes('//')||relative.startsWith('/'))fail('learning_untrusted_source_path');
 const file=path.join(repo,relative);
 if(!file.startsWith(repo+path.sep))fail('learning_source_outside_repo');
 if(!fs.existsSync(file))return {exists:false};
 const info=fs.lstatSync(file);
 if(!info.isFile()||info.isSymbolicLink()||info.size>2*1024*1024)
  fail('learning_source_not_regular_bounded_file');
 return {exists:true,bytes:fs.readFileSync(file)};
}
function privateJson(file,value){
 const parent=path.dirname(file);
 fs.mkdirSync(parent,{recursive:true,mode:0o700});
 const p=fs.lstatSync(parent);
 if(!p.isDirectory()||p.isSymbolicLink()||(p.mode&0o077)!==0)
  fail('learning_private_output_required');
 if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())
  fail('learning_output_symlink_denied');
 const tmp=file+'.'+process.pid+'.'+randomBytes(5).toString('hex')+'.tmp';
 try{
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  fs.renameSync(tmp,file);
 }finally{if(fs.existsSync(tmp))fs.rmSync(tmp,{force:true})}
}
export function validateLearningCommunityManifest(manifest,catalog){
 if(manifest?.schema!==SCHEMA||manifest.cadence_seconds!==300||
  manifest.policy?.authority!=='existing_kaidance_systemia_saban_only'||
  manifest.policy?.production_mutations!==false||
  manifest.policy?.automatic_code_writes!==false||
  manifest.policy?.automatic_publication!==false||
  manifest.policy?.external_contact!==false||
  manifest.policy?.student_or_member_data_access!==false||
  manifest.policy?.no_legacy_provider_contact!==true||
  manifest.policy?.max_source_proofs_per_tick!==2||
  manifest.policy?.proof_timeout_ms!==25000||
  manifest.policy?.proof_expiry_seconds!==3600||
  !Array.isArray(manifest.workstreams)||manifest.workstreams.length<6||
  manifest.workstreams.length>16)
  fail('learning_manifest_invalid_or_unsafe');
 const keys=new Set((catalog?.products||[]).map(x=>x.product_key));
 const seen=new Set(),bound=new Set();
 for(const row of manifest.workstreams){
  if(!/^[a-z][a-z0-9-]{2,65}$/.test(row.key)||seen.has(row.key)||
    !['education','community'].includes(row.family)||
    !Number.isInteger(row.priority)||row.priority<1||row.priority>3||
    !Array.isArray(row.product_keys)||!Array.isArray(row.source_files)||
    !Array.isArray(row.proof_tests)||row.source_files.length<1||
    row.source_files.length>6||row.proof_tests.length>3||
    row.age_sensitive!==true&&row.age_sensitive!==false||
    typeof row.maturity!=='string'||!row.maturity||
    !/^[a-z0-9_]{10,170}$/.test(row.next_work||'')||
    !/^[a-z0-9_]{10,170}$/.test(row.release_gate||''))
    fail('learning_workstream_invalid');
  seen.add(row.key);
  for(const key of row.product_keys){
   if(!keys.has(key)||bound.has(key))fail('learning_product_binding_unknown_or_duplicate');
   bound.add(key);
  }
  for(const f of row.source_files){
   if(!SOURCE.test(f)||f.includes('..')||f.includes('//'))fail('learning_source_path_denied');
  }
  for(const t of row.proof_tests){
   if(!/^tests\/[a-z0-9][a-z0-9-]{1,120}\.test\.mjs$/.test(t)||
      t.includes('..'))fail('learning_proof_not_allowlisted');
  }
 }
 for(const required of ['infinite-classroom','evercraft-circles','aiden-lab-deep-learning',
   'systemia-university','nepal-offline-academy','legacy-learning-census'])
  if(!seen.has(required))fail('learning_required_family_missing');
 return {workstreams:seen.size,bound_products:bound.size};
}
export function fingerprintLearningSources(root,files){
 const repo=path.resolve(root);
 const hash=createHash('sha256');
 const missing=[];
 for(const relative of [...files].sort()){
  const x=safeSource(repo,relative);
  hash.update(relative+'\0');
  if(!x.exists){missing.push(relative);hash.update('MISSING');}
  else hash.update(x.bytes);
  hash.update('\0');
 }
 return {fingerprint:'sha256:'+hash.digest('hex'),missing};
}
function chooseDue(rows,prior,now){
 return rows.filter(r=>r.due&&r.proof_tests.length>0&&r.missing.length===0)
 .sort((a,b)=>{
  const x=prior?.workstreams?.[a.key]?.verified_at||'';
  const y=prior?.workstreams?.[b.key]?.verified_at||'';
  return (x?Date.parse(x):0)-(y?Date.parse(y):0)||
    a.priority-b.priority||a.key.localeCompare(b.key);
 }).slice(0,2).map(r=>r.key);
}
export function runLearningCommunityCycle({
 root=DEFAULT_ROOT,outDir,now=new Date(),runProofs=false,
 spawn=spawnSync,manifest=null,products=null
}={}){
 if(!outDir)fail('learning_output_required');
 const repo=path.resolve(root),out=path.resolve(outDir);
 if(out===repo||out===repo+path.sep||out===path.parse(out).root)
  fail('learning_unsafe_output');
 const at=now instanceof Date?now:new Date(now);
 if(!Number.isFinite(at.getTime()))fail('learning_invalid_clock');
 const tick=Math.floor(at.getTime()/300000);
 const cfg=manifest||readJson(path.join(repo,'registry/kaidance-learning-community-workstreams.v1.json'));
 const catalog=products||readJson(path.join(repo,'registry/public-products.json'));
 validateLearningCommunityManifest(cfg,catalog);
 const priorPath=path.join(out,'state.json');
 if(fs.existsSync(priorPath)&&fs.lstatSync(priorPath).isSymbolicLink())fail('learning_state_symlink_denied');
 const prior=fs.existsSync(priorPath)?readJson(priorPath):null;
 if(prior&&prior.schema!==STATUS)fail('learning_previous_state_invalid');
 if(prior&&prior.tick>tick)fail('learning_clock_rollback');
 if(prior?.tick===tick){
  // The company tick can be interrupted AFTER the learning subcycle committed.
  // Reuse exactly its bounded receipt and queue, never silently drop or rerun.
  const reportFile=path.join(out,'latest.json'),queueFile=path.join(out,'queue.json');
  if(!fs.existsSync(reportFile)||!fs.existsSync(queueFile)||
     fs.lstatSync(reportFile).isSymbolicLink()||fs.lstatSync(queueFile).isSymbolicLink())
   fail('learning_duplicate_receipts_missing_or_untrusted');
  const report=readJson(reportFile),queue=readJson(queueFile);
  if(report.schema!==STATUS||queue.schema!=='evercraft.kaidance.learning-community-queue.v1'||
    report.tick!==tick||queue.tick!==tick)
   fail('learning_duplicate_receipts_invalid');
  return {duplicate:true,tick,executed:false,report,queue,
   report_ref:sha(JSON.stringify(report))};
 }

 const tracks=cfg.workstreams.map(row=>{
  const {fingerprint,missing}=fingerprintLearningSources(repo,row.source_files);
  const old=prior?.workstreams?.[row.key]||null;
  const age=old?.verified_at?at.getTime()-Date.parse(old.verified_at):Infinity;
  const verifiedRecently=Number.isFinite(age)&&age>=0&&age<cfg.policy.proof_expiry_seconds*1000;
  return {...row,fingerprint,missing,due:old?.fingerprint!==fingerprint||
    !verifiedRecently||old?.proof_state!=='passed',old};
 });
 const selected=new Set(runProofs?chooseDue(tracks,prior,at):[]);
 const sourceRows=[],stateRows={},proofs=[];
 for(const row of tracks){
  let status='fresh_prior_source_proof',executed=false,verifiedAt=row.old?.verified_at||null;
  if(row.missing.length)status='source_missing_hold';
  else if(!row.proof_tests.length)status='recovery_review_required';
  else if(row.due){
   status='queued_source_proof';
   if(selected.has(row.key)){
    executed=true;
    const args=['--test',...row.proof_tests];
    const result=spawn(process.execPath,args,{
     cwd:repo,encoding:'utf8',timeout:cfg.policy.proof_timeout_ms,
     maxBuffer:16384,
     env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:process.env.HOME||os.homedir()}
    });
    status=result.status===0&&!result.error?'source_proof_passed':'source_proof_failed';
    if(status==='source_proof_passed')verifiedAt=at.toISOString();
    proofs.push({workstream:row.key,status,exit_code:Number.isInteger(result.status)?result.status:null,
     stdout_or_stderr_persisted:false,timeout:result.error?.code==='ETIMEDOUT'});
   }
  }
  const stateProof=(status==='source_proof_passed'||status==='fresh_prior_source_proof')?
   'passed':status==='source_proof_failed'?'failed':'unverified';
  stateRows[row.key]={fingerprint:row.fingerprint,verified_at:verifiedAt,
   proof_state:stateProof,last_seen_at:at.toISOString()};
  sourceRows.push({key:row.key,family:row.family,priority:row.priority,
   product_keys:row.product_keys,maturity:row.maturity,
   source_fingerprint:row.fingerprint,source_status:status,
   source_paths_observed:row.source_files.length-row.missing.length,
   source_paths_expected:row.source_files.length,missing_paths:row.missing,
   proof_executed_this_tick:executed,proof_tests_passed_this_tick:status==='source_proof_passed',
   last_verified_at:verifiedAt,child_data_access:false,
   automatic_release_authorized:false,commercially_ready_verified:false,
   next_work:row.next_work,release_gate:row.release_gate});
 }
 const candidates=sourceRows.map(row=>({
  work_key:'learning:'+row.key+':'+row.source_fingerprint.slice(7,23),
  lane_key:row.family==='community'?'community-network':'education-network',
  workstream:row.key,source_fingerprint:row.source_fingerprint,
  priority:row.priority,
  action:row.source_status==='source_proof_failed'?'investigate_failed_source_proof':
    row.source_status==='source_missing_hold'?'recover_missing_owned_sources':
    row.source_status==='queued_source_proof'?'run_bounded_existing_source_proof':
    row.next_work,
  next_development_action:row.next_work,readiness_gate:row.release_gate,
  authority:'systemia_goal_review_required',
  execution_authorized:false,release_authorized:false,
  school_or_member_data_access_authorized:false
 }));
 const report={schema:STATUS,heartbeat_seconds:300,tick,
  observed_at:at.toISOString(),workstreams:sourceRows,
  counts:{tracked:sourceRows.length,source_proofs_run:proofs.length,
   passed:proofs.filter(x=>x.status==='source_proof_passed').length,
   failed:proofs.filter(x=>x.status==='source_proof_failed').length,
   needing_development_review:candidates.length},
  proofs,source_checks_only:true,source_edit_count:0,student_or_member_data_processed:false,
  automatic_development_workers_launched:0,production_mutations:0,
  public_launches:0,commercial_readiness_unverified:true,
  owner_runtime_heartbeat_independently_attested:false};
 const queue={schema:'evercraft.kaidance.learning-community-queue.v1',
  observed_at:at.toISOString(),tick,execution_authorized:false,
  candidates,workstream_count:candidates.length,source_proof_capacity_per_tick:2,
  no_code_writes:true,no_contact_or_publication:true,
  no_child_or_member_data_use:true,approval_authority:'Systemia'};
 const state={schema:STATUS,tick,observed_at:at.toISOString(),workstreams:stateRows};
 // Private state is the commit watermark and must be written LAST.
 privateJson(path.join(out,'latest.json'),report);
 privateJson(path.join(out,'queue.json'),queue);
 privateJson(priorPath,state);
 return {duplicate:false,tick,executed:true,report,queue,
  report_ref:sha(JSON.stringify(report))};
}
