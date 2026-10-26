#!/usr/bin/env node
/**
 * NextGen local Compute/Yard/Browser Worker canary. No remote agent admission.
 * Each run uses a short-lived NodeSeed and ephemeral, untrusted device key.
 * Never exposes a public listener, authenticates to an agency, or runs shell tasks.
 */
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {startNodeSeed} from '../systemia/compute/node-seed.mjs';
import {YardOperator} from '../systemia/yard/operator.mjs';
import {prepareNativeBrowserRuntime} from '../systemia/evercraft-web/browser-worker/native-runtime.mjs';
import {requireNextGenLocal,verifyPublicBrowserEvidence,sanitizeNode002AgentStatus} from './nextgen-browser-commission.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const STATE=path.join(os.homedir(),'.local/state/evercraft-nextgen-yard-browser-proof');
const BROWSER_STATE=path.join(os.homedir(),'.local/state/evercraft-nextgen-browser');
const BROWSER_SOURCE=path.join(ROOT,'systemia/evercraft-web/browser-worker');
const TARGET='https://www.dshs.wa.gov/information-potential-medicaid-contractors';
const NODE='evercraft-node002-nextgen-yard-local-proof';
const DEPLOYMENT='nextgen-yard-browser-local-only';
const WORKLOAD='systemia.evercraft-web-browser.v1';
const HASH=/^(?:sha256:)?[a-f0-9]{64}$/;
const digest=x=>'sha256:'+crypto.createHash('sha256').update(x).digest('hex');

