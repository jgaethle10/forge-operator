#!/usr/bin/env node
/**
 * HP NextGen / Node002 local-only Browser Worker commissioning canary.
 * Reuses existing Evercraft native Chromium runtime. No remote shell, no Saban dispatch,
 * no portal credentials, form posts, agency applications, public listener or agent changes.
 */
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareNativeBrowserRuntime} from '../systemia/evercraft-web/browser-worker/native-runtime.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SOURCE=path.join(ROOT,'systemia/evercraft-web/browser-worker');
const STATE=path.join(os.homedir(),'.local/state/evercraft-nextgen-browser');
const TARGET_URL='https://www.dshs.wa.gov/information-potential-medicaid-contractors';
const ID='evercraft-node002-nextgen';
const SHA=/^[a-f0-9]{64}$/;

const sha256=v=>crypto.createHash('sha256').update(v).digest('hex');

export function requireNextGenLocal({hostname,platform}){
  if(String(hostname||'').toLowerCase()!=='nextgen'||platform!=='linux'){
    throw new Error('physical_nextgen_linux_required');
  }
  return true;
}

export function sanitizeNode002AgentStatus(json){
  if(!json||typeof json!=='object'||Array.isArray(json))return {state:'unavailable'};
  return {
    state:'observed_local',
    config_mode:typeof json.config_mode==='string'?json.config_mode.slice(0,50):null,
    remote_jobs_enabled:typeof json.remote_jobs_enabled==='boolean'?json.remote_jobs_enabled:null,
    telemetry_state:typeof json.status?.telemetry_state==='string'?json.status.telemetry_state.slice(0,100):null,
  };
}

export function verifyPublicBrowserEvidence(result){
  if(result?.ok!==true||result.engine!=='evercraft-owned-browser-worker-v1'||result.mode!=='public_read_only'){
    throw new Error('owned_browser_evidence_identity_failed');
  }
  const methods=result.boundaries?.allowed_network_methods;
  if(!Array.isArray(methods)||methods.join(',')!=='GET,HEAD,OPTIONS'||
     result.boundaries?.form_submit_action_supported!==false||
     result.boundaries?.arbitrary_click_action_supported!==false||
     result.boundaries?.private_and_reserved_targets_blocked!==true){
    throw new Error('read_only_browser_boundary_failed');
  }
  if(result.requested_url!==TARGET_URL||result.http_status!==200||
     !SHA.test(result.text_sha256||'')||!SHA.test(result.screenshot_sha256||'')||
     !SHA.test(result.evidence_receipt_sha256||'')){
    throw new Error('browser_result_or_target_mismatch');
  }
  if(sha256(String(result.snapshot?.text||''))!==result.text_sha256){
    throw new Error('page_text_digest_mismatch');
  }
  const img=result.screenshot?.base64;
  if(!img||sha256(Buffer.from(img,'base64'))!==result.screenshot_sha256){
    throw new Error('screenshot_digest_mismatch');
  }
  // Construct exact worker evidence schema. Ignore page content/URLs from blocked subrequests.
  const evidence={
    engine:result.engine,mode:result.mode,requested_url:result.requested_url,
    final_url:result.final_url,http_status:result.http_status,title:result.title,
    text_sha256:result.text_sha256,screenshot_sha256:result.screenshot_sha256,
    actions:result.actions,blocked_network_events:result.blocked_network_events,
    console_errors:result.console_errors,started_at:result.started_at,
    finished_at:result.finished_at,duration_ms:result.duration_ms,boundaries:result.boundaries,
  };
  if(sha256(JSON.stringify(evidence))!==result.evidence_receipt_sha256){
    throw new Error('browser_receipt_digest_mismatch');
  }
  return {
    verified:true,
    engine:result.engine,
    target_origin:new URL(result.requested_url).origin,
    http_status:result.http_status,
    text_sha256:result.text_sha256,
    screenshot_sha256:result.screenshot_sha256,
    evidence_receipt_sha256:result.evidence_receipt_sha256,
  };
}

