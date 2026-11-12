import {createHash} from 'node:crypto';

// Local receipt projection only. A hash is NOT a signature or a remote attestation.
export const NODE_KEYS=Object.freeze(['node001','node002']);
const WATCH_SCHEMA='evercraft.local-organism-health-watch.v1';
function assertAt(value,now){
 const at=Date.parse(value);
 if(typeof value!=='string'||!Number.isFinite(at)||at>now+300000||now-at>180*86400000)throw Error('invalid node observation time');
 return {ms:at,iso:new Date(at).toISOString()};
}
export function projectLocalHealthWatch(raw,{nodeKey,expectedNodeId,now=Date.now()}={}){
 if(!NODE_KEYS.includes(nodeKey))throw Error('unknown node slot');
 if(typeof expectedNodeId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,99}$/.test(expectedNodeId))throw Error('expected node ID required');
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.schema!==WATCH_SCHEMA)throw Error('unrecognized health-watch record');
 const str=JSON.stringify(raw);
 if(str.length>262144)throw Error('health-watch too large');
 const {receipt_hash,...body}=raw;
 const localHash='sha256:'+createHash('sha256').update(JSON.stringify(body)).digest('hex');
 if(typeof receipt_hash!=='string'||receipt_hash!==localHash)throw Error('health-watch content hash mismatch');
 if(raw.authority!=='local_user_service_restart_only'||raw.secret_material_exposed!==false)throw Error('unsafe or unknown watcher authority');
 const {ms,iso}=assertAt(raw.observed_at,now);
 const data=raw.state==='recovered'?raw.after:raw;
 if(!data||typeof data!=='object'||data.node_id!==expectedNodeId)throw Error('watcher device identity mismatch');
 const validState=['healthy','recovered','degraded','bootstrapping'].includes(raw.state);
 if(!validState)throw Error('unsupported watcher state');
 const usable=(
  data.service_state==='active'&&
  data.seed_receipt_present===true&&
  data.nodeseed_endpoint_scope==='loopback_only'&&
  data.nodeseed_health?.ok===true&&
  data.nodeseed_health?.status===200&&
  data.nodeseed_health?.node_id===expectedNodeId&&
  data.release_current!==false
 );
 let status='unknown';
 if(now-ms>180000)status='stale';
 else if((raw.state==='healthy'||raw.state==='recovered')&&usable)status='reported_healthy';
 else if(raw.state==='bootstrapping')status='bootstrapping';
 else status='reported_degraded';
 return {
  node_key:nodeKey,
  status,observed_at:iso,
  source_receipt_hash:localHash,
  provenance:'LOCAL HEALTH WATCH · SELF REPORTED',
  note:status==='stale'?'Local observation older than three minutes; current health unknown.':
   status==='reported_healthy'?'Recent local NodeSeed probe only; remote connection and execution not verified.':
   status==='reported_degraded'?'Local watcher reports degraded or inconsistent probe state; remote outcome unknown.':
   status==='bootstrapping'?'Local watcher reports bounded bootstrap grace; readiness unknown.':
   'Local receipt outcome unknown.',
 };
}
