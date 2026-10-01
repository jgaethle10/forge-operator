#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const endpoint=String(process.env.EVERCRAFT_NODESEED_LOCAL_ENDPOINT||'http://127.0.0.1:42420').replace(/\/$/,'');
const token=String(process.env.EVERCRAFT_ALLOCATOR_TOKEN||'');
const snapshotPath=String(process.env.EVERCRAFT_EDGE_DNS_SNAPSHOT||'/var/lib/evercraft/nodeseed/edge-dns/canary-zone.json');
const releaseRef=String(process.env.EVERCRAFT_EDGE_RELEASE_REF||'');
const ttlMs=Math.max(300000,Number(process.env.EVERCRAFT_EDGE_DNS_LEASE_TTL_MS||3600000));
if(!token) throw new Error('EVERCRAFT_ALLOCATOR_TOKEN required');
if(!/^[a-f0-9]{40}$/i.test(releaseRef)) throw new Error('EVERCRAFT_EDGE_RELEASE_REF must be immutable SHA');
if(!fs.existsSync(snapshotPath)) throw new Error('edge DNS snapshot missing');

async function request(route,{method='GET',body=null,authorization=''}={}){
 const res=await fetch(endpoint+route,{
  method,
  headers:{'content-type':'application/json',...(authorization?{authorization:'Bearer '+authorization}:{})},
  body:body==null?undefined:JSON.stringify(body)
 });
 const json=await res.json().catch(()=>({}));
 if(!res.ok) throw new Error(String(res.status)+':'+String(json.error||'request_failed'));
 return json;
}
let lease=null;
let serviceId=null;
async function start(){
 const capacity=await request('/v1/capacity');
 if(!Array.isArray(capacity.supported_workloads)||!capacity.supported_workloads.includes('systemia.evercraft-edge-dns.v1')){
  throw new Error('nodeseed_does_not_advertise_edge_dns');
 }
 lease=await request('/v1/leases',{method:'POST',authorization:token,body:{workload_class:'systemia.evercraft-edge-dns.v1',requested_ttl_ms:ttlMs}});
 const job=await request('/v1/jobs',{method:'POST',body:{
  lease_id:lease.lease_id,
  token:lease.token,
  release_ref:releaseRef,
  workload_class:'systemia.evercraft-edge-dns.v1',
  input:{snapshot_path:snapshotPath,dns_host:'0.0.0.0',dns_port:5353,allow_public_bind:true,health_port:0}
 }});
 serviceId=job.result?.service_id||null;
 if(!serviceId) throw new Error('edge_dns_service_id_missing');
 const health=await request('/v1/services/'+serviceId+'/health');
 if(health.authoritative!==true||health.recursive!==false||health.dns_udp!==true||health.dns_tcp!==true){
  throw new Error('edge_dns_health_contract_failed');
 }
 fs.mkdirSync(path.dirname(snapshotPath),{recursive:true,mode:0o750});
 const receipt={schema:'evercraft.edge.chromebook-bootstrap.v1',state:'dns_candidate_serving',service_id:serviceId,lease_id:lease.lease_id,snapshot_sha256:health.snapshot_sha256,node_endpoint:endpoint,public_ingress_verified:false,started_at:new Date().toISOString()};
 fs.writeFileSync(path.join(path.dirname(snapshotPath),'bootstrap-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
 process.stdout.write(JSON.stringify(receipt)+'\n');
}
async function renew(){
 while(true){
  await sleep(Math.max(60000,Math.floor(ttlMs/2)));
  if(!lease) continue;
  await request('/v1/leases/'+lease.lease_id+'/renew',{method:'POST',body:{token:lease.token,requested_ttl_ms:ttlMs}});
 }
}
async function close(){
 if(lease){
  try{await request('/v1/leases/'+lease.lease_id+'/release',{method:'POST',body:{token:lease.token}})}catch{}
 }
 process.exit(0);
}
process.on('SIGINT',close);process.on('SIGTERM',close);
await start();
await renew();
