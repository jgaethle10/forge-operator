#!/usr/bin/env node
/**
 * NextGen physical dispatch inventory, READ-ONLY.
 *
 * No package installation, credential output, broker POSTs, public HTTP,
 * remote job dispatch, service restarts, agent configuration or file mutation.
 * This intentionally does not claim hardware attestation or production readiness.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {requireNextGenLocal,sanitizeNode002AgentStatus} from './nextgen-browser-commission.mjs';

const NODE='evercraft-node002-nextgen';
const HOME=os.homedir();
const ORGANISM_ROOT=path.join(HOME,'.local/state/evercraft/organism');
const CONFIG_FILE=path.join(HOME,'.config/evercraft/local-organism.env');
const AGENT_FILE=path.join(HOME,'.local/share/evercraft/node002-agent/app/node002-agent.mjs');
const LOCAL_PROOF=path.join(HOME,'.local/state/evercraft-nextgen-yard-browser-proof/last-run.json');
const LOCAL_ORGANISM=path.join(ORGANISM_ROOT,'local-organism-receipt.json');
const NODESEED=path.join(ORGANISM_ROOT,'compute/nodeseed-receipt.json');
const ENROLLMENT=path.join(ORGANISM_ROOT,'remote-admission-request.json');
const HEALTH=path.join(ORGANISM_ROOT,'health-watch.json');

function staticRegularFile(file){
  try{
    const s=fs.lstatSync(file);
    return s.isFile()&&s.size>0&&s.size<131072&&!s.isSymbolicLink();
  }catch{return false;}
}
function jsonFile(file){
  if(!staticRegularFile(file))return null;
  try{return JSON.parse(fs.readFileSync(file,'utf8'));}
  catch{return null;}
}
function keyPresent(env,key){
  if(!staticRegularFile(env))return false;
  try{
    const raw=fs.readFileSync(env,'utf8');
    // Do not render actual environment lines, origins, tokens or secret values.
    return raw.split(/\r?\n/).some(line=>{
      const [name,value]=line.split('=',2);
      return name===key&&Boolean(String(value||'').trim());
    });
  }catch{return false;}
}
function selectedServiceState(){
  const p=spawnSync('systemctl',['--user','is-active','evercraft-local-organism.service'],{
    encoding:'utf8',timeout:3500,stdio:['ignore','pipe','ignore'],maxBuffer:2048,
  });
  const actual=String(p.stdout||'').trim();
  return ['active','inactive','failed','activating','deactivating'].includes(actual)
    ? actual:'unknown';
}
function readAgent(){
  if(!staticRegularFile(AGENT_FILE))return {state:'node002_agent_not_found'};
  const p=spawnSync(process.execPath,[AGENT_FILE,'status'],{
    encoding:'utf8',timeout:3500,stdio:['ignore','pipe','ignore'],maxBuffer:32768,
  });
  if(p.status!==0||p.error)return {state:'node002_agent_status_failed'};
  try{return sanitizeNode002AgentStatus(JSON.parse(p.stdout));}
  catch{return {state:'node002_agent_status_unparseable'};}
}

export function projectNextGenDispatchInventory({
  agent,organism,seed,health,localProof,
  remoteBrokerConfigPresent=false,
  remoteOperatorConfigEnabled=false,
  enrollmentRequestExists=false,
  organismServiceState='unknown',
  observedAt=new Date().toISOString(),
}={}){
  const localProofPassed=
    localProof?.schema==='evercraft.node002.local-compute-yard-browser-receipt.v1' &&
    localProof?.node_id===NODE &&
    localProof?.state==='passed_local_compute_yard_browser' &&
    localProof?.lease_stopped===true &&
    localProof?.proof?.private_target_rejection_verified===true &&
    localProof?.proof?.systemia_remote_admission_verified===false;
  const hostSeed=Boolean(
    seed?.schema==='evercraft.compute.nodeseed-receipt.v1' &&
    typeof seed.node_id==='string'&&
    seed.endpoint?.startsWith('http://127.0.0.1:')
  );
  const organismReportedRemote=organism?.remote_admission?.configured===true;
  const operatorEnabledByReceipt=organism?.remote_operator?.enabled===true;
  const localHealth=health?.nodeseed_health?.ok===true;
  const shadowTelemetryError=typeof agent?.telemetry_state==='string'?
    agent.telemetry_state.startsWith('FAILED_CLOSED:shadow_signed_ingest_rejected_402'):false;
  return {
    schema:'evercraft.node002.dispatch-inventory.v1',
    observed_at:observedAt,
    node_id:NODE,
    evidence_source:'physical_local_read_only_projection',
    agent:{
      state:agent?.state||'unavailable',
      mode:agent?.config_mode||null,
      remote_jobs_enabled:agent?.remote_jobs_enabled??null,
      telemetry_state:agent?.telemetry_state||null,
      shadow_telemetry_http_402_observed:shadowTelemetryError,
    },
    local_compute:{
      previous_yard_browser_proof_passed:localProofPassed,
      previous_proof_has_production_device_signature:false,
      resident_organism_service_state:organismServiceState,
      resident_organism_receipt_present:Boolean(organism),
      resident_nodeseed_receipt_present:Boolean(seed),
      resident_nodeseed_loopback_claim:hostSeed,
      resident_health_watch_state:health?.state||null,
      resident_health_watch_nodeseed_ok:localHealth,
    },
    outbound_broker:{
      configured_in_private_user_environment:remoteBrokerConfigPresent,
      configured_in_organism_receipt:organismReportedRemote,
      enrollment_request_file_present:enrollmentRequestExists,
      operator_opted_in_in_private_environment:remoteOperatorConfigEnabled,
      operator_enabled_in_organism_receipt:operatorEnabledByReceipt,
      production_broker_reachable:'not_tested',
      remote_device_authorized:'not_tested',
      signed_cross_node_lease_verified:false,
      signed_result_on_production_identity_verified:false,
    },
    scope:{
      inbound_ports_opened:false,
      credentials_or_config_values_exposed:false,
      remote_dispatch_attempted:false,
      services_modified:false,
      agency_application_submitted:false,
    },
    next_gate:!remoteBrokerConfigPresent&&!organismReportedRemote
      ? 'independently_verify_existing_authorized_broker_origin'
      : !enrollmentRequestExists
        ? 'inspect_local_organism_enrollment_request_custody_without_secrets'
        : 'inspect_broker_trust_grant_using_independent_authorized_status',
  };
}
async function main(){
  if(process.argv.length!==3||process.argv[2]!=='--report')throw Error('only_read_only_report_supported');
  requireNextGenLocal({hostname:os.hostname(),platform:process.platform});
  const local=projectNextGenDispatchInventory({
    agent:readAgent(),
    organism:jsonFile(LOCAL_ORGANISM),
    seed:jsonFile(NODESEED),
    health:jsonFile(HEALTH),
    localProof:jsonFile(LOCAL_PROOF),
    remoteBrokerConfigPresent:keyPresent(CONFIG_FILE,'EVERCRAFT_REMOTE_BROKER_URL'),
    remoteOperatorConfigEnabled:(
      staticRegularFile(CONFIG_FILE)&&
      fs.readFileSync(CONFIG_FILE,'utf8').split(/\r?\n/).some(
        line=>line.trim()==='EVERCRAFT_REMOTE_OPERATOR_ENABLED=true'
      )
    ),
    enrollmentRequestExists:staticRegularFile(ENROLLMENT),
    organismServiceState:selectedServiceState(),
  });
  process.stdout.write(JSON.stringify(local,null,2)+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(e=>{
    process.stderr.write(JSON.stringify({state:'failed_closed',reason:String(e?.message||e).slice(0,100),authority:'read_only'})+'\n');
    process.exitCode=1;
  });
}
