#!/usr/bin/env node
/**
 * First-party, owner-initiated NextGen field admission for the EO-001
 * *internal read-only* Systemia/Forge QA service.
 *
 * Source is never downloaded/evaluated here. Operator must obtain a separately
 * reviewed, exact SHA-pinned detached Git worktree. This command may only
 * create/start the TWO narrowly scoped user-systemd EO-001 units, not alter
 * NodeSeed, agent shadow telemetry, remote workers or credential custody.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {writeEo001ResidentUnits} from '../../systemia/organism/eo001-resident-timer.mjs';
import {readGoalState} from '../../systemia/organism/goal-store.mjs';

const name='evercraft-eo001-owned-qa';
const service=name+'.service',timer=name+'.timer';
const REPO='jgaethle10/forge-operator';
const shaPattern=/^[a-f0-9]{40}$/;
const safeObject=v=>JSON.stringify(v)+'\n';
const run=(cmd,args,timeout=30000)=>{
  const p=spawnSync(cmd,args,{encoding:'utf8',timeout,
    maxBuffer:65536,stdio:['ignore','pipe','pipe']});
  return {ok:!p.error&&p.status===0,
    output:(p.stdout||'').trim(),error:p.error?.code||null};
};
function required(condition,code){if(!condition)throw Error(code);}
function ownerDir(dir,{privateDir=false}={}){
  const st=fs.lstatSync(dir);
  required(st.isDirectory()&&!st.isSymbolicLink()&&
    (typeof process.getuid!=='function'||st.uid===process.getuid())&&
    (!privateDir||(st.mode&0o077)===0),'OWNED_DIRECTORY_REQUIRED');
}
function readablePrivateFile(file){
  const st=fs.lstatSync(file);
  required(st.isFile()&&!st.isSymbolicLink()&&
    (typeof process.getuid!=='function'||st.uid===process.getuid())&&
    (st.mode&0o077)===0,'PRIVATE_RECEIPT_FILE_REQUIRED');
}
function codeRoot(){
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
}
function preflight({pin,home=os.homedir(),root=codeRoot(),exec=run}={}){
  required(shaPattern.test(pin),'REVIEWED_SOURCE_PIN_REQUIRED');
  required(typeof process.getuid==='function'&&process.getuid()!==0,
    'USER_SYSTEMD_NONROOT_REQUIRED');
  ownerDir(root);
  const current=exec('git',['-C',root,'rev-parse','--verify','HEAD']);
  required(current.ok&&current.output===pin,'SOURCE_PIN_MISMATCH');
  const edits=exec('git',['-C',root,'status','--porcelain','--untracked-files=no']);
  required(edits.ok&&edits.output==='','SOURCE_NOT_CLEAN');
  const base=path.join(home,'.local/state/evercraft/eo001-handoff');
  ownerDir(base,{privateDir:true});
  const cases=fs.readdirSync(base,{withFileTypes:true})
    .filter(x=>x.isDirectory()&&/^gate0-[A-Za-z0-9_-]{4,80}$/.test(x.name))
    .map(x=>path.join(base,x.name))
    .filter(x=>fs.existsSync(path.join(x,'gate0-private-handoff.zip')));
  required(cases.length===1,'PRIVATE_GATE0_BUNDLE_AMBIGUOUS_OR_MISSING');
  ownerDir(cases[0],{privateDir:true});
  for(const file of ['gate0-private-handoff.zip','sanitized-receipt.json',
    'independent-review.json']){
    readablePrivateFile(path.join(cases[0],file));
  }
  const systemd=exec('systemctl',['--user','show','default.target','-p','LoadState']);
  required(systemd.ok&&/LoadState=loaded/.test(systemd.output),
    'USER_SYSTEMD_MANAGER_NOT_AVAILABLE');
  const serviceFile=path.join(home,'.config/systemd/user',service);
  const timerFile=path.join(home,'.config/systemd/user',timer);
  required(!fs.existsSync(serviceFile)&&!fs.existsSync(timerFile),
    'EO001_UNITS_ALREADY_PRESENT_REVIEW_BEFORE_CHANGING');
  // Never ask for or reveal private tokens, exact local paths or evidence JSON.
  return {state:'FIELD_ADMISSION_PREFLIGHT_PASS',reviewed_head:pin,
    local_handoff_present:true,user_systemd_accessible:true,
    existing_services_untouched:true,remote_jobs_changed:false,
    external_send_authorized:false,private_data_uploaded:false};
}
async function inspectGoal(home){
  const file=path.join(home,'.local/state/evercraft/eo001-handoff',
    'systemia-missions/eo001-gate0.goal.json');
  const goal=await readGoalState(file);
  const task=goal.tasks.find(t=>t.work_key==='forge-private-evidence-qa');
  const external=goal.tasks.find(t=>t.work_key==='private-external-delivery-reconciliation');
  required(goal.mission_key==='EO-001'&&
    goal.goal_key==='eo001-gate0-evidence-continuity'&&
    task?.status==='complete'&&task?.attempt===1&&
    task?.receipt_refs?.some(r=>/^forge-qa:sha256:[a-f0-9]{64}$/.test(r))&&
    task?.evidence_refs?.some(r=>/^bundle:sha256:[a-f0-9]{64}$/.test(r))&&
    external?.human_gate_required===true&&
    external?.human_gate_unresolved===true&&
    external?.status==='pending','SYSTEMIA_QA_OR_EXTERNAL_HOLD_NOT_VERIFIED');
  return {mission_revision:goal.revision,internal_qa:'PASS',
    external_delivery:'HELD_PENDING_PROVIDER_PROOF',
    lab_inspection:'PENDING'};
}
export async function activateEo001({pin,home=os.homedir(),root=codeRoot(),
  exec=run}={}){
  const checked=preflight({pin,home,root,exec});
  // These offline tests use local synthetic fixtures. They neither invoke
  // inference nor send messages; require them before service installation.
  const tests=exec(process.execPath,['--test',
    path.join(root,'tests/eo001-systemia-owned-qa-mission.test.mjs'),
    path.join(root,'tests/eo001-resident-timer.test.mjs')],60000);
  required(tests.ok,'LOCAL_SYNTHETIC_TESTS_FAILED');
  const py=exec('python3',[
    path.join(root,'integrations/ai-evaluation-lab/test_eo001_forge_evidence_qa.py')],30000);
  required(py.ok,'LOCAL_FORGE_QA_NEGATIVE_TESTS_FAILED');

  let wrote=false,enabled=false;
  try{
    const result=writeEo001ResidentUnits({
      home,sourceRoot:root,nodeBinary:process.execPath,write:true});
    required(result.state==='UNIT_FILES_WRITTEN_NOT_ACTIVATED',
      'USER_UNIT_INSTALLATION_REJECTED');
    wrote=true;
    required(exec('systemctl',['--user','daemon-reload']).ok,'USER_SYSTEMD_RELOAD_FAILED');
    required(exec('systemctl',['--user','enable','--now',timer]).ok,
      'EO001_TIMER_ACTIVATION_FAILED');
    enabled=true;
    // Trigger exactly one local readonly QA run, not a model or external send.
    required(exec('systemctl',['--user','start',service],80000).ok,
      'EO001_FIRST_FIELD_QA_RUN_FAILED');
    const observed=await inspectGoal(home);
    const active=exec('systemctl',['--user','is-active',timer]);
    required(active.ok&&active.output==='active',
      'EO001_RESIDENT_TIMER_NOT_ACTIVE');
    return {schema:'evercraft.systemia.eo001.field-admission.v1',
      state:'RESIDENT_INTERNAL_QA_ACTIVE',source_pin:pin,
      systemia:observed,unattended_local_pickup:true,
      commissioned_agents_activated:false,
      remote_jobs_changed:false,external_send_authorized:false,
      other_services_changed:false};
  }catch(e){
    if(enabled){
      exec('systemctl',['--user','disable','--now',timer]);
      exec('systemctl',['--user','stop',service]);
    }
    if(wrote){
      for(const file of [service,timer]){
        const target=path.join(home,'.config/systemd/user',file);
        try{fs.unlinkSync(target);}catch{/* preserve failure status */}
      }
      exec('systemctl',['--user','daemon-reload']);
    }
    throw e;
  }
}
if(import.meta.url===pathToFileURL(path.resolve(process.argv[1]||'')).href){
  const args=process.argv.slice(2);
  const p=args.indexOf('--pin');
  const pin=p>=0?args[p+1]:'';
  const active=args.includes('--activate');
  const approved=args.includes('--owner-approves-internal-qa-service');
  if(active&&!approved){
    process.stdout.write(safeObject({state:'BLOCKED',
      reason:'EXPLICIT_INTERNAL_SERVICE_ACTIVATION_CONSENT_REQUIRED',
      no_services_changed:true}));
    process.exitCode=2;
  }else{
    try{
      const data=active?await activateEo001({pin}):preflight({pin});
      process.stdout.write(safeObject(data));
    }catch(e){
      process.stdout.write(safeObject({state:'BLOCKED',
        reason:/^[A-Z0-9_]+$/.test(e?.message)?e.message:'FIELD_ADMISSION_CHECK_FAILED',
        no_external_send:true,no_model_run:true}));
      process.exitCode=2;
    }
  }
}
