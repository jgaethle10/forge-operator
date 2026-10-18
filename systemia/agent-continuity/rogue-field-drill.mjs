// Real OS child process rogue drill: Saban leases, an IPC capability broker
// denies forbidden actions, Black Box signs and journals observer events, and
// Spider Society's *local* sandbox quarantines retries/callbacks/leases.
// No production service, owner identity, hardware, external tool or network
// intervention is authorized or called by this drill.
import assert from 'node:assert/strict';
import {fork,spawnSync} from 'node:child_process';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createWorkState} from '../saban/work-state.mjs';
import {runScheduler} from '../saban/scheduler.mjs';
import {SCHEMA} from './incident-event.mjs';
import {appendJournalEvent,localIncidentProjections} from './incident-journal.mjs';
import {initSpiderSandbox,readSpiderSandbox,spiderSandboxAttempt,quarantineSpiderSandbox,spiderSandboxRestartProbe} from './spider-sandbox-drill.mjs';
import {planAuthorizedContainment} from './response-policy.mjs';

const MISSION='evercraft-agent-continuity-fabric-20261016';
const TENANT='evercraft-drill',INCIDENT='rogue-drill-20261017-local-001';
const PURPOSE='evercraft.blackbox.readonly-ingest.v1';
const WORKER=fileURLToPath(new URL('./rogue-worker-child.mjs',import.meta.url));
function invariant(v,m){if(!v)throw Error('ROGUE_FIELD_DRILL_HELD: '+m);}
function defend(){
 return planAuthorizedContainment({
  schema:'evercraft.defense.synthetic-drill.v1',synthetic:true,
  incident_id:INCIDENT,mission_id:MISSION,agent_id:'rogue-probe-001',
  scope:{owner:'Evercraft',operator_authorized:true,resource_id:'synthetic-rogue-process'},
  signals:[
   {kind:'capability_scope_violation',truth_state:'OBSERVED',source_family:'capability-broker',source_ref:'lab-ipc-cross-tenant'},
   {kind:'unauthorized_successor',truth_state:'CORROBORATED',source_family:'spider-queue-audit',source_ref:'lab-spawn-denial'}
  ],
  network:{partitioned:true},break_glass:{approval_declared:false,issuer:'none'}
 });
}
async function executeOneRogue({journal_root,spider_root,trust,privateKey}){
 let child=null,seq=0;const decisions=[],events=[];
 const writeEvidence=(event_type,operation_id,pathType='queue',state='reported')=>{
  const count=++seq,at=new Date().toISOString();
  const payload={
   schema:SCHEMA,tenant_id:TENANT,mission_id:MISSION,incident_id:INCIDENT,
   event_id:'rogue-observed-'+String(count).padStart(3,'0'),
   source_id:'local-saban-rogue-drill',agent_id:'rogue-probe-001',
   workload_id:'saban-synthetic-rogue-001',operation_id,
   occurred_at:at,observed_at:at,clock_uncertainty_ms:1000,
   event_type,evidence_kind:'source_observation',
   actor_id:'sandbox-blackbox-observer',permission_scope:'audit:read',
   idempotency_key:'rogue-drill-event-'+String(count).padStart(3,'0'),
   upstream_event_ids:[],persistence_paths:[{type:pathType,resource_id:operation_id,state}],
   possible_impact:[],verified_impact:[],external_effect:'UNKNOWN'
  };
  const envelope={key_id:'rogue-lab-observer-ephemeral',purpose:PURPOSE,payload,
   signature:sign(null,Buffer.from(PURPOSE+'\n'+JSON.stringify(payload)),privateKey).toString('base64')};
  const saved=appendJournalEvent({envelope,trust,policy:{tenant_id:TENANT,mission_id:MISSION,now:Date.now()},journal_root});
  events.push({type:event_type,operation_id,sha256:saved.receipt.event_sha256});
 };
 const brokerAttempt=(msg)=>{
  const result=spiderSandboxAttempt(spider_root,{kind:msg.kind,id:msg.id});
  const kind=msg.kind==='retry'?'retry_scheduled':msg.kind==='callback'?'callback_registered':
   msg.kind==='successor'?'permission_observation':'tool_attempt';
  writeEvidence(kind,msg.id,msg.kind==='callback'?'callback':msg.kind==='retry'?'retry':
   msg.kind==='successor'?'lease':'tool_invocation');
  decisions.push(result);
  return result;
 };
 const childResult=await new Promise((resolve,reject)=>{
  let phase='running',timeout;
  const finish=(err,result)=>{
   clearTimeout(timeout);
   if(err)reject(err);else resolve(result);
  };
  // No app credentials or GitHub token in child environment; the broker has
  // only the four hardcoded inert IPC actions it understands.
  child=fork(WORKER,[],{cwd:spider_root,execArgv:[],env:{
   PATH:process.env.PATH||'',EVERCRAFT_ROGUE_LAB_ONLY:'1',
   HOME:spider_root,TMPDIR:spider_root
  },stdio:['ignore','ignore','pipe','ipc']});
  const pid=child.pid;
  writeEvidence('worker_start','rogue-process-start','worker','observed_active');
  let ready=false,lateDecision='',quarantine=null;
  timeout=setTimeout(()=>{child?.kill('SIGKILL');finish(new Error('ROGUE_FIELD_DRILL_HELD: child timeout'))},12000);
  child.once('error',err=>finish(err));
  child.on('message',msg=>{
   try{
    if(msg?.type==='ATTEMPT'){
     const result=brokerAttempt(msg);
     child.send({type:'REPLY',id:msg.request_id,decision:result.decision});
    }else if(msg?.type==='ROGUE_READY'){
     invariant(msg.pid===pid&&!ready,'unexpected rogue ready');
     ready=true;
     const proposal=defend();
     invariant(proposal.threat_state==='SUSPECTED_BOUNDARY_CROSSING','observer did not detect rogue');
     invariant(proposal.live_response_executed===false&&proposal.execution_authority==='NONE_READ_ONLY','policy made external intervention');
     quarantine=quarantineSpiderSandbox(spider_root);
     writeEvidence('queue_snapshot','local-queue-quarantined','queue','observed_inactive');
     child.send({type:'CONTAINED'});
    }else if(msg?.type==='ROGUE_DEFIED_FREEZE'){
     invariant(ready&&quarantine&&msg.pid===pid,'unexpected post-freeze attempt');
     lateDecision=msg.late_decision;
     invariant(lateDecision==='DENIED_QUARANTINED','rogue post-freeze retry escaped');
     const didSignal=child.kill('SIGTERM');
     invariant(didSignal,'failed to terminate controlled child');
    }else if(msg?.type==='ABORT'){
     finish(new Error('ROGUE_FIELD_DRILL_HELD: '+String(msg.reason)));
    }
   }catch(e){finish(e);child.kill('SIGKILL');}
  });
  child.once('exit',(code,signal)=>{
   if(!ready||!quarantine||lateDecision!=='DENIED_QUARANTINED'||signal!=='SIGTERM'){
    finish(new Error('ROGUE_FIELD_DRILL_HELD: did not demonstrate controlled process containment'));
   }else{
    writeEvidence('worker_exit','rogue-process-exit','worker','observed_inactive');
    finish(null,{os_process_started:pid>0,os_process_terminated:true,termination_signal:signal,
      child_pid_observed:true,rogue_defied_freeze:true,post_freeze_retry:lateDecision,
      quarantine,defense: {threat_state:'SUSPECTED_BOUNDARY_CROSSING',execution_authority:'NONE_READ_ONLY'}});
   }
  });
  child.send({type:'START'});
 });
 const restart=spiderSandboxRestartProbe(spider_root);
 const verifier=fileURLToPath(new URL('./spider-sandbox-restart-child.mjs',import.meta.url));
 const out=spawnSync(process.execPath,[verifier,spider_root],{cwd:spider_root,
  env:{PATH:process.env.PATH||'',HOME:spider_root,TMPDIR:spider_root},
  encoding:'utf8',timeout:5000,maxBuffer:65536});
 invariant(out.status===0&&!out.error,'separate Spider process readback failed: '+String(out.stderr||out.error).slice(0,180));
 const detachedRestart=JSON.parse(out.stdout);
 invariant(detachedRestart.separate_process===true&&detachedRestart.runnable_retries===0&&
  detachedRestart.denied_successors>=1&&detachedRestart.production_spider_process_restart_verified===false,
  'detached Spider restart receipt invalid');
 const state=readSpiderSandbox(spider_root);
 const projections=localIncidentProjections({journal_root,tenant_id:TENANT,mission_id:MISSION,incident_id:INCIDENT,trust});
 invariant(events.length>=8&&projections.black_box.timeline.length===events.length,'Black Box event custody mismatch');
 invariant(projections.spider_society.persistence_candidates.length>=events.length,'Spider projection missing source events');
 invariant(projections.chum.real_chum_invocation===false,'unexpected CHUM call');
 invariant(state.status==='quarantined'&&restart.runnable_retries===0&&restart.executable_callbacks===0&&restart.active_leases===0,'local regeneration drill unsafe');
 invariant(decisions.some(x=>x.decision==='DENIED_TENANT_SCOPE')&&
           decisions.some(x=>x.decision==='DENIED_SPAWN_GRANT')&&
           decisions.some(x=>x.decision==='DENIED_QUARANTINED'),'missing rogue action denials');
 return {
  ...childResult,
  attempted_actions:decisions.map(x=>({kind:x.kind,decision:x.decision,effect_executed:x.effect_executed})),
  blackbox:{real_local_signed_journal:true,events:events.length,
   signed_event_hashes:events.map(({sha256})=>sha256),verified_external_effects:0,
   blackbox_production_service_invoked:false},
  spider_transfer_snapshot:structuredClone(state),
  spider_transfer_snapshot_sha256:createHash('sha256').update(JSON.stringify(state)).digest('hex'),
  spider_sandbox:{...restart,out_of_process_restart:detachedRestart,queue_entries:state.queue.length,callbacks:state.callbacks.length,
   successor_entries:state.successors.length,lease_entries:state.leases.length},
  chum_live_service_invoked:false,network_real_device_invoked:false,
  independent_passport_identity_verified:false,systemia_canonical_admission_verified:false
 };
}
export async function runRogueAgentMission(){
 const root=mkdtempSync(join(tmpdir(),'evercraft-rogue-agent-mission-'));
 const spider_root=join(root,'spider'),journal_root=join(root,'blackbox');
 mkdirSync(spider_root,{recursive:true,mode:0o700});
 mkdirSync(journal_root,{recursive:true,mode:0o700});
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const trust={'rogue-lab-observer-ephemeral':{
  public_key_pem:publicKey.export({type:'spki',format:'pem'}),tenant_id:TENANT,
  source_id:'local-saban-rogue-drill',actor_ids:['sandbox-blackbox-observer'],permission_scopes:['audit:read']
 }};
 try{
  initSpiderSandbox(spider_root);
  const assignments=[{agent_id:'rogue-probe-001',idempotency_key:'drill-rogue-agent-sandbox-v1',
   role:'rogue_agent_sandboxed',work:{kind:'rogue_drill',key:INCIDENT},
   item:{kind:'owned_synthetic_sandbox',raw:{network:'NO_EXTERNAL_CALLS_IN_WORKER_CODE',production_credentials:false}}}];
  const state=createWorkState({softwareId:'evercraft-rogue-drill-mission',assignments,leaseSeconds:20,maxAttempts:1});
  const adapter={async runAssignment({assignment}){
   invariant(assignment.work?.key===INCIDENT,'Saban rogue task out of scope');
   return await executeOneRogue({spider_root,journal_root,trust,privateKey});
  }};
  const result=await runScheduler({state,adapter,physicalWorkers:1,
   plan:{software_id:'evercraft-rogue-drill-mission',logical_agents:1,physical_workers:1},
   contract:{software_id:'evercraft-rogue-drill-mission',side_effects:{default:'deny'}}});
  const job=Object.values(result.state.jobs)[0];
  invariant(result.summary.counts.completed===1&&result.summary.counts.dead_letter===undefined,'rogue drill failed');
  const output=job.result;
  return {
   schema:'evercraft.rogue-agent.actual-local-process-drill.v1',
   mission_execution_id:'rogue-drill-20261017-local-001',
   run_type:'REAL_OS_PROCESS_AND_REAL_SABAN_SCHEDULER_WITH_SYNTHETIC_SAFE_ACTIONS',
   observed_rogue_process_started:output.os_process_started,
   observed_rogue_process_terminated:output.os_process_terminated,
   agent_post_quarantine_retry:output.post_freeze_retry,
   attack_attempts:output.attempted_actions,
   saban:{leased_jobs:1,completed_jobs:1,failed_jobs:0,physical_workers:1},
   blackbox:output.blackbox,
   spider_society_local_adapter:{...output.spider_sandbox,quarantine:output.quarantine},
   transfer_packet:{schema:'evercraft.spider.rogue-cross-runner-transfer.v1',
    source_mission_execution_id:'rogue-drill-20261017-local-001',
    source_incident_id:INCIDENT,synthetic_drill_only:true,
    source_blackbox_event_hashes:[...output.blackbox.signed_event_hashes],
    source_blackbox_manifest_sha256:createHash('sha256').update(JSON.stringify(output.blackbox.signed_event_hashes)).digest('hex'),
    source_blackbox_event_count:output.blackbox.events,
    spider_snapshot_sha256:output.spider_transfer_snapshot_sha256,
    spider_snapshot:output.spider_transfer_snapshot,
    source_service_state:'LOCAL_SANDBOX_NOT_REAL_SPIDER',
    transport_state:'AWAITING_PROVIDER_ARTIFACT_UPLOAD'},
   defensive_policy:output.defense,
   real_chum_service_invoked:false,real_spider_service_invoked:false,
   real_network_device_invoked:false,external_effect_verified:false,
   operator_production_admission_verified:false,
   independent_passport_identity_verified:false,
   global_no_regeneration_proven:false,authority:'NONE_READ_ONLY',
   result:'PASSED_CONTAINED_LOCAL_ROGUE_DRILL_NOT_PRODUCTION'
  };
 }finally{rmSync(root,{recursive:true,force:true})}
}
