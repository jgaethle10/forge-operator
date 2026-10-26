#!/usr/bin/env node
// Read-only broker discovery on an owner-controlled Systemia/Yard host.
// No allocator token, lease secret, device fingerprint, endpoint, or raw
// deployment record is printed. This does NOT authenticate the Yard files.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { comparePublicBrokerWithYardReceipt } from '../../systemia/network/remote-broker-public-preflight.mjs';

function fileJson(file) {
  try {
    const st=fs.lstatSync(file);
    if(!st.isFile() || st.size > 512*1024 || st.size < 2) return null;
    const data=JSON.parse(fs.readFileSync(file,'utf8'));
    return data && typeof data==='object' && !Array.isArray(data) ? data : null;
  } catch {return null;}
}
function digestMatches(record) {
  if(!record || !/^sha256:[0-9a-f]{64}$/i.test(String(record.receipt_hash||'')))return false;
  const {receipt_hash, ...fields}=record;
  const computed='sha256:'+createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  return computed===receipt_hash;
}
function safeBrokerRecord(row) {
  return row?.receipt?.workload_class==='systemia.remote-capacity-broker.v1' &&
    row?.state==='ready' &&
    row?.result?.service_id &&
    /^remote_broker_[a-f0-9]{24}$/.test(String(row?.result?.instance_id||'')) &&
    digestMatches(row.receipt);
}
function asYardClaim(row) {
  if(row?.public_route?.verified!==true ||
      row?.public_route?.scope!=='public_https' ||
      !digestMatches(row.public_route) ||
      row?.public_route?.health_path!=='/v1/remote/health') return null;
  return {
    schema:'evercraft.remote-capacity.public-broker.v1',
    runtime:'Evercraft Compute',
    verified:true,
    origin:row.public_route.origin,
    health_path:row.public_route.health_path,
    deployment_receipt_hash:row.receipt.receipt_hash,
    public_route_receipt_hash:row.public_route.receipt_hash,
    instance_id:row.result.instance_id,
    secure_envelope_schema:row.result.secure_envelope_schema,
    verified_at:row.public_route.verified_at,
    source:'Systemia Yard Operator',
  };
}
export async function inspectYardBrokerDeployments({
  yardState,
  allowedOrigins=[],
  verifyPublicHealth=false,
  fetchImpl=fetch,
}={}){
  if(!yardState)throw new Error('yard_state_directory_required');
  let filenames=[];
  try {
    const st=fs.lstatSync(yardState);
    if(!st.isDirectory() || st.isSymbolicLink())throw new Error('yard_state_directory_invalid');
    filenames=fs.readdirSync(yardState,{withFileTypes:true})
      .filter(x=>x.isFile() && x.name.endsWith('.json') &&
        /^[a-zA-Z0-9._-]{1,128}$/.test(x.name.slice(0,-5)))
      .map(x=>x.name).slice(0,200);
  }catch(e){
    if(e.message==='yard_state_directory_invalid')throw e;
    return {
      schema:'evercraft.nextgen.broker-discovery.v1',
      result:'yard_state_unavailable',broker_candidate_count:0,
      independent_yard_authentication_verified:false,
      remote_access_enabled:false,read_only:true,candidates:[],
    };
  }
  const candidates=[];
  for(const name of filenames){
    const row=fileJson(path.join(yardState,name));
    if(row?.receipt?.workload_class!=='systemia.remote-capacity-broker.v1')continue;
    const brokerOk=Boolean(safeBrokerRecord(row));
    const claim=brokerOk?asYardClaim(row):null;
    let publicRoute='not_verified';
    if(verifyPublicHealth && claim){
      try {
        const observed=await comparePublicBrokerWithYardReceipt({
          yardReceipt:claim,allowedOrigins,fetchImpl,
        });
        publicRoute=observed.health_matches_yard_claim
          ? 'health_matches_local_yard_record'
          : observed.result==='unreachable' ? 'unreachable' : 'mismatch';
      }catch{
        publicRoute='denied_or_invalid';
      }
    } else if(claim){
      publicRoute='local_record_claim_only';
    }
    candidates.push({
      // Deployment ID is only a descriptive identifier; never report
      // service URL, broker origin or any fingerprint or private receipt.
      deployment_id: /^[a-zA-Z0-9._-]{1,128}$/.test(String(row.deployment_id||''))
        ? row.deployment_id : 'redacted',
      locally_recorded_ready:brokerOk,
      local_immutable_receipt_matches:brokerOk,
      locally_recorded_public_https:Boolean(claim),
      live_public_health_consistency:publicRoute,
      independent_yard_authentication_verified:false,
      device_admitted_by_this_check:false,
    });
  }
  return {
    schema:'evercraft.nextgen.broker-discovery.v1',
    result:candidates.length?'candidates_found':'no_broker_record_found',
    broker_candidate_count:candidates.length,
    independent_yard_authentication_verified:false,
    remote_access_enabled:false,
    read_only:true,
    candidates,
  };
}
const invoked=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  const arg=name=>{
    const i=process.argv.indexOf(name);
    return i>=0 ? process.argv[i+1] : '';
  };
  const yardState=arg('--yard-state')||
    path.join(os.homedir(),'.local/state/evercraft/organism/compute/control/yard');
  const verifyPublicHealth=process.argv.includes('--verify-public-health');
  const allowedOrigins=process.argv.flatMap((value,i)=>
    value==='--allow-origin' && process.argv[i+1] ? [process.argv[i+1]]:[]);
  const result=await inspectYardBrokerDeployments({
    yardState,verifyPublicHealth,allowedOrigins,
  });
  console.log(JSON.stringify(result,null,2));
  if(process.argv.includes('--require-local-broker-record') &&
      !result.candidates.some(x=>x.locally_recorded_ready))process.exitCode=2;
  if(process.argv.includes('--require-public-health-consistency') &&
      !result.candidates.some(x=>x.live_public_health_consistency===
        'health_matches_local_yard_record'))process.exitCode=2;
}
