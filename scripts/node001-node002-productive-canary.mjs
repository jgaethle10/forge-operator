#!/usr/bin/env node
/**
 * Operator-executed physical Node001→Node002 productive MicroSeed proof.
 *
 * Must be run on Penguin while the previously authorized NextGen outbound
 * agent is connected. Calls only the private 127.0.0.1:8797 broker /nodes
 * path, not the intentionally blocked public /nodes interface.
 *
 * Produces a bounded deterministic SHA-256 content job on actual NextGen,
 * validates Node002-issued receipts, releases the remote lease, and stores a
 * non-secret operator evidence record. NOT a digital-signature verification.
 */
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const NODE='evercraft-node002-nextgen';
const BROKER_DEPLOYMENT='evercraft-remote-broker-resident';
const BROKER_INSTANCE='remote_broker_8a9b5bfcec4231bd15ed375c';
const BROKER_RECEIPT='e5649a6b8317d99d18457053c3987283b5696084cae92089a1823e0b8203ad0c';
const PUBLIC_ORIGIN='https://fabric.systemiacommandcenters.com';
const PRIVATE_ORIGIN='http://127.0.0.1:8797';
const YARD_ROOT='/var/lib/evercraft/nodeseed/remote-broker-resident/yard';
const PROOF_ROOT='/var/lib/evercraft/nodeseed/remote-broker-resident/proofs';
const WORKLOAD='systemia.content-hash.v1';
const jsonStable=value=>
  Array.isArray(value)?value.map(jsonStable):
  value&&typeof value==='object'?
    Object.fromEntries(Object.keys(value).sort().map(k=>[k,jsonStable(value[k])])):value;
