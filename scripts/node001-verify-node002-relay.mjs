#!/usr/bin/env node
/**
 * Physical Penguin read-only remote command canary.
 * Execute only while the separately-authorized physical HP NodeAgent session
 * is running. It uses a private broker loopback route; public /nodes/* stays 404.
 * No private tokens or fingerprints are reported.
 */
import {YardOperator} from '../systemia/yard/operator.mjs';
const YARD_ROOT='/var/lib/evercraft/nodeseed/remote-broker-resident/yard';
const DEPLOYMENT='evercraft-remote-broker-resident';
const EXPECTED_NODE='evercraft-node002-nextgen';
const BROKER='http://127.0.0.1:8797';
const EXPECTED_INSTANCE='remote_broker_8a9b5bfcec4231bd15ed375c';
const EXPECTED_RECEIPT='e5649a6b8317d99d18457053c3987283b5696084cae92089a1823e0b8203ad0c';

export function summarizeRemoteProof({inventory,health,brokerStatus}={}){
  const nodes=Array.isArray(inventory?.nodes)?inventory.nodes:[];
  const physical=nodes.find(x=>x?.node_id===EXPECTED_NODE);
  const valid=
    inventory?.schema==='evercraft.yard.remote-capacity-nodes.v1' &&
    inventory?.broker_deployment_id===DEPLOYMENT &&
    Boolean(inventory.compute_management_receipt_hash) &&
    physical?.connected===true &&
    physical?.capacity?.protocol==='evercraft.capacity.v1' &&
    physical?.capacity?.runtime==='Evercraft Compute' &&
    physical?.capacity?.device_fingerprint===physical?.device_fingerprint &&
    physical?.secure_envelope_schema==='evercraft.secure-envelope.v1' &&
    health?.ok===true &&
    health?.node_id===EXPECTED_NODE &&
    health?.runtime==='Evercraft Compute' &&
    brokerStatus?.ok===true &&
    brokerStatus?.instance_id===EXPECTED_INSTANCE &&
    brokerStatus?.deployment_receipt_bound===true &&
    brokerStatus?.deployment_receipt_ref===EXPECTED_RECEIPT &&
    Number(brokerStatus?.registered_nodes)>=1;
  return {
    schema:'evercraft.remote-capacity.physical-node002-read-only-proof.v1',
    checked_at:new Date().toISOString(),
    success:valid,
    broker_instance_and_receipt_match:
      brokerStatus?.instance_id===EXPECTED_INSTANCE &&
      brokerStatus?.deployment_receipt_ref===EXPECTED_RECEIPT,
    yard_private_live_node_verified:physical?.connected===true,
    yard_capacity_device_identity_match:
      Boolean(physical?.capacity?.device_fingerprint) &&
      physical?.capacity?.device_fingerprint===physical.device_fingerprint,
    encrypted_transport_verified:
      physical?.secure_envelope_schema==='evercraft.secure-envelope.v1',
    exact_node_health_returned_from_remote_worker:
      health?.ok===true && health?.node_id===EXPECTED_NODE &&
      health?.runtime==='Evercraft Compute',
    original_yard_private_management_receipt_present:
      Boolean(inventory?.compute_management_receipt_hash),
    public_worker_route_opened:false,
    remote_command:'GET /v1/health',
    job_read_only:true,
    production_worker_persistent:false,
    remote_operator_changed:false,
  };
}
export async function run() {
  const yard=new YardOperator({stateDir:YARD_ROOT});
  const inventory=await yard.listRemoteCapacityNodes(DEPLOYMENT);
  const remote=inventory.nodes.find(x=>x.node_id===EXPECTED_NODE);
  if(!remote||remote.connected!==true) {
    throw Error('physical_node002_not_connected_to_private_broker');
  }
  const [remoteResponse,brokerResponse]=await Promise.all([
    fetch(BROKER+'/nodes/'+EXPECTED_NODE+'/v1/health',{
      method:'GET',signal:AbortSignal.timeout(14000),
    }),
    fetch(BROKER+'/v1/remote/health',{
      method:'GET',signal:AbortSignal.timeout(5000),
    }),
  ]);
  const health=await remoteResponse.json().catch(()=>null);
  const brokerStatus=await brokerResponse.json().catch(()=>null);
  const summary=summarizeRemoteProof({
    inventory,
    health:remoteResponse.ok?health:null,
    brokerStatus:brokerResponse.ok?brokerStatus:null,
  });
  console.log(JSON.stringify(summary,null,2));
  if(!summary.success)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  if(process.argv.length!==3||process.argv[2]!=='--read-only'){
    console.error('usage: node scripts/node001-verify-node002-relay.mjs --read-only');
    process.exit(2);
  }
  run().catch(e=>{
    console.error(JSON.stringify({
      schema:'evercraft.remote-capacity.physical-node002-read-only-proof.v1',
      success:false,reason:String(e?.message||e).slice(0,140),
    }));
    process.exitCode=1;
  });
}
