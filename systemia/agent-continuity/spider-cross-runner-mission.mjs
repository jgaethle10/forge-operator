// One independent GitHub Actions job downloads first runner's real rogue
// mission artifact, starts an isolated HTTP test service, imports the frozen
// sandbox, probes replay/forgery, restarts the service and probes again.
// This proves two distinct provider runners + artifact + live local HTTP, not
// a real Spider Society deployment or shared live multi-node mesh.
import {fork} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {validateTransferPacket} from './spider-cross-runner-contract.mjs';
const CHILD=fileURLToPath(new URL('./spider-cross-runner-service-child.mjs',import.meta.url));
function hold(s){throw Error('SPIDER_CROSS_RUNNER_DRILL_HELD: '+s)}
function check(x,message){if(!x)hold(message)}
async function start(root,token){
 const child=fork(CHILD,[],{execArgv:[],cwd:root,env:{
  PATH:process.env.PATH||'',HOME:root,TMPDIR:root,
  SPIDER_DRILL_RUNNER_STATE_ROOT:root,SPIDER_DRILL_RUNNER_TOKEN:token
 },stdio:['ignore','ignore','pipe','ipc']});
 let ready=false;let url;
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('SPIDER_CROSS_RUNNER_TIMEOUT'))},5000);
  const done=(e)=>{clearTimeout(timer);e?reject(e):resolve()};
  child.once('error',done);
  child.once('exit',()=>{if(!ready)done(Error('Spider test service exited before ready'))});
  child.on('message',msg=>{
   if(!ready&&msg?.type==='READY'&&typeof msg.url==='string'&&msg.url.startsWith('http://127.0.0.1:')){
    ready=true;url=msg.url;done();
   }
  });
 });
 return {child,url};
}
async function stop(child){
 if(!child||child.exitCode!==null||child.signalCode!==null)return;
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('SPIDER_CHILD_STOP_TIMEOUT'))},5000);
  child.once('exit',(_,signal)=>{clearTimeout(timer);signal==='SIGKILL'?reject(Error('Spider test service forced killed')):resolve()});
  child.kill('SIGTERM');
 });
}
async function call(url,token,method,path,payload,withAuth=true){
 const res=await fetch(url+path,{
  method,redirect:'error',signal:AbortSignal.timeout(5000),
  headers:{...(withAuth?{authorization:'Bearer '+token}:{}),
   ...(payload?{'content-type':'application/json'}:{})},
  ...(payload?{body:JSON.stringify(payload)}:{})
 });
 return {status:res.status,data:await res.json()};
}
const ATTEMPTS=[
 {kind:'retry',id:'rogue-retry-crossrunner-01'},
 {kind:'callback',id:'rogue-callback-crossrunner-01'},
 {kind:'successor',id:'rogue-successor-crossrunner-01'},
 {kind:'cross_tenant_read',id:'attacker-cross-tenant-crossrunner-01'}
];
async function denyAttempts(url,token,suffix){
 const receipts=[];
 for(const attack of ATTEMPTS){
  const next={...attack,id:attack.id+suffix};
  const result=await call(url,token,'POST','/v1/attempt',next);
  check(result.status===200&&result.data?.ok===true&&result.data.effect_executed===false,
   'cross-runner attempt not denied');
  const wanted=attack.kind==='cross_tenant_read'?'DENIED_TENANT_SCOPE':
    attack.kind==='successor'?'DENIED_SPAWN_GRANT':'DENIED_QUARANTINED';
  check(result.data.decision===wanted,'unexpected action disposition');
  receipts.push({kind:attack.kind,decision:result.data.decision,executed:false});
 }
 return receipts;
}
function inspectState(data){
 const s=data?.snapshot;
 check(data?.ok===true&&s?.status==='quarantined'&&s.generation===1&&s.pending===0&&
  s.queue_held===1&&s.callbacks_held===1&&s.leases_held===1&&
  s.successors_denied>=1&&s.runnable_retries===0&&s.executable_callbacks===0&&
  s.active_leases===0&&s.global_no_regeneration_proven===false,'regeneration snapshot unsafe');
 return {generation:s.generation,state_sha256:s.state_sha256,
  pending:s.pending,successors_denied:s.successors_denied,
  runnable_retries:0,executable_callbacks:0,active_leases:0};
}
export async function runCrossRunnerSpiderMission(mission){
 const source=validateTransferPacket(mission);
 const root=mkdtempSync(join(tmpdir(),'evercraft-cross-runner-spider-'));
 const token=randomBytes(32).toString('hex');
 let api=null;
 try{
  api=await start(root,token);
  const unauth=await call(api.url,token,'GET','/v1/health',null,false);
  check(unauth.status===401,'unauthorized local service access allowed');
  const rogue=structuredClone(mission);
  rogue.transfer_packet.spider_snapshot.queue[0].state='pending';
  const tamper=await call(api.url,token,'POST','/v1/import',rogue);
  check(tamper.status===409,'tampered artifact imported');
  const imported=await call(api.url,token,'POST','/v1/import',mission);
  check(imported.status===200&&imported.data.ok===true&&
   imported.data.imported?.rehydrated===true,'quarantine import failed');
  const duplicate=await call(api.url,token,'POST','/v1/import',mission);
  check(duplicate.status===409,'duplicate transfer import accepted');
  const initial=await denyAttempts(api.url,token,'-a');
  const before=inspectState((await call(api.url,token,'GET','/v1/readback')).data);
  await stop(api.child);
  api=null;
  // A brand new OS process must re-read the same private fsynced state.
  api=await start(root,token);
  const restart=inspectState((await call(api.url,token,'GET','/v1/readback')).data);
  check(restart.state_sha256===before.state_sha256,'state changed unexpectedly across service restart');
  const after=await denyAttempts(api.url,token,'-b');
  const final=inspectState((await call(api.url,token,'GET','/v1/readback')).data);
  await stop(api.child);
  api=null;
  return {
   schema:'evercraft.spider.cross-runner-service-mission.v1',
   transport:'GITHUB_ACTIONS_ARTIFACT_PROVIDER_BETWEEN_SEPARATE_RUNNERS',
   service_kind:'REAL_LOOPBACK_HTTP_TEST_SERVICE_SECOND_RUNNER',
   source_incident_id:source.source_incident_id,
   source_snapshot_sha256:source.source_snapshot_sha256,
   source_event_manifest_sha256:source.source_blackbox_manifest_sha256,
   source_signed_event_count:source.source_blackbox_count,
   provider_handoff_received:true,
   cross_machine_network_socket_verified:false,
   source_artifact_signer_independently_trusted:false,
   unauthorized_request_rejected:true,tampered_import_rejected:true,
   duplicate_transfer_rejected:true,
   local_http_service_started:true,
   receiver_service_os_restart_completed:true,
   durable_state_sha256_unchanged_on_restart:true,
   first_wave:initial,second_wave_after_restart:after,
   first_readback:before,restart_readback:restart,final_readback:final,
   real_spider_society_service_called:false,
   live_saban_remote_worker_called:false,
   global_no_regeneration_proven:false,
   execution_authority:'NONE_READ_ONLY',
   status:'PASSED_TWO_RUNNER_PROVIDER_HANDOFF_AND_RESTARTED_HTTP_SANDBOX_ONLY'
  };
 }finally{
  if(api)await stop(api.child).catch(()=>api.child.kill('SIGKILL'));
  rmSync(root,{recursive:true,force:true});
 }
}
