#!/usr/bin/env node
/**
 * Physical NextGen live outbound relay canary.
 * - Uses existing private local-organism NodeSeed and allocator secret.
 * - Requires exact live broker deployment instance + Yard receipt.
 * - Opens the already owner-authorized outbound connection for at most 4 min.
 * - Does not change persistent services, public ingress, or shadow telemetry.
 *
 * NB: The current NodeAgent can process broker-authorized remote commands.
 * This script submits no commands itself. Operator should dispatch ONLY
 * a read-only GET /v1/health canary while it is connected.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startOutboundNodeAgent} from '../systemia/network/outbound-node-agent.mjs';

const BROKER='https://fabric.systemiacommandcenters.com';
const EXPECTED_NODE='evercraft-node002-nextgen';
const EXPECTED_INSTANCE='remote_broker_8a9b5bfcec4231bd15ed375c';
const EXPECTED_RECEIPT='e5649a6b8317d99d18457053c3987283b5696084cae92089a1823e0b8203ad0c';
const ROOT=path.join(os.homedir(),'.local','state','evercraft','organism');
const TOKEN=path.join(ROOT,'.secrets','allocator-token');
const RECEIPT=path.join(ROOT,'compute','nodeseed-receipt.json');
const MAX_SESSION_MS=240000;

async function getJson(url) {
  const r=await fetch(url,{
    headers:{accept:'application/json'},
    signal:AbortSignal.timeout(8000),
    redirect:'error',
  });
  if(!r.ok)throw Error('local_or_public_health_http_'+r.status);
  return r.json();
}
export function verifyBridgePreflight({receipt,capacity,broker}={}) {
  const node=String(receipt?.node_id||'');
  const fp=String(receipt?.device_fingerprint||'');
  if(receipt?.schema!=='evercraft.compute.nodeseed-receipt.v1'||
     node!==EXPECTED_NODE||!/^sha256:[a-f0-9]{64}$/i.test(fp)){
    throw Error('nextgen_physical_nodeseed_identity_invalid');
  }
  let parsed;
  try {parsed=new URL(String(receipt.endpoint||''))}
  catch {throw Error('nextgen_local_nodeseed_endpoint_invalid')}
  const port=Number(parsed.port);
  if(parsed.protocol!=='http:'||!Number.isInteger(port)||port<1||port>65535) {
    throw Error('nextgen_local_nodeseed_endpoint_invalid');
  }
  if(capacity?.protocol!=='evercraft.capacity.v1'||
     capacity.node_id!==node||
     capacity.device_fingerprint!==fp){
    throw Error('live_nextgen_capacity_identity_mismatch');
  }
  if(broker?.ok!==true||
     broker?.schema!=='evercraft.remote-capacity.broker-health.v1'||
     broker?.service!=='remote-capacity-broker'||
     broker?.runtime!=='Evercraft Compute'||
     broker?.instance_id!==EXPECTED_INSTANCE||
     broker?.deployment_receipt_bound!==true||
     broker?.deployment_receipt_ref!==EXPECTED_RECEIPT||
     broker?.secure_envelope_schema!=='evercraft.secure-envelope.v1' ||
     !Number.isInteger(broker.authorized_devices)||
     broker.authorized_devices<1) {
    throw Error('public_broker_not_authorized_or_instance_receipt_mismatch');
  }
  return {endpoint:'http://127.0.0.1:'+port,node_id:node};
}

export async function runBridgeCanary() {
  const receipt=JSON.parse(fs.readFileSync(RECEIPT,'utf8'));
  const parsed=new URL(String(receipt.endpoint||''));
  if(parsed.protocol!=='http:'||!parsed.port)throw Error('node_receipt_not_local_http');
  const local='http://127.0.0.1:'+parsed.port;
  const [capacity,broker]=await Promise.all([
    getJson(local+'/v1/capacity'),
    getJson(BROKER+'/v1/remote/health'),
  ]);
  const checked=verifyBridgePreflight({receipt,capacity,broker});
  const token=fs.readFileSync(TOKEN,'utf8').trim();
  if(!token)throw Error('existing_local_allocator_authority_missing');
  const agent=await startOutboundNodeAgent({
    brokerUrl:BROKER,
    localCapacityEndpoint:checked.endpoint,
    localAllocatorToken:token,
    pollBackoffMs:250,
  });
  if(agent.node_id!==EXPECTED_NODE) {
    await agent.close();
    throw Error('registered_agent_node_identity_mismatch');
  }

  console.log(JSON.stringify({
    schema:'evercraft.nextgen.actual-bridge-session.v1',
    status:'CONNECTED_FOREGROUND_CANARY',
    node_id:EXPECTED_NODE,
    broker_instance_id:EXPECTED_INSTANCE,
    outbound_only:true,
    public_hp_listener_opened:false,
    existing_telemetry_agent_changed:false,
    private_token_exposed:false,
    registered_at:agent.status().registered_at,
    maximum_session_seconds:MAX_SESSION_MS/1000,
    next_canary:'Penguin GET http://127.0.0.1:8797/nodes/evercraft-node002-nextgen/v1/health',
  },null,2));

  let stopped=false;
  let timer=null;
  const done=new Promise(resolve=>{
    function finish(){
      if(stopped)return;
      stopped=true;
      if(timer)clearTimeout(timer);
      resolve();
    }
    process.once('SIGINT',finish);
    process.once('SIGTERM',finish);
    timer=setTimeout(finish,MAX_SESSION_MS);
  });
  await done;
  const before=agent.status();
  await agent.close();
  console.log(JSON.stringify({
    schema:'evercraft.nextgen.actual-bridge-session-final.v1',
    state:'closed',
    node_id:EXPECTED_NODE,
    secure_commands_opened:before.secure_commands_opened,
    last_command_at:before.last_command_at,
    last_error_present:Boolean(before.last_error),
    remote_session_left_running:false,
    system_service_modified:false,
    existing_telemetry_agent_changed:false,
    raw_fingerprint_or_token_printed:false,
  },null,2));
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct) {
  if(process.argv.length!==3||process.argv[2]!=='--connect') {
    console.error('usage: node scripts/node002-live-bridge-canary.mjs --connect');
    process.exit(2);
  }
  runBridgeCanary().catch(e=>{
    console.error(JSON.stringify({
      state:'hold',
      reason:String(e?.message||e).replace(/sha256:[a-f0-9]{64}/gi,'[redacted]').slice(0,150),
      worker_connected:false,
      agent_modified:false,
    }));
    process.exitCode=1;
  });
}