export function verifyLocalYardMilestone({seed,deployment,route,attestation,invoke,verified,negativeBlocked}={}){
  if(seed?.node_id!==NODE||!HASH.test(seed.device_fingerprint||''))throw Error('yard_local_seed_identity_missing');
  if(deployment?.receipt?.capacity_node_id!==NODE||
     deployment?.receipt?.capacity_device_fingerprint!==seed.device_fingerprint||
     deployment?.receipt?.workload_class!==WORKLOAD||
     deployment?.receipt?.attestation_supported!==true||
     !HASH.test(deployment?.receipt?.receipt_hash||''))throw Error('yard_local_deployment_unverified');
  if(route?.ok!==true||route?.health?.deployment_receipt_ref!==deployment.receipt.receipt_hash||
     route?.health?.service!=='evercraft-owned-browser-worker')throw Error('yard_local_health_receipt_not_bound');
  if(attestation?.identity_verified!==true||attestation?.device_fingerprint!==seed.device_fingerprint||
     attestation?.node_id!==NODE||attestation?.field_verified!==false)throw Error('yard_local_ephemeral_identity_not_verified');
  if(invoke?.ok!==true||invoke?.deployment_id!==DEPLOYMENT||
     !HASH.test(invoke?.compute_receipt_hash||'')||verified?.verified!==true||
     verified?.target_origin!=='https://www.dshs.wa.gov'||verified?.http_status!==200)throw Error('yard_local_browser_job_not_verified');
  if(negativeBlocked!==true)throw Error('yard_local_private_target_not_rejected');
  return {
    stage:'passed_local_compute_yard_browser',
    local_nodeseed_lease_verified:true,
    local_yard_health_receipt_bound:true,
    software_key_attestation_verified:true,
    ephemeral_identity_not_enrolled:true,
    device_hardware_attested:false,
    field_enrollment_verified:false,
    compute_browser_job_receipt:invoke.compute_receipt_hash,
    browser_evidence_receipt:verified.evidence_receipt_sha256,
    private_target_rejection_verified:true,
    systemia_remote_admission_verified:false,
    saban_remote_dispatch_verified:false,
    agent_remote_jobs_changed:false,
    user_portal_login:false,
    public_route_verified:false,
    procurement_application_submitted:false,
    resident_services_modified:false,
  };
}
function atomic(file,obj){
  fs.mkdirSync(STATE,{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(obj,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function readStatus(){
  try{
    const body=JSON.parse(fs.readFileSync(path.join(STATE,'last-run.json'),'utf8'));
    return {
      schema:'evercraft.node002.yard-browser-proof-status.v1',
      state:body.state||'unknown',
      source_commit:body.source_commit||null,
      observed_at:body.observed_at||null,
      receipt_hash:body.receipt_hash||null,
      local_compute_lease_verified:body.proof?.local_nodeseed_lease_verified===true,
      remote_dispatch_verified:false,
      production_identity_verified:false,
    };
  }catch{return {schema:'evercraft.node002.yard-browser-proof-status.v1',state:'never_run',remote_dispatch_verified:false,production_identity_verified:false};}
}
function release(){
  const r=spawnSync('git',['rev-parse','HEAD'],{
    cwd:ROOT,encoding:'utf8',timeout:3000,stdio:['ignore','pipe','ignore'],
  });
  const value=r.status===0?r.stdout.trim():'';
  if(!/^[a-f0-9]{40}$/.test(value))throw Error('immutable_git_release_ref_required');
  return value;
}
async function main(){
  const cmd=process.argv[2]||'--status';
  if(process.argv.length>3||!['--status','--run'].includes(cmd))throw Error('only_status_or_run_supported');
  if(cmd==='--status'){console.log(JSON.stringify(readStatus(),null,2));return;}
  requireNextGenLocal({hostname:os.hostname(),platform:process.platform});
  const commit=release();
  const prepared=await prepareNativeBrowserRuntime({
    sourceDir:BROWSER_SOURCE,stateDir:BROWSER_STATE,allowInstall:false,
  });
  if(prepared.ready!==true||typeof prepared.browserRuntimeFactory!=='function'){
    throw Error('browser_preflight_not_ready_run_prior_local_diagnostic');
  }

  // Session state is destroyed even after success. No persistent authorization token,
  // unapproved local identity or remote device registration is left behind.
  fs.mkdirSync(STATE,{recursive:true,mode:0o700});
  const session=fs.mkdtempSync(path.join(STATE,'session-'));
  const started=new Date().toISOString();
  let seed=null, yard=null, deployed=false, stopped=false, error=null, proof=null;
  try{
    const allocatorToken=crypto.randomBytes(32).toString('hex');
    seed=await startNodeSeed({
      root:path.join(session,'compute'),nodeId:NODE,
      host:'127.0.0.1',port:0,advertiseHost:'127.0.0.1',announce:false,
      allocatorToken,placementLabels:['private','local-proof'],
      browserRuntimeFactory:prepared.browserRuntimeFactory,
      remoteOperatorRoots:null,
    });
    if(seed.endpoint.startsWith('http://127.0.0.1:')!==true||seed.beacon!==null){
      throw Error('nodeseed_loopback_isolation_unproven');
    }
    yard=new YardOperator({stateDir:path.join(session,'yard')});
    const deployment=await yard.deployRelease({
      deploymentId:DEPLOYMENT,releaseRef:commit,
      workloadClass:WORKLOAD,capacityEndpoint:seed.endpoint,
      allocatorToken,input:{max_concurrency:1},leaseTtlMs:90000,
      rollbackTarget:'nextgen:local-only-no-publication',
    });
    deployed=true;
    const route=await yard.verifyRoute(DEPLOYMENT);
    const attestation=await yard.attestDeployment(DEPLOYMENT);
    const invoke=await yard.invokeBrowser(DEPLOYMENT,{
      url:TARGET,timeout_ms:25000,max_text_chars:12000,
      actions:[],include_screenshot:true,include_screenshot_base64:true,
    });
    const verified=verifyPublicBrowserEvidence(invoke.result);
    let negativeBlocked=false;
    try{
      await yard.invokeBrowser(DEPLOYMENT,{url:'http://127.0.0.1/',actions:[],timeout_ms:5000});
    }catch(e){negativeBlocked=/private_or_reserved_target/.test(String(e?.message||''));}
    proof=verifyLocalYardMilestone({
      seed,deployment,route,attestation,invoke,verified,negativeBlocked,
    });
  }catch(e){
    error=String(e?.message||e).slice(0,160);
  }finally{
    if(deployed&&yard){
      try{
        const stop=await yard.stopDeployment(DEPLOYMENT,{reason:'completed_local_proof'});
        stopped=stop?.state==='stopped';
      }catch{stopped=false;}
    }
    if(seed)await seed.close().catch(()=>{});
    fs.rmSync(session,{recursive:true,force:true});
  }
  const ok=Boolean(proof&&!error&&stopped);
  const body={
    schema:'evercraft.node002.local-compute-yard-browser-receipt.v1',
    node_id:'evercraft-node002-nextgen',
    ephemeral_node_id:NODE,
    source_commit:commit,
    observed_at:started,
    finished_at:new Date().toISOString(),
    state:ok?'passed_local_compute_yard_browser':'failed_closed',
    failure_reason:ok?null:error||(stopped?'unverified':'lease_stop_not_verified'),
    proof:ok?proof:null,
    lease_stopped:stopped,
    transient_key_state:'deleted_ephemeral',
    receipt_signature_state:'unsigned_local_summary',
    production_device_signature_verified:false,
    remote_agent_mode_unchanged:true,
    systemia_admission_performed:false,
    external_publish_performed:false,
  };
  body.receipt_hash=digest(JSON.stringify(body));
  atomic(path.join(STATE,'last-run.json'),body);
  console.log(JSON.stringify(body,null,2));
  if(!ok)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(e=>{
    console.error(JSON.stringify({
      state:'failed_closed',reason:String(e?.message||e).slice(0,140),
      no_remote_execution_authorized:true,
    }));
    process.exitCode=1;
  });
}
