#!/usr/bin/env node
// Read-only broker source staging preflight. Never installs code or alters services.
// An eligible result permits *review* of a separate single-file installation,
// never a broker restart, deployment, credential change or new device admission.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export const BROKER_SOURCE='/opt/evercraft/forge-operator/systemia/yard/remote-broker-resident.mjs';
export const BROKER_UNIT='evercraft-remote-broker-resident.service';
const RUN_ROOT='/opt/evercraft/forge-operator';
const PINNED_LAUNCHER_BLOB='c546293e947a99ca784b804c8065b27abf580f3b';
const SOURCE_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const CANDIDATE=path.join(SOURCE_ROOT,'systemia/yard/remote-broker-resident.mjs');
const API=['deploymentStatus','renewDeploymentLease','deployRelease','verifyRoute','stopDeployment'];

function show(prop){
  try{return execFileSync('systemctl',['show',BROKER_UNIT,'-p',prop,'--value'],{
    encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore'],
  }).trim();}catch{return '';}
}
function gitBlob(file){
  try{
    const bytes=fs.readFileSync(file);
    const h=createHash('sha1');
    h.update('blob '+bytes.length+'\0');
    h.update(bytes);
    return h.digest('hex');
  }catch{return null;}
}
function fileInfo(file){
  try{
    const stat=fs.lstatSync(file);
    return {exists:true,regular:stat.isFile()&&!stat.isSymbolicLink(),symlink:stat.isSymbolicLink()};
  }catch{return {exists:false,regular:false,symlink:false};}
}
function cleanEntrypoint(value){
  const match=String(value).match(/\bargv\[\]=([^;]*)/);
  const candidates=(match?.[1]||'').match(/\/[a-zA-Z0-9_./-]+\.mjs\b/g)||[];
  return candidates.length===1&&candidates[0]===BROKER_SOURCE;
}
export function evaluateBrokerSourceStage(facts={}){
  const reasons=[];
  if(facts.unit_loaded!==true)reasons.push('unit_not_loaded');
  if(facts.active!==true)reasons.push('broker_not_active');
  if(!Number.isInteger(facts.pid)||facts.pid<=0)reasons.push('broker_pid_invalid');
  if(facts.account!=='evercraft'||facts.group!=='evercraft')reasons.push('broker_account_mismatch');
  if(facts.cwd!==RUN_ROOT)reasons.push('broker_workdir_mismatch');
  if(facts.unit_entrypoint_ok!==true)reasons.push('broker_unit_entrypoint_mismatch');
  if(facts.running_entrypoint_ok!==true)reasons.push('broker_running_entrypoint_mismatch');
  if(facts.installed_target_missing!==true)reasons.push('target_no_longer_missing');
  if(facts.candidate_regular!==true)reasons.push('candidate_not_regular');
  if(facts.candidate_blob!==PINNED_LAUNCHER_BLOB)reasons.push('candidate_source_not_pinned');
  if(facts.operator_regular!==true)reasons.push('operator_missing_or_unsafe');
  for(const name of API){
    if(!facts.operator_methods?.includes(name))reasons.push('operator_method_missing_'+name);
  }
  if(facts.nodeseed_active!==true)reasons.push('nodeseed_not_active');
  if(facts.updater_active===true)reasons.push('fabric_updater_active');
  if(facts.updater_state_unknown===true)reasons.push('fabric_updater_state_unknown');
  return {
    schema:'evercraft.yard.broker-source-stage-preflight.v1',
    stage_candidate_review_eligible:reasons.length===0,
    reasons,
    candidate_blob: facts.candidate_blob===PINNED_LAUNCHER_BLOB ? PINNED_LAUNCHER_BLOB : null,
    restart_authorized:false,
    identity_cutover_authorized:false,
    broker_deployment_authorized:false,
    unattended_dispatch_authorized:false,
    services_changed:false,filesystem_changed:false,secrets_read:false,
  };
}
export function inspectBrokerSourceStage(){
  const pid=Number(show('MainPID'));
  const op=path.join(RUN_ROOT,'systemia/yard/operator.mjs');
  const operator=fileInfo(op);
  let text='';
  if(operator.regular)text=fs.readFileSync(op,'utf8');
  const m=API.filter(name=>new RegExp('\\b(?:async\\s+)?'+name+'\\s*\\(').test(text));
  const candidate=fileInfo(CANDIDATE);
  const target=fileInfo(BROKER_SOURCE);
  let runningOk=false,cwd='';
  if(Number.isInteger(pid)&&pid>0){
    try{
      const args=fs.readFileSync('/proc/'+pid+'/cmdline','utf8').split('\0').filter(Boolean);
      runningOk=args.includes(BROKER_SOURCE);
      cwd=fs.readlinkSync('/proc/'+pid+'/cwd');
    }catch{}
  }
  const updater=execFileSync('systemctl',['show','evercraft-fabric-update.service',
    '-p','ActiveState','--value'],{encoding:'utf8',timeout:5000,
      stdio:['ignore','pipe','ignore']}).trim();
  return evaluateBrokerSourceStage({
    unit_loaded:show('LoadState')==='loaded',
    active:show('ActiveState')==='active',
    pid,account:show('User'),group:show('Group'),cwd,
    unit_entrypoint_ok:cleanEntrypoint(show('ExecStart')),
    running_entrypoint_ok:runningOk,
    installed_target_missing:!target.exists,
    candidate_regular:candidate.regular,
    candidate_blob:candidate.regular?gitBlob(CANDIDATE):null,
    operator_regular:operator.regular,operator_methods:m,
    nodeseed_active:execFileSync('systemctl',['is-active','evercraft-nodeseed.service'],
      {encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']}).trim()==='active',
    updater_active:updater==='active'||updater==='activating',
    updater_state_unknown:!['active','activating','inactive','failed'].includes(updater),
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.getuid?.()!==0)throw Error('sudo_required_for_read_only_source_preflight');
    const out=inspectBrokerSourceStage();
    console.log(JSON.stringify(out,null,2));
    process.exitCode=3; // never constitute authorization, even on eligible review
  }catch(error){
    console.error(JSON.stringify({schema:'evercraft.yard.broker-source-stage-preflight-error.v1',
      error:String(error?.message||'preflight_error').slice(0,80),filesystem_changed:false}));
    process.exitCode=2;
  }
}
