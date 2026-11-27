// Domain-separated signature over an actual registered content-hash response.
// Not a general signing endpoint, field attestation, or loaded-code proof.
import {sign,verify,createPublicKey} from 'node:crypto';
import {fingerprintPublicKey} from './device-identity.mjs';
export const COMPLETION_WORKLOAD='systemia.content-hash.v1';
export const validCompletionNonce=value=>typeof value==='string'&&/^[a-f0-9]{48}$/.test(value);
const HASH=/^sha256:[a-f0-9]{64}$/;
const BARE=/^[a-f0-9]{64}$/;
function statementFor({response,nonce,fingerprint,observedAt}) {
  if(!validCompletionNonce(nonce)||!HASH.test(fingerprint||'')||
     response?.ok!==true||response.workload_class!==COMPLETION_WORKLOAD||
     typeof response.node_id!=='string'||!response.node_id||
     typeof response.idempotency_key!=='string'||!response.idempotency_key||
     !HASH.test(response.worker_receipt?.receipt_hash||'')||
     !BARE.test(response.receipt?.receipt_hash||'')||
     typeof response.receipt?.lease_id!=='string'||
     !response.receipt.lease_id||typeof response.deduplicated!=='boolean')
    throw Error('invalid_completion_binding');
  return {schema:'evercraft.compute.signed-content-hash-completion.v1',
    node_id:response.node_id,device_fingerprint:fingerprint,
    workload_class:response.workload_class,idempotency_key:response.idempotency_key,
    lease_id:response.receipt.lease_id,worker_receipt_hash:response.worker_receipt.receipt_hash,
    compute_receipt_hash:response.receipt.receipt_hash,
    deduplicated:response.deduplicated,nonce,observed_at:observedAt,
    field_claim:false,loaded_code_claim:false};
}
export function signContentHashCompletion({identity,response,nonce,now=new Date()}) {
  if(!identity?.private_key_pem||!identity?.public_key_pem||
     identity.node_id!==response?.node_id||
     fingerprintPublicKey(identity.public_key_pem)!==identity.fingerprint)
    throw Error('completion_identity_unavailable');
  const statement=statementFor({response,nonce,fingerprint:identity.fingerprint,
    observedAt:now.toISOString()});
  return {statement,public_key_pem:identity.public_key_pem,
    signature:sign(null,Buffer.from(JSON.stringify(statement)),identity.private_key_pem).toString('base64')};
}
export function verifyContentHashCompletionSignature({
  response,expectedNonce,expectedDeviceFingerprint,expectedLeaseId,now=new Date(),
}={}) {
  try {
    const proof=response?.completion_signature;
    if(!validCompletionNonce(expectedNonce)||!HASH.test(expectedDeviceFingerprint||'')||
       typeof expectedLeaseId!=='string'||!expectedLeaseId||
       typeof proof?.public_key_pem!=='string'||proof.public_key_pem.length>1024||
       typeof proof.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(proof.signature))
      return false;
    const key=createPublicKey(proof.public_key_pem);
    if(key.asymmetricKeyType!=='ed25519'||
       fingerprintPublicKey(proof.public_key_pem)!==expectedDeviceFingerprint||
       response.receipt?.lease_id!==expectedLeaseId) return false;
    const at=Date.parse(proof.statement?.observed_at);
    if(!Number.isFinite(at)||!Number.isFinite(now.getTime())||
       Math.abs(now.getTime()-at)>60000) return false;
    const expected=statementFor({response,nonce:expectedNonce,
      fingerprint:expectedDeviceFingerprint,observedAt:proof.statement.observed_at});
    if(JSON.stringify(expected)!==JSON.stringify(proof.statement))return false;
    return verify(null,Buffer.from(JSON.stringify(expected)),key,Buffer.from(proof.signature,'base64'));
  }catch{return false;}
}
