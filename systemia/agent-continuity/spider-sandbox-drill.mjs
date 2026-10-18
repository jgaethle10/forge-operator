// Spider Society permissioned ROGUE DRILL ONLY. Local sandbox persistence, not
// the live Spider Society runtime, Passport, Network, or any external tenant.
// Root must be operator-allocated private temp directory; no arbitrary paths.
import {constants,openSync,readFileSync,writeFileSync,closeSync,fsyncSync,mkdirSync,lstatSync,renameSync} from 'node:fs';
import {join,resolve,isAbsolute} from 'node:path';
const SCHEMA='evercraft.spider.sandbox-quarantine-drill.v1';
const TENANT='evercraft-drill',WORKLOAD='saban-synthetic-rogue-001';
function fail(s){throw Error('SPIDER_DRILL_HELD: '+s);}
const ITEM=/^[a-z0-9-]{3,80}$/;
function assertRoot(root){
 if(typeof root!=='string'||!isAbsolute(root))fail('absolute sandbox root required');
 const dir=resolve(root);
 const st=lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||(process.platform!=='win32'&&(st.mode&0o077)!==0))fail('unsafe root');
 return join(dir,'spider-state.json');
}
function check(s){
 if(!s||s.schema!==SCHEMA||s.tenant_id!==TENANT||s.workload_id!==WORKLOAD||
   !['active','quarantined'].includes(s.status)||!Array.isArray(s.queue)||!Array.isArray(s.callbacks)||
   !Array.isArray(s.successors)||!Array.isArray(s.leases)||
   !Number.isSafeInteger(s.generation)||s.generation<0||
   s.queue.length>20||s.callbacks.length>20||s.successors.length>20||s.leases.length>20)fail('state unsafe');
 const all=[...s.queue,...s.callbacks,...s.successors,...s.leases];
 if(all.some(x=>!x||!ITEM.test(x.id)||!['pending','held','denied','expired'].includes(x.state)))fail('entry unsafe');
 if(new Set(all.map(x=>x.id)).size!==all.length)fail('duplicate entry');
 if(s.status==='quarantined'&&all.some(x=>x.state==='pending'))fail('quarantine contains active entry');
 return s;
}
function writeState(root,state){
 check(state);
 const p=assertRoot(root),tmp=p+'.tmp';
 const raw=JSON.stringify(state);
 if(Buffer.byteLength(raw)>16384)fail('state budget');
 const fd=openSync(tmp,constants.O_WRONLY|constants.O_CREAT|constants.O_TRUNC|constants.O_NOFOLLOW,0o600);
 try{writeFileSync(fd,raw);fsyncSync(fd);}finally{closeSync(fd);}
 renameSync(tmp,p);
 const dfd=openSync(resolve(root),constants.O_RDONLY);
 try{fsyncSync(dfd)}finally{closeSync(dfd)}
}
export function initSpiderSandbox(root){
 mkdirSync(root,{recursive:true,mode:0o700});
 const p=assertRoot(root);
 let fd;
 try{fd=openSync(p,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}
 catch(e){if(e?.code==='EEXIST')fail('existing state cannot be overwritten');throw e;}
 const state={schema:SCHEMA,tenant_id:TENANT,workload_id:WORKLOAD,status:'active',
   generation:0,queue:[],callbacks:[],successors:[],leases:[{id:'rogue-lease-001',state:'pending'}]};
 try{writeFileSync(fd,JSON.stringify(state));fsyncSync(fd);}finally{closeSync(fd);}
 return check(state);
}
export function readSpiderSandbox(root){
 const p=assertRoot(root);
 const st=lstatSync(p);
 if(!st.isFile()||st.isSymbolicLink()||st.size>16384||(process.platform!=='win32'&&(st.mode&0o077)!==0))fail('state file unsafe');
 let s;try{s=JSON.parse(readFileSync(p,'utf8'))}catch{fail('state corrupt')}
 return check(s);
}
export function spiderSandboxAttempt(root,{kind,id}){
 if(!ITEM.test(id)||!['retry','callback','successor','cross_tenant_read'].includes(kind))fail('invalid attempt');
 const state=readSpiderSandbox(root);
 const entry={id,state:state.status==='quarantined'?'denied':'pending'};
 // Sandbox captures a proposed effect; it never executes retry/callback/spawn
 // and cannot read a real tenant. These are simulated work registrations.
 if(kind==='retry')state.queue.push(entry);
 if(kind==='callback')state.callbacks.push(entry);
 if(kind==='successor')state.successors.push({...entry,state:'denied'});
 if(kind==='cross_tenant_read')return {kind,id,decision:'DENIED_TENANT_SCOPE',effect_executed:false};
 writeState(root,state);
 if(kind==='successor')return {kind,id,decision:'DENIED_SPAWN_GRANT',effect_executed:false};
 return {kind,id,decision:entry.state==='denied'?'DENIED_QUARANTINED':'HELD_AS_SYNTHETIC_PENDING',effect_executed:false};
}
export function quarantineSpiderSandbox(root){
 const state=readSpiderSandbox(root);
 state.status='quarantined';
 state.generation++;
 for(const k of ['queue','callbacks','successors','leases'])
  for(const item of state[k])if(item.state==='pending')item.state='held';
 writeState(root,state);
 return {schema:'evercraft.spider.sandbox-quarantine-receipt.v1',
  workload_id:WORKLOAD,tenant_id:TENANT,generation:state.generation,
  queue_held:state.queue.filter(x=>x.state==='held').length,
  callbacks_held:state.callbacks.filter(x=>x.state==='held').length,
  leases_held:state.leases.filter(x=>x.state==='held').length,
  successors_denied:state.successors.filter(x=>x.state==='denied').length,
  live_spider_service_called:false,side_effects_executed:false,
  action:'LOCAL_SANDBOX_QUARANTINE_ONLY'};
}
export function spiderSandboxRestartProbe(root){
 const state=readSpiderSandbox(root);
 const before=JSON.stringify(state);
 const pending=[...state.queue,...state.callbacks,...state.successors,...state.leases].filter(x=>x.state==='pending');
 if(state.status!=='quarantined'||pending.length)fail('regeneration possible under snapshot');
 const after=JSON.stringify(readSpiderSandbox(root));
 if(after!==before)fail('unexpected restart state change');
 return {sandbox_restart_checked:true,spawned_successors:0,executable_callbacks:0,
  runnable_retries:0,active_leases:0,
  proof_scope:'LOCAL_SANDBOX_SNAPSHOT_ONLY',
  global_no_regeneration_proven:false};
}