const sha=value=>'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stableSha=value=>sha(jsonStable(value));
function requireTrue(value,message){if(!value)throw Error(message);}
export function verifyJobResponse({job,expected,leaseId}={}){
  const worker=job?.worker_receipt;
  const result=job?.result;
  const compute=job?.receipt;
  const expectDigest=stableSha(expected.value);
  requireTrue(job?.ok===true&&job.node_id===NODE&&job.workload_class===WORKLOAD,
    'node002_job_response_identity_mismatch');
  requireTrue(job.deduplicated===false&&job.idempotency_key===expected.idempotencyKey,
    'node002_job_not_fresh_or_idempotency_mismatch');
  requireTrue(result?.ok===true&&result.algorithm==='sha256'&&result.digest===expectDigest,
    'node002_hash_workload_result_mismatch');
  requireTrue(result.byte_count===Buffer.byteLength(JSON.stringify(jsonStable(expected.value))),
    'node002_hash_workload_byte_count_mismatch');
  requireTrue(worker?.schema==='evercraft.compute.registered-worker-receipt.v1'&&
    worker.node_id===NODE&&worker.workload_class===WORKLOAD&&
    worker.idempotency_key===expected.idempotencyKey&&
    worker.registered_workload_only===true&&
    worker.deduplicated===false&&
    worker.result?.digest===expectDigest,
    'node002_registered_worker_receipt_invalid');
  const {receipt_hash:workerHash,...workerBody}=worker;
  requireTrue(workerHash===stableSha(workerBody),'node002_worker_receipt_hash_mismatch');
  requireTrue(compute?.schema==='evercraft.compute.receipt.v1'&&
    compute.node_id===NODE&&
    compute.type==='registered-workload.executed'&&
    compute.lease_id===leaseId&&
    compute.workload_class===WORKLOAD&&
    compute.worker_receipt_hash===worker.receipt_hash,
    'node002_compute_receipt_identity_or_lease_mismatch');
  const {receipt_hash:computeHash,...computeBody}=compute;
  // Compute's ReceiptChain.issue() uses bare lowercase hex, unlike the
  // registered worker receipt's prefixed, stable-key JSON digest.
  const computeDigest=createHash('sha256')
    .update(JSON.stringify(computeBody)).digest('hex');
  requireTrue(/^[a-f0-9]{64}$/.test(String(computeHash||'')) &&
    computeHash===computeDigest,'node002_compute_hash_chain_receipt_invalid');
  return {
    workload:WORKLOAD,
    remote_node_id:NODE,
    result_digest:expectDigest,
    payload_bytes:result.byte_count,
    remote_worker_receipt_hash:worker.receipt_hash,
    remote_compute_receipt_hash:compute.receipt_hash,
    compute_receipt_sequence:compute.seq,
    verified_worker_receipt_integrity:true,
    verified_compute_receipt_integrity:true,
    cryptographic_signature_provided:false,
  };
}
async function remoteFetch(path,{method='GET',body,bearerToken='',timeoutMs=12000}={}){
  const headers={accept:'application/json'};
  if(body!==undefined)headers['content-type']='application/json';
  if(bearerToken)headers.authorization='Bearer '+bearerToken;
  const r=await fetch(PRIVATE_ORIGIN+path,{
    method,headers,body:body===undefined?undefined:JSON.stringify(body),
    signal:AbortSignal.timeout(timeoutMs),redirect:'error',
  });
  const data=await r.json().catch(()=>null);
  if(!r.ok)throw Error('remote_relay_http_'+r.status);
  return data;
}
async function run(){
  // Penguin's active Fabric updater identifies the actual owned Forge checkout.
  // The former /opt path belongs to broker staging and is absent on this host.
  const installed='/home/jessegaethle10/.local/share/evercraft/forge-operator/systemia/yard/operator.mjs';
  requireTrue(fs.existsSync(installed),'active_forge_yard_operator_missing');
  const {YardOperator}=await import(pathToFileURL(installed).href);
  const yard=new YardOperator({stateDir:YARD_ROOT});
  const record=yard.deploymentStatus(BROKER_DEPLOYMENT);
  requireTrue(record?.state==='ready'&&record?.result?.instance_id===BROKER_INSTANCE&&
    record?.receipt?.receipt_hash===BROKER_RECEIPT,
    'broker_deployment_record_identity_mismatch');
  const inventory=await yard.listRemoteCapacityNodes(BROKER_DEPLOYMENT);
  const physical=inventory.nodes.find(x=>x.node_id===NODE);
  requireTrue(physical?.connected===true&&
    physical.capacity?.protocol==='evercraft.capacity.v1'&&
    physical.capacity?.device_fingerprint===physical.device_fingerprint&&
    physical.capacity?.supported_workloads?.includes(WORKLOAD)===true&&
    physical.secure_envelope_schema==='evercraft.secure-envelope.v1',
    'physical_nextgen_not_live_or_microseed_not_supported');

  // Record Yard's own public-route receipt after externally observed HTTPS
  // reachability. Public /nodes remains intentionally blocked.
  const route=await yard.verifyPublicRoute(BROKER_DEPLOYMENT,{origin:PUBLIC_ORIGIN});
  requireTrue(route.verified===true&&route.instance_id===BROKER_INSTANCE&&
    route.deployment_receipt_hash===BROKER_RECEIPT,
    'yard_public_route_binding_unverified');

  const grant=await yard.remoteCapacityGrant(BROKER_DEPLOYMENT,NODE);
  requireTrue(grant?.node_id===NODE &&
    grant.device_fingerprint===physical.device_fingerprint &&
    grant.control_grant_receipt_hash &&
    grant.allocator_token,
    'remote_broker_control_grant_unavailable');

  const nonce=randomBytes(12).toString('hex');
  const expected={
    value:{
      mission:'evercraft-two-physical-nodes',
      class:'bounded-content-hash',
      from:'evercraft-penguin',
      to:NODE,
      challenge:nonce,
    },
    idempotencyKey:'evercraft-node002-hash-'+nonce,
  };
  const base='/nodes/'+encodeURIComponent(NODE);
  let lease=null;
  let proof=null;
  let leaseReleased=false;
  let workError=null;
  try{
    lease=await remoteFetch(base+'/v1/leases',{
      method:'POST',bearerToken:grant.allocator_token,
      body:{workload_class:WORKLOAD,requested_ttl_ms:90000},
    });
    requireTrue(Boolean(lease?.lease_id&&lease?.token&&lease?.receipt?.receipt_hash),
      'remote_lease_receipt_missing');
    const job=await remoteFetch(base+'/v1/jobs',{
      method:'POST',timeoutMs:18000,
      body:{
        lease_id:lease.lease_id,token:lease.token,workload_class:WORKLOAD,
        idempotency_key:expected.idempotencyKey,
        input:{idempotency_key:expected.idempotencyKey,payload:{value:expected.value}},
      },
    });
    const verified=verifyJobResponse({job,expected,leaseId:lease.lease_id});
    proof={
      schema:'evercraft.remote-capacity.physical-node002-productive-proof.v1',
      observed_at:new Date().toISOString(),
      success:true,
      broker_instance_id:BROKER_INSTANCE,
      broker_deployment_receipt_hash:BROKER_RECEIPT,
      yard_public_route_receipt_hash:route.receipt_hash,
      yard_control_grant_receipt_hash:grant.control_grant_receipt_hash,
      remote_lease_receipt_hash:lease.receipt.receipt_hash,
      ...verified,
      sealed_outbound_relay:true,
      remote_operation:'content_sha256',
      executed_on_physical_nextgen:true,
      command_scope:'deterministic_no_external_actions',
      worker_job_deduplicated:false,
      hp_public_ingress_opened:false,
      receipt_hash_is_not_digital_signature:true,
      credentials_recorded:false,
    };
  }catch(error){
    workError=error;
  }finally{
    if(lease?.lease_id&&lease.token){
      try{
        const released=await remoteFetch(base+'/v1/leases/'+encodeURIComponent(lease.lease_id)+'/release',{
          method:'POST',body:{token:lease.token},
        });
        leaseReleased=released?.ok===true;
      }catch{}
    }
  }
  if(workError){
    // Always expose lease cleanup outcome even if validation itself failed.
    // Never expose ephemeral lease ID, control grant or allocator token.
    console.error(JSON.stringify({
      schema:'evercraft.remote-capacity.physical-node002-lease-cleanup.v1',
      lease_was_acquired:Boolean(lease?.lease_id),
      remote_lease_release_acknowledged:leaseReleased,
      job_verification_completed:false,
      secrets_exposed:false,
    }));
    throw workError;
  }
  requireTrue(Boolean(proof),'remote_job_proof_missing');
  proof.remote_lease_release_acknowledged=leaseReleased;
  requireTrue(leaseReleased,'remote_lease_release_not_confirmed');
  const receipt={...proof,proof_hash:stableSha(proof)};
  fs.mkdirSync(PROOF_ROOT,{recursive:true,mode:0o700});
  const filename=path.join(PROOF_ROOT,'node002-content-hash-'+nonce+'.json');
  fs.writeFileSync(filename,JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify(receipt,null,2));
}
const isCli=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isCli){
  if(process.argv.length!==3||process.argv[2]!=='--execute-content-hash'){
    console.error('usage: sudo node scripts/node001-node002-productive-canary.mjs --execute-content-hash');
    process.exit(2);
  }
  run().catch(e=>{
    console.error(JSON.stringify({
      schema:'evercraft.remote-capacity.physical-node002-productive-proof.v1',
      success:false,
      reason:String(e?.message||e).replace(/sha256:[a-f0-9]{64}/g,'[redacted]').slice(0,110),
      production_job_confirmed:false,
    }));
    process.exitCode=1;
  });
}