function localAgentStatus(){
  const f=path.join(os.homedir(),'.local/share/evercraft/node002-agent/app/node002-agent.mjs');
  if(!fs.existsSync(f))return {state:'node002_agent_not_found'};
  const p=spawnSync(process.execPath,[f,'status'],{
    encoding:'utf8',timeout:4000,maxBuffer:32768,stdio:['ignore','pipe','ignore'],
  });
  if(p.status!==0||p.error)return {state:'status_unavailable'};
  try{return sanitizeNode002AgentStatus(JSON.parse(p.stdout));}
  catch{return {state:'status_unparseable'};}
}
function save(file,value){
  fs.mkdirSync(STATE,{recursive:true,mode:0o700});
  const full=path.join(STATE,file);
  const temp=full+'.'+process.pid+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(temp,full);
}
function read(file){
  try{return JSON.parse(fs.readFileSync(path.join(STATE,file),'utf8'));}
  catch{return null;}
}
function compactStatus(){
  const p=read('last-run.json');
  return {
    schema:'evercraft.nextgen.browser-local-status.v1',
    observed_hostname:os.hostname(),
    physical_node_claim_allowed:os.hostname().toLowerCase()==='nextgen'&&process.platform==='linux',
    agent:localAgentStatus(),
    last_run:p?{
      status:p.status,observed_at:p.observed_at,source_commit:p.source_commit,
      receipt_hash:p.receipt_hash,reason:p.reason||null,
    }:null,
    remote_dispatch_authority_granted_by_this_script:false,
  };
}
function getCommit(){
  const p=spawnSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8',timeout:3000});
  return p.status===0?p.stdout.trim():null;
}
async function main(){
  const command=process.argv[2]||'--status';
  if(process.argv.length>3||!['--status','--preflight','--install','--run'].includes(command)){
    throw new Error('supported_args_status_preflight_install_run_only');
  }
  if(command==='--status'){console.log(JSON.stringify(compactStatus(),null,2));return;}

  requireNextGenLocal({hostname:os.hostname(),platform:process.platform});
  const preflight=await prepareNativeBrowserRuntime({
    sourceDir:SOURCE,stateDir:STATE,allowInstall:command==='--install',
  });
  if(command==='--preflight'||command==='--install'){
    console.log(JSON.stringify({
      schema:preflight.schema,ready:preflight.ready,install_attempted:preflight.install_attempted,
      install_state:preflight.install_state,reason:preflight.reason||null,
      receipt_hash:preflight.receipt_hash,authority:'local_user_only',
      remote_jobs_enabled_by_this_script:false,
    },null,2));
    if(!preflight.ready)process.exitCode=1;
    return;
  }

  if(!preflight.ready||typeof preflight.browserRuntimeFactory!=='function'){
    throw new Error('native_browser_not_installed_run_preflight_then_explicit_install');
  }
  const body={
    schema:'evercraft.node002.browser-public-canary.v1',
    node_id:ID,observed_hostname:os.hostname(),mode:'local_read_only',
    source_commit:getCommit(),observed_at:new Date().toISOString(),
    target_origin:new URL(TARGET_URL).origin,
    agent:localAgentStatus(),state:'pending',
    remote_work_admission_verified:false,
    cross_node_dispatch_verified:false,
    human_authenticated_handoff_verified:false,
    agency_login_performed:false,form_fields_filled:0,
    portal_application_submitted:false,fees_paid:false,
    receipt_signature_state:'unsigned_local',
  };
  let runtime=null;
  try{
    runtime=await preflight.browserRuntimeFactory({maxConcurrency:1});
    const health=await runtime.health();
    if(health.ok!==true||health.service!=='evercraft-owned-browser-worker'||
       health.execution_mode!=='native_user_playwright'){
      throw new Error('native_worker_health_contract_failed');
    }
    const result=await runtime.browse({
      url:TARGET_URL,timeout_ms:25000,max_text_chars:12000,
      include_screenshot:true,include_screenshot_base64:true,actions:[],
    });
    body.public_observation=verifyPublicBrowserEvidence(result);
    let blocked=false;
    try{
      await runtime.browse({url:'http://127.0.0.1/',timeout_ms:5000,actions:[]});
    }catch(e){
      if(/private_or_reserved_target/.test(String(e?.message||'')))blocked=true;
    }
    if(!blocked)throw new Error('private_target_rejection_unproven');
    body.private_target_rejection_verified=true;
    body.state='passed_local_browser_canary';
  }catch(error){
    body.state='failed_closed';
    body.reason=String(error?.message||error).slice(0,160);
    process.exitCode=1;
  }finally{
    if(runtime)await runtime.close().catch(()=>{});
  }
  body.finished_at=new Date().toISOString();
  body.receipt_hash='sha256:'+sha256(JSON.stringify(body));
  save('last-run.json',body);
  console.log(JSON.stringify(body,null,2));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{
    console.error(JSON.stringify({state:'failed_closed',reason:String(error?.message||error).slice(0,160),network_listener_started:false}));
    process.exitCode=1;
  });
}
