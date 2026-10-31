/**
 * Opt-in cryptographic execution evidence for bounded registered MicroSeed work.
 * Unlike the existing unsiged hash-chain, this proves that the holder of a
 * pinned NodeSeed device key signed a specific job receipt and fresh challenge.
 * It does not establish Yard device custody, physical provenance or Passport.
 */
import {createHash,sign,verify} from 'node:crypto';
import {fingerprintPublicKey} from '../compute/device-identity.mjs';

const DIGEST=/^sha256:[0-9a-f]{64}$/;
const NONCE=/^[a-zA-Z0-9._:-]{16,256}$/;
const sha=data=>'sha256:'+createHash('sha256').update(data).digest('hex');
const stable=v=>Array.isArray(v)?v.map(stable):
  v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
export function microseedRequestHash({nodeId,workloadClass,idempotencyKey,payload}={}){
  if(!nodeId||!workloadClass||!idempotencyKey)throw Error('signed_microseed_request_identity_required');
  return sha(JSON.stringify(stable({
    node_id:nodeId,workload_class:workloadClass,
    idempotency_key:idempotencyKey,payload:payload??null
  })));
}
export function microseedWorkerReceiptHash(worker){
  if(!worker||typeof worker!=='object')throw Error('signed_microseed_worker_receipt_required');
  const {receipt_hash,...body}=worker;
  // NodeSeed can return its previously durable receipt with the *transport*
  // deduplicated marker toggled. That marker is not part of the original
  // durable receipt hash and must not invalidate an idempotent replay.
  if(body.deduplicated===true)body.deduplicated=false;
  if(!DIGEST.test(receipt_hash)||sha(JSON.stringify(stable(body)))!==receipt_hash)
    throw Error('signed_microseed_worker_hash_invalid');
  return receipt_hash;
}
export function createSignedMicroSeedExecutionReceipt({
  identity,workerReceipt,leaseId,nonce,observedAt=new Date()
}={}){
  if(!identity?.private_key_pem||!identity.public_key_pem||
      !identity.node_id||!identity.fingerprint)throw Error('signed_microseed_node_identity_required');
  if(!NONCE.test(String(nonce||'')))throw Error('signed_microseed_nonce_required');
  if(!leaseId)throw Error('signed_microseed_lease_required');
  const digest=microseedWorkerReceiptHash(workerReceipt);
  if(workerReceipt.node_id!==identity.node_id)throw Error('signed_microseed_worker_node_mismatch');
  const statement={
    schema:'evercraft.compute.signed-microseed-job.v1',
    node_id:identity.node_id,
    device_fingerprint:identity.fingerprint,
    lease_id:String(leaseId),
    nonce:String(nonce),
    workload_class:workerReceipt.workload_class,
    idempotency_key:workerReceipt.idempotency_key,
    request_hash:workerReceipt.request_hash,
    worker_receipt_hash:digest,
    observed_at:observedAt.toISOString(),
    field_claim:false,
    production_authority_granted:false
  };
  if(!DIGEST.test(statement.request_hash))throw Error('signed_microseed_request_hash_invalid');
  return {
    statement,
    public_key_pem:identity.public_key_pem,
    signature:sign(null,Buffer.from(JSON.stringify(statement)),identity.private_key_pem).toString('base64')
  };
}
export function verifySignedMicroSeedExecutionReceipt({
  signedReceipt,workerReceipt,expectedNodeId,expectedFingerprint,
  expectedLeaseId,expectedNonce,expectedWorkloadClass,
  expectedIdempotencyKey,expectedPayload,now=new Date(),maxAgeMs=60000
}={}){
  const deny=reason=>({ok:false,reason,production_authority_granted:false});
  try{
    if(!signedReceipt?.statement||!signedReceipt.public_key_pem||!signedReceipt.signature)
      return deny('signature_missing');
    const statement=signedReceipt.statement;
    if(statement.schema!=='evercraft.compute.signed-microseed-job.v1'||
       statement.field_claim!==false||statement.production_authority_granted!==false)
      return deny('statement_schema_or_authority_mismatch');
    if(!DIGEST.test(String(expectedFingerprint))||
       statement.device_fingerprint!==expectedFingerprint||
       fingerprintPublicKey(signedReceipt.public_key_pem)!==expectedFingerprint)
      return deny('device_pin_mismatch');
    if(statement.node_id!==expectedNodeId||workerReceipt?.node_id!==expectedNodeId)
      return deny('node_id_mismatch');
    if(!NONCE.test(String(expectedNonce||''))||statement.nonce!==expectedNonce)
      return deny('nonce_mismatch');
    if(statement.lease_id!==expectedLeaseId||
       statement.workload_class!==expectedWorkloadClass||
       statement.idempotency_key!==expectedIdempotencyKey||
       workerReceipt?.workload_class!==expectedWorkloadClass||
       workerReceipt?.idempotency_key!==expectedIdempotencyKey)
      return deny('job_binding_mismatch');
    const requestHash=microseedRequestHash({
      nodeId:expectedNodeId,workloadClass:expectedWorkloadClass,
      idempotencyKey:expectedIdempotencyKey,payload:expectedPayload
    });
    if(workerReceipt?.request_hash!==requestHash||
       statement.request_hash!==requestHash)
      return deny('request_hash_mismatch');
    if(statement.worker_receipt_hash!==microseedWorkerReceiptHash(workerReceipt))
      return deny('worker_receipt_mismatch');
    const at=Date.parse(statement.observed_at);
    if(!Number.isFinite(at)||Math.abs(now.getTime()-at)>maxAgeMs)
      return deny('receipt_stale');
    if(!verify(null,Buffer.from(JSON.stringify(statement)),signedReceipt.public_key_pem,
      Buffer.from(signedReceipt.signature,'base64')))return deny('signature_invalid');
    return {
      ok:true,
      schema:'evercraft.saban.verified-signed-microseed-job.v1',
      node_id:expectedNodeId,
      device_fingerprint:expectedFingerprint,
      lease_id:expectedLeaseId,
      workload_class:expectedWorkloadClass,
      idempotency_key:expectedIdempotencyKey,
      request_hash:requestHash,
      worker_receipt_hash:statement.worker_receipt_hash,
      observed_at:statement.observed_at,
      signed_execution_verified:true,
      physical_field_device_verified:false,
      yard_authorized:false,
      systemia_mission_authorized:false,
      customer_delivery_verified:false,
      production_authority_granted:false
    };
  }catch{return deny('receipt_invalid_or_unverifiable');}
}
