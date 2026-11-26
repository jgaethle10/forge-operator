#!/usr/bin/env node
// Existing KAIDANCE company clock owns this bounded AirCore source review.
// This is NOT a physical test, autonomous CADR measurement or hardware builder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const SCHEMA='evercraft.kaidance.aircore-development.v1';
const STATUS='evercraft.kaidance.aircore-cycle.v1';
const SOURCE=new Set([
 'systemia/breath-of-fresh-air/aircore-sizing.mjs',
 'systemia/breath-of-fresh-air/aircore-sizing.test.mjs',
 'systemia/breath-of-fresh-air/AIRCORE_V01_ENGINEERING_PREFLIGHT.md'
]);
const TEST='systemia/breath-of-fresh-air/aircore-sizing.test.mjs';
const sha=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
function fail(message){throw Error('aircore_'+message)}
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'))}
function privateJson(file,value){
 const dir=path.dirname(file);
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const meta=fs.lstatSync(dir);
 if(!meta.isDirectory()||meta.isSymbolicLink()||(meta.mode&0o077)!==0)
  fail('unsafe_private_output');
 if(fs.existsSync(file)&&(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink()))
  fail('unsafe_output_file');
 const temp=file+'.'+process.pid+'.'+randomBytes(5).toString('hex')+'.tmp';
 try{fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,file)}
 finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
}
export function validateAirCoreConfig(v){
 const p=v?.policy||{};
 if(v?.schema!==SCHEMA||v.mission_key!=='breath-of-fresh-air-aircore-v01'||
  v.goal_key!=='prove-a-removable-filtration-core-before-refresh-table-integration'||
  v.lane_key!=='aircore-development'||v.heartbeat_seconds!==300||
  v.systemia_review_required!==true||
  !Array.isArray(v.source_files)||v.source_files.length!==3||
  new Set(v.source_files).size!==3||v.source_files.some(x=>!SOURCE.has(x))||
  !Array.isArray(v.proof_tests)||v.proof_tests.length!==1||
  v.proof_tests[0]!==TEST||p.maximum_proofs_per_tick!==1||
  p.proof_timeout_ms!==25000||p.proof_expiry_seconds!==3600||
  ['code_write_authorized','production_mutation_authorized','hardware_purchase_authorized',
   'customer_or_partner_contact_authorized','public_air_quality_claim_authorized',
   'physical_test_verified','automatic_publish_authorized'].some(k=>p[k]!==false)||
  !v.gates||Object.keys(v.gates).length!==7)
  fail('untrusted_configuration');
 return v;
}
export function fingerprintAirCoreSources(root,files){
 const base=path.resolve(root),hash=createHash('sha256'),missing=[];
 for(const relative of [...files].sort()){
  if(!SOURCE.has(relative))fail('untrusted_source_path');
  const abs=path.join(base,relative);
  if(!abs.startsWith(base+path.sep))fail('outside_source');
  hash.update(relative+'\0');
  if(!fs.existsSync(abs)){missing.push(relative);hash.update('MISSING');}
  else{
   const stat=fs.lstatSync(abs);
   if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2*1024*1024)
    fail('untrusted_source_file');
   hash.update(fs.readFileSync(abs));
  }
  hash.update('\0');
 }
 return {source_fingerprint:'sha256:'+hash.digest('hex'),missing};
}
export function runAirCoreDevelopmentCycle({
 root=ROOT,outDir,now=new Date(),runProofs=false,spawn=spawnSync
}={}){
 if(!outDir)fail('output_required');
 const base=path.resolve(root),out=path.resolve(outDir);
 if(out===base||out.startsWith(base+path.sep)&&!out.includes(path.sep+'artifacts'+path.sep))
  fail('unsafe_source_output');
 const clock=new Date(now);
 if(!Number.isFinite(clock.getTime()))fail('invalid_clock');
 const tick=Math.floor(clock.getTime()/300000);
 const config=validateAirCoreConfig(readJson(path.join(base,'registry/kaidance-aircore-development.v1.json')));
 const oldFile=path.join(out,'state.json');
 if(fs.existsSync(oldFile)&&(!fs.lstatSync(oldFile).isFile()||fs.lstatSync(oldFile).isSymbolicLink()))
  fail('untrusted_old_state');
 const old=fs.existsSync(oldFile)?readJson(oldFile):null;
 if(old&&old.schema!==STATUS)fail('invalid_previous_state');
 if(old&&old.tick>tick)fail('clock_rollback');
 if(old?.tick===tick){
  const reportFile=path.join(out,'latest.json'),queueFile=path.join(out,'queue.json');
  if(!fs.existsSync(reportFile)||!fs.existsSync(queueFile))fail('duplicate_receipts_missing');
  const report=readJson(reportFile),queue=readJson(queueFile);
  if(report.schema!==STATUS||report.tick!==tick||
     queue.schema!=='evercraft.kaidance.aircore-queue.v1'||queue.tick!==tick||
     report.receipt_hash!==sha(JSON.stringify({...report,receipt_hash:null})))
   fail('duplicate_receipts_invalid');
  return {duplicate:true,report,queue,receipt_ref:report.receipt_hash};
 }
 const fp=fingerprintAirCoreSources(base,config.source_files);
 const previousAge=old?.last_verified_at?clock.getTime()-Date.parse(old.last_verified_at):Infinity;
 const fresh=Number.isFinite(previousAge)&&previousAge>=0&&
   previousAge<config.policy.proof_expiry_seconds*1000;
 const due=old?.source_fingerprint!==fp.source_fingerprint||!fresh||old?.proof_state!=='passed';
 let source_status=fp.missing.length?'missing_source_hold':
   due?'source_proof_queued':'fresh_prior_source_proof';
 let proof_executed=false,proof_passed=false,verified_at=old?.last_verified_at||null;
 if(!fp.missing.length&&due&&runProofs){
  const result=spawn(process.execPath,['--test',TEST],{
   cwd:base,encoding:'utf8',timeout:config.policy.proof_timeout_ms,maxBuffer:16384,
   env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:process.env.HOME||os.homedir()}
  });
  proof_executed=true;
  proof_passed=result.status===0&&!result.error;
  source_status=proof_passed?'source_proof_passed':'source_proof_failed';
  if(proof_passed)verified_at=clock.toISOString();
 }
 const action=source_status==='missing_source_hold'?'restore_missing_aircore_owned_source':
  source_status==='source_proof_failed'?'investigate_aircore_model_or_test_failure':
  source_status==='source_proof_queued'?'run_bounded_aircore_design_source_proof':
  'review_two_real_blower_and_filter_pressure_curves';
 const decision_ref=sha(JSON.stringify({mission:config.mission_key,source:fp.source_fingerprint,action,
   passed:proof_passed||source_status==='fresh_prior_source_proof'}));
 const changed=old?.decision_ref===decision_ref?0:1;
 const candidate={
  work_key:'aircore:'+fp.source_fingerprint.slice(7,23)+':'+action,
  lane_key:'aircore-development',
  mission_key:config.mission_key,
  goal_key:config.goal_key,
  source_fingerprint:fp.source_fingerprint,
  priority:2,action,authority:'systemia_operator_review_required',
  execution_authorized:false,hardware_purchase_authorized:false,
  partner_contact_authorized:false,code_write_authorized:false,
  public_air_quality_claim_authorized:false,
  physical_validation_verified:false
 };
 const report={
  schema:STATUS,tick,observed_at:clock.toISOString(),heartbeat_seconds:300,
  mission_key:config.mission_key,goal_key:config.goal_key,
  lane_key:config.lane_key,source_authority:'owned_repository_read_only',
  source_fingerprint:fp.source_fingerprint,source_status,
  missing_sources:fp.missing,proof_executed_this_tick:proof_executed,
  proof_passed_this_tick:proof_passed,source_proof_last_verified_at:verified_at,
  next_engineering_action:action,newly_seen:changed,decision_ref,
  evidence_scope:'source_design_model_only',
  gate_G0_source_validation:source_status==='source_proof_passed'||source_status==='fresh_prior_source_proof'
    ?'source_checks_passed_not_physical_validation':'not_yet_verified',
  gates_G1_to_G6:'unverified_or_held',
  physical_prototype_built:false,measured_airflow_cfm:null,measured_cadr_cfm:null,
  noise_measurements_verified:false,thermal_measurements_verified:false,
  safety_certification_verified:false,commercial_ready:false,
  work_executed_by_saban:false,source_code_changes:0,
  hardware_purchases:0,partner_contacts:0,production_mutations:0,
  air_exchange_claim_authorized:false,public_performance_claim_authorized:false
 };
 report.receipt_hash=sha(JSON.stringify({...report,receipt_hash:null}));
 const queue={
  schema:'evercraft.kaidance.aircore-queue.v1',tick,observed_at:report.observed_at,
  mission_key:config.mission_key,decision_ref,candidates:[candidate],
  execution_authorized:false,physical_work_authorized:false,
  workstream_state:'engineering_design_preflight',no_new_scheduler:true
 };
 const state={schema:STATUS,tick,source_fingerprint:fp.source_fingerprint,
  last_verified_at:verified_at,
  proof_state:source_status==='source_proof_passed'||source_status==='fresh_prior_source_proof'
    ?'passed':'unverified',
  decision_ref};
 // Last write is cycle watermark. On interrupted earlier writes, retry the tick.
 privateJson(path.join(out,'latest.json'),report);
 privateJson(path.join(out,'queue.json'),queue);
 privateJson(oldFile,state);
 return {duplicate:false,report,queue,receipt_ref:report.receipt_hash};
}
