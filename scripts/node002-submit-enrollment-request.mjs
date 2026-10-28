#!/usr/bin/env node
/**
 * NextGen physical enrollment REQUEST only. Does not grant authority or start
 * remote polling/execution. Use the existing local NodeSeed and private token.
 * Never display token values or raw device fingerprints in terminal output.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {submitOutboundEnrollmentRequest} from '../systemia/network/outbound-node-agent.mjs';

const BROKER='https://fabric.systemiacommandcenters.com';
const EXPECTED_INSTANCE='remote_broker_8a9b5bfcec4231bd15ed375c';
const EXPECTED_RECEIPT='e5649a6b8317d99d18457053c3987283b5696084cae92089a1823e0b8203ad0c';
const NODE_ROOT=path.join(os.homedir(),'.local','state','evercraft','organism');
const ALLOCATOR=path.join(NODE_ROOT,'.secrets','allocator-token');
const RECEIPT=path.join(NODE_ROOT,'compute','nodeseed-receipt.json');

async function getJson(url){
  const response=await fetch(url,{
    headers:{accept:'application/json'},
    signal:AbortSignal.timeout(6500),
    redirect:'error',
  });
  if(response.status!==200)throw new Error('http_health_failed:'+response.status);
  return response.json();
}
export function verifyNextGenAdmissionPreflight({receipt,capacity,broker}={}){
  if(receipt?.schema!=='evercraft.compute.nodeseed-receipt.v1'||
     !/^sha256:[a-f0-9]{64}$/i.test(String(receipt.device_fingerprint||''))||
     receipt?.node_id==='evercraft-penguin'||
     !String(receipt?.node_id||'').trim()){
    throw Error('private_node_identity_missing_or_not_nextgen');
  }
  const parsed=new URL(String(receipt.endpoint||''));
  if(parsed.protocol!=='http:'||!parsed.port||
     !Number.isInteger(Number(parsed.port))||Number(parsed.port)<1||Number(parsed.port)>65535){
    throw Error('local_nodeseed_endpoint_invalid');
  }
  if(capacity?.protocol!=='evercraft.capacity.v1'||
     capacity?.node_id!==receipt.node_id||
     capacity?.device_fingerprint!==receipt.device_fingerprint){
    throw Error('local_nodeseed_live_identity_mismatch');
  }
  if(broker?.ok!==true||
     broker?.schema!=='evercraft.remote-capacity.broker-health.v1'||
     broker?.service!=='remote-capacity-broker'||
     broker?.runtime!=='Evercraft Compute'||
     broker?.instance_id!==EXPECTED_INSTANCE||
     broker?.deployment_receipt_bound!==true||
     broker?.deployment_receipt_ref!==EXPECTED_RECEIPT||
     broker?.secure_envelope_schema!=='evercraft.secure-envelope.v1'){
    throw Error('public_broker_deployment_identity_mismatch');
  }
  return {
    endpoint:'http://127.0.0.1:'+parsed.port,
    node_id:receipt.node_id,
    broker_instance_id:broker.instance_id,
  };
}
export async function runNextGenEnrollmentRequest(){
  const receipt=JSON.parse(fs.readFileSync(RECEIPT,'utf8'));
  const parsed=new URL(receipt.endpoint);
  if(parsed.protocol!=='http:'||!parsed.port)throw Error('local_node_receipt_endpoint_invalid');
  const endpoint='http://127.0.0.1:'+parsed.port;
  const [capacity,broker]=await Promise.all([
    getJson(endpoint+'/v1/capacity'),
    getJson(BROKER+'/v1/remote/health'),
  ]);
  const checked=verifyNextGenAdmissionPreflight({receipt,capacity,broker});
  const token=fs.readFileSync(ALLOCATOR,'utf8').trim();
  if(!token)throw Error('existing_local_allocator_token_missing');
  const result=await submitOutboundEnrollmentRequest({
    brokerUrl:BROKER,
    localCapacityEndpoint:checked.endpoint,
    localAllocatorToken:token,
  });
  if(result.authority_granted!==false||
     result.state!=='pending_explicit_authorization'||
     result.node_id!==checked.node_id||
     !result.request_receipt_hash){
    throw Error('enrollment_request_unexpected_result');
  }
  return {
    schema:'evercraft.nextgen.pending-enrollment.operator-receipt.v1',
    node_id:result.node_id,
    broker_instance_id:checked.broker_instance_id,
    state:result.state,
    request_receipt_hash:result.request_receipt_hash,
    expires_at:result.expires_at,
    authority_granted:false,
    remote_agent_started:false,
    node_telemetry_modified:false,
    local_token_printed:false,
    raw_device_fingerprint_printed:false,
    next_gate:'review_opaque_yard_pending_candidate_then_explicit_owner_approval',
  };
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  if(process.argv.length!==3||process.argv[2]!=='--request'){
    console.error('usage: node scripts/node002-submit-enrollment-request.mjs --request');
    process.exit(2);
  }
  try{
    console.log(JSON.stringify(await runNextGenEnrollmentRequest(),null,2));
  }catch(e){
    console.error(JSON.stringify({
      ok:false,state:'hold',
      reason:String(e?.message||e).replace(/sha256:[a-f0-9]{64}/gi,'[redacted]').slice(0,160),
      authority_granted:false,remote_agent_started:false,
    }));
    process.exitCode=1;
  }
}
