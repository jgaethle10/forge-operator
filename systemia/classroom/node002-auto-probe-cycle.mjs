// Optional resident heartbeat: a bounded Systemia/Yard classroom probe.
// Disabled by default, release/state scoped, no general remote control.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {dispatchClassroomNode002Probe} from './dispatch-node002-probe.mjs';

const SCHEMA='evercraft.classroom.systemia-autoprobe.v1';
function safeStateDir(directory){
 const st=fs.lstatSync(directory);
 if(st.isSymbolicLink()||!st.isDirectory()||(st.mode&0o077)!==0)
  throw Error('classroom_autoprobe_state_dir_not_private');
}
function readExisting(filename){
 if(!fs.existsSync(filename))return null;
 const st=fs.lstatSync(filename);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0)
  throw Error('classroom_autoprobe_receipt_unsafe');
 const record=JSON.parse(fs.readFileSync(filename,'utf8'));
 if(record.schema!==SCHEMA)throw Error('classroom_autoprobe_receipt_schema_invalid');
 return record;
}
function writePrivate(filename,receipt){
 const tmp=filename+'.'+randomBytes(6).toString('hex')+'.tmp';
 const fd=fs.openSync(tmp,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(receipt,null,2)+'\n');fs.fsyncSync(fd)}
 finally{fs.closeSync(fd)}
 fs.renameSync(tmp,filename);
}
export async function runClassroomAutoProbeCycle({
 enabled=false,operation='readiness',yard,brokerDeploymentId,
 verifiedBrokerRoute=null,allowLoopbackProof=false,
 stateDir,now=new Date(),
 dispatch=dispatchClassroomNode002Probe,
}={}){
 if(enabled!==true)return {state:'disabled',dispatch_attempted:false};
 if(!['readiness','synthetic_turn'].includes(operation))
  return {state:'held',reason:'classroom_operation_not_allowed',dispatch_attempted:false};
 if(!stateDir)throw Error('classroom_autoprobe_state_required');
 const root=path.resolve(stateDir);
 safeStateDir(root);
 const file=path.join(root,'classroom-node002-autoprobe-'+operation+'.json');
 const previous=readExisting(file);
 const time=now instanceof Date?now:new Date(now);
 if(!Number.isFinite(time.getTime()))throw Error('classroom_autoprobe_time_invalid');
 const freshness=operation==='readiness'?60*60*1000:24*60*60*1000;
 if(previous?.state==='passed'&&
    Date.parse(previous.checked_at)<=time.getTime()&&
    time.getTime()-Date.parse(previous.checked_at)<freshness){
  return {state:'already_fresh',dispatch_attempted:false,
   checked_at:previous.checked_at,
   remote_receipt_hash:previous.remote_receipt_hash||null};
 }
 // A held cycle is not retried on every scheduled heartbeat.
 if(previous?.state==='held'&&
    Date.parse(previous.checked_at)<=time.getTime()&&
    time.getTime()-Date.parse(previous.checked_at)<15*60*1000)
  return {state:'held_cooldown',dispatch_attempted:false};
 const header={schema:SCHEMA,checked_at:time.toISOString(),
  operation,remote_worker_release_attested:false,
  public_classroom_ready:false,child_safety_certified:false};
 if(!verifiedBrokerRoute?.origin){
  const held={...header,state:'held',reason:'classroom_verified_broker_route_required'};
  writePrivate(file,held);
  return {state:'held',reason:held.reason,dispatch_attempted:false};
 }
 let receipt=null,reason='';
 try{
  receipt=await dispatch({yard,brokerDeploymentId,
   brokerOrigin:verifiedBrokerRoute.origin,operation,
   allowLoopbackProof:allowLoopbackProof===true});
  if(receipt.status!=='SCOPED_NODE002_MODEL_PROBE_OBSERVED'||
     receipt.operation!==operation||receipt.no_child_data!==true||
     !/^sha256:[a-f0-9]{64}$/.test(receipt.receipt_hash||''))
    throw Error('classroom_autoprobe_receipt_unverified');
 }catch(error){
  const code=String(error?.message||'');
  reason=/^classroom_[a-z0-9_]+$/.test(code)?code:'classroom_dispatch_unavailable';
 }
 const record=receipt?
  {...header,state:'passed',remote_receipt_hash:receipt.receipt_hash,
   remote_model_response_observed:receipt.model_response_observed===true,
   control_grant_receipt_hash:receipt.control_grant_receipt_hash,
   compute_receipt_hash:receipt.compute_receipt_hash,
   worker_receipt_hash:receipt.worker_receipt_hash,
   lease_release:receipt.lease_release}:
  {...header,state:'held',reason};
 writePrivate(file,record);
 return {
  state:record.state,reason:record.reason||null,dispatch_attempted:true,
  remote_receipt_hash:record.remote_receipt_hash||null,
  remote_model_response_observed:record.remote_model_response_observed===true,
  lease_release:record.lease_release||null,
  child_safety_certified:false,
  public_classroom_ready:false
 };
}
