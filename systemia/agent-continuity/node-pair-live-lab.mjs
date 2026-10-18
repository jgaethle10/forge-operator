// Actual local HTTP challenge-response against TWO independently running
// Evercraft NodeSeed OS processes. Parent creates transient test pins only.
// Nothing in this CI test is owner enrollment or proof of separate machines.
import {fork} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {probePinnedNodePair} from './pinned-nodeseed-pair.mjs';

const RUNNER=fileURLToPath(new URL('./node-pair-fixture-child.mjs',import.meta.url));
function hold(s){throw Error('NODESEED_PAIR_LIVE_LAB_HELD: '+s)}
function ensure(condition,reason){if(!condition)hold(reason)}
async function startOne(root,node_id,token){
 mkdirSync(root,{recursive:true,mode:0o700});
 const child=fork(RUNNER,[],{cwd:root,execArgv:[],env:{
   PATH:process.env.PATH||'',HOME:root,TMPDIR:root,
   BLACKBOX_NODES_LAB_ONLY:'1',BLACKBOX_NODES_LAB_ID:node_id,
   BLACKBOX_NODES_LAB_ROOT:root,BLACKBOX_NODES_LAB_TOKEN:token
 },stdio:['ignore','ignore','pipe','ipc']});
 try{
  const meta=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('NodeSeed fixture startup timeout'))},10000);
   const done=(e,m)=>{clearTimeout(timer);if(e)reject(e);else resolve(m)};
   child.once('error',done);
   child.once('exit',()=>done(Error('NodeSeed fixture exited early')));
   child.once('message',m=>m?.type==='NODE_READY'?done(null,m):done(Error('Unexpected NodeSeed fixture IPC')));
  });
  ensure(meta.node_id===node_id&&meta.enrollment==='CI_EPHEMERAL_SELF_SIGNED_NOT_OWNER_ENROLLED'&&
    /^sha256:[a-f0-9]{64}$/.test(meta.fingerprint),'node fixture metadata missing');
  return {child,meta};
 }catch(e){child.kill('SIGKILL');throw e}
}
async function stop(child){
 if(!child||child.exitCode!==null||child.signalCode!==null)return;
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('NodeSeed shutdown timed out'))},5000);
  child.once('exit',()=>{clearTimeout(timer);resolve()});
  child.kill('SIGTERM');
 });
}
export async function withLabNodePair(test){
 const root=mkdtempSync(join(tmpdir(),'evercraft-pinned-two-nodeseed-'));
 const children=[],tokenByNode={};
 try{
  for(let i=0;i<2;i++){
   const node_id='saban-blackbox-fixture-node-00'+(i+1);
   const token=randomBytes(32).toString('hex');
   const obj=await startOne(join(root,'n'+i),node_id,token);
   children.push(obj);
   tokenByNode[node_id]=token;
  }
  const pins=children.map(({meta})=>({
   expected_node_id:meta.node_id,endpoint:meta.endpoint,
   expected_fingerprint:meta.fingerprint
  }));
  ensure(pins[0].expected_fingerprint!==pins[1].expected_fingerprint&&
    pins[0].endpoint!==pins[1].endpoint,'NodeSeed fixture identities not unique');
  const result=await test({pins,tokenByNode,children});
  return result;
 }finally{
  await Promise.all(children.map(c=>stop(c.child).catch(()=>c.child.kill('SIGKILL'))));
  rmSync(root,{recursive:true,force:true});
 }
}
export async function runPinnedNodeSeedPairLab(){
 return withLabNodePair(async({pins,tokenByNode})=>{
  const observed=await probePinnedNodePair({nodes:pins,tokenByNode});
  ensure(observed.two_distinct_pinned_keys_verified===true&&
    observed.challenge_response_observed===true&&
    observed.containment_release_authorized===false,'read-only attestation claims invalid');
  return {schema:'evercraft.blackbox.two-actual-nodeseed-process-lab.v1',
   local_node_seed_processes:2,actual_http_attestation_round_trips:2,
   distinct_signing_keys_verified:observed.two_distinct_pinned_keys_verified,
   node_ids:observed.identities.map(x=>x.node_id),
   transport:'TWO_LOOPBACK_ENDPOINTS_ON_ONE_CI_HOST',
   owner_pins_source:'CI_TEST_HARNESS_NOT_SEPARATE_OWNER_REGISTRY',
   real_hp_or_chromebook_involved:false,
   physically_distinct_hardware_verified:false,
   real_remote_spider_runtime_invoked:false,
   production_enrollment_verified:false,
   production_containment_authorized:false,
   authority:'NONE_READ_ONLY',
   result:'PASS_TWO_REAL_NODESEED_PROCESSES_CI_SINGLE_HOST_ONLY'};
 });
}
