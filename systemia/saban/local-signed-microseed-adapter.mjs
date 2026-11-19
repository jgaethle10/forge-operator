/**
 * First-party bounded transport for the signed local MicroSeed canary only.
 * This is NOT a generic adapter, remote dispatch, physical field enrollment,
 * or production authority.
 */
import {createHash,randomBytes} from 'node:crypto';
import {verifyNodeAttestation} from '../compute/device-identity.mjs';

const brands=new WeakMap();
const REF=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/;
const DIGEST=/^sha256:[0-9a-f]{64}$/;
const NONCE=/^[A-Za-z0-9._:-]{16,256}$/;
const hash=v=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');

export function validateLocalMicroSeedOrigin(endpoint){
  if(typeof endpoint!=='string'||!endpoint.trim()){
    throw Error('fenced_nodeseed_loopback_origin_required');
  }
  // Reject shorthand or numeric host aliases before WHATWG URL normalizes
  // values such as 127.1 into 127.0.0.1. The request origin has one form.
  if(!/^http:\/\/(?:127\.0\.0\.1|\[::1\]):[1-9][0-9]{0,4}\/?$/.test(endpoint)){
    throw Error('fenced_nodeseed_loopback_origin_denied');
  }
  let url;
  try{url=new URL(endpoint);}catch{
    throw Error('fenced_nodeseed_loopback_origin_invalid');
  }
  // Literal IP only. "localhost" and DNS names could be rebound; no HTTPS
  // redirect to remote sites, credentials, paths, queries or fragments.
  if(url.protocol!=='http:' ||
      !['127.0.0.1','[::1]'].includes(url.hostname) ||
      !/^[1-9][0-9]{0,4}$/.test(url.port) ||
      Number(url.port)>65535 ||
      url.username || url.password ||
      url.pathname!=='/' || url.search || url.hash){
    throw Error('fenced_nodeseed_loopback_origin_denied');
  }
  return url.origin;
}

async function readBoundedLocalJson(response){
  // Attestation and result payloads have the same streamed byte cap.
  const chunks=[];
  let bytes=0;
  if(!response.body)throw Error('fenced_nodeseed_local_response_missing');
  for await(const chunk of response.body){
    bytes+=chunk.byteLength;
    if(bytes>128*1024)throw Error('fenced_nodeseed_local_response_too_large');
    chunks.push(Buffer.from(chunk));
  }
  try{
    return JSON.parse(Buffer.concat(chunks,bytes).toString('utf8'));
  }catch{
    throw Error('fenced_nodeseed_local_response_invalid_json');
  }
}

export function createLocalSignedMicroSeedAdapter({
  endpoint,leaseToken,attestationToken,nodePin,jobKey,workDigest,
  idempotencyKey,payload,timeoutMs=10000
}={}){
  const origin=validateLocalMicroSeedOrigin(endpoint);
  if(typeof leaseToken!=='string'||leaseToken.length<16 ||
     typeof attestationToken!=='string'||attestationToken.length<16 ||
     !REF.test(String(jobKey||''))||!DIGEST.test(String(workDigest||''))||
     !REF.test(String(idempotencyKey||''))||
     !nodePin||!REF.test(String(nodePin.node_id||''))||
     !DIGEST.test(String(nodePin.device_fingerprint||''))||
     !REF.test(String(nodePin.lease_id||''))||
     !NONCE.test(String(nodePin.nonce||'')) ||
     !Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000){
    throw Error('fenced_nodeseed_local_transport_binding_invalid');
  }
  const expected=Object.freeze({
    jobKey,workDigest,idempotencyKey,
    payloadHash:hash(payload),
    nodeId:nodePin.node_id,
    deviceFingerprint:nodePin.device_fingerprint,
    leaseId:nodePin.lease_id,
    nonce:nodePin.nonce
  });
  const runAssignment=async({assignment}={})=>{
    if(assignment?.role!=='source_readiness_auditor' ||
       assignment.work?.workload_class!=='systemia.content-hash.v1'||
       assignment.idempotency_key!==expected.idempotencyKey||
       hash(assignment.item?.payload)!==expected.payloadHash){
      throw Error('fenced_nodeseed_local_assignment_mismatch');
    }
    // A fresh, nonce-bound attestation proves that the loopback endpoint
    // currently controls the independently pinned device key. NodeSeed does
    // not get to self-assert Yard enrollment or physical field authority.
    const challenge=randomBytes(24).toString('hex');
    const attResponse=await fetch(origin+'/v1/attest',{
      method:'POST',redirect:'error',
      headers:{
        'content-type':'application/json',
        authorization:'Bearer '+attestationToken
      },
      body:JSON.stringify({nonce:challenge}),
      signal:AbortSignal.timeout(timeoutMs)
    });
    if(attResponse.status!==200){
      throw Error('fenced_nodeseed_local_attestation_http_denied');
    }
    const attestationResult=await readBoundedLocalJson(attResponse);
    const verified=verifyNodeAttestation({
      attestation:attestationResult.attestation,
      expectedNonce:challenge,expectedNodeId:expected.nodeId,
      maxAgeMs:30000
    });
    if(verified.ok!==true ||
       verified.device_fingerprint!==expected.deviceFingerprint ||
       attestationResult.ok!==true){
      throw Error('fenced_nodeseed_local_attestation_identity_denied');
    }
    // No caller URL, headers, method, payload command or redirect is
    // accepted. Only the registered content-hash worker can be invoked.
    const response=await fetch(origin+'/v1/jobs',{
      method:'POST',redirect:'error',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        lease_id:expected.leaseId,token:leaseToken,
        workload_class:'systemia.content-hash.v1',
        idempotency_key:expected.idempotencyKey,
        execution_nonce:expected.nonce,
        input:{payload:assignment.item.payload}
      }),
      signal:AbortSignal.timeout(timeoutMs)
    });
    if(response.status!==200){
      throw Error('fenced_nodeseed_local_http_status_invalid');
    }
    const result=await readBoundedLocalJson(response);
    if(result?.ok!==true||result?.node_id!==expected.nodeId ||
       result?.workload_class!=='systemia.content-hash.v1'){
      throw Error('fenced_nodeseed_local_response_binding_invalid');
    }
    return result;
  };
  const adapter=Object.freeze({runAssignment});
  brands.set(adapter,Object.freeze({expected,runAssignment}));
  return adapter;
}

export function assertLocalSignedMicroSeedAdapter({adapter,job,nodePin,workDigest}={}){
  const registered=brands.get(adapter);
  const e=registered?.expected;
  if(!e||adapter.runAssignment!==registered.runAssignment ||
     e.jobKey!==job?.job_id || e.workDigest!==workDigest ||
     e.idempotencyKey!==job?.idempotency_key||
     e.payloadHash!==hash(job?.item?.payload)||
     e.nodeId!==nodePin?.node_id ||
     e.deviceFingerprint!==nodePin?.device_fingerprint ||
     e.leaseId!==nodePin?.lease_id||
     e.nonce!==nodePin?.nonce){
    throw Error('fenced_scheduler_first_party_local_adapter_binding_denied');
  }
  return {verified:true,loopback_only:true,registered_hash_only:true,
    remote_execution_authorized:false,physical_field_device_verified:false,
    production_authority_granted:false};
}
