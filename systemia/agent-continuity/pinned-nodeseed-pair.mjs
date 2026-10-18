// Production-boundary READ-ONLY NodeSeed two-member identity preflight.
//
// Unlike the ordinary self-signed NodeSeed /v1/attest verifier, this demands an
// externally configured fixed node-id + public fingerprint allowlist. It can
// never mint owner enrollment, Systemia admission, remote Spider permissions,
// deploy code, acquire leases or execute a workload.
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {verifyNodeAttestation,fingerprintPublicKey} from '../compute/device-identity.mjs';

const FP=/^sha256:[0-9a-f]{64}$/;
const ID=/^[a-z0-9][a-z0-9._-]{2,95}$/;
const HEX=/^[a-f0-9]{40}$/;
function hold(reason){throw Error('BLACKBOX_NODE_PAIR_HELD: '+reason);}
const sha=x=>'sha256:'+createHash('sha256').update(x).digest('hex');
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const validEndpoint=value=>{
 const u=new URL(value);
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||
 u.pathname!=='/'||u.hostname.includes('%')||!u.hostname)hold('unsafe node endpoint');
 // Plain HTTP is permitted only on loopback for synthetic local CI drills;
 // remote owned devices must expose authenticated TLS with distinct pins.
 if(u.protocol==='http:'&&!['127.0.0.1','[::1]','localhost'].includes(u.hostname))
  hold('non-loopback NodeSeed must use HTTPS');
 return u.origin;
};
function validateRegistry(nodes){
 if(!Array.isArray(nodes)||nodes.length!==2)hold('exactly two independently allowed node identities required');
 const ids=new Set(),fps=new Set(),urls=new Set();
 for(const n of nodes){
  if(!isObject(n)||Object.keys(n).sort().join(',')!=='endpoint,expected_fingerprint,expected_node_id')
   hold('registry fields invalid');
  if(typeof n.expected_node_id!=='string'||!ID.test(n.expected_node_id)||
    typeof n.expected_fingerprint!=='string'||!FP.test(n.expected_fingerprint))
   hold('pin invalid');
  const ep=validEndpoint(n.endpoint);
  if(ids.has(n.expected_node_id)||fps.has(n.expected_fingerprint)||urls.has(ep))
   hold('duplicate node identity, key or endpoint');
  ids.add(n.expected_node_id);fps.add(n.expected_fingerprint);urls.add(ep);
 }
 return nodes.map(n=>({...n,endpoint:validEndpoint(n.endpoint)}));
}
async function getJson(url,{token=null,nonce=null,fetcher=fetch}={}){
 const headers={accept:'application/json'};
 if(token)headers.authorization='Bearer '+token;
 if(nonce!==null)headers['content-type']='application/json';
 const res=await fetcher(url,{method:nonce===null?'GET':'POST',
  headers,redirect:'error',signal:AbortSignal.timeout(5000),
  ...(nonce===null?{}:{body:JSON.stringify({nonce})})});
 if(!res.ok)hold('upstream NodeSeed request denied '+res.status);
 const contentLength=Number(res.headers?.get?.('content-length')||0);
 if(contentLength>65536)hold('response oversized');
 const body=await res.json();
 if(!isObject(body))hold('malformed NodeSeed response');
 return body;
}
function verifyPinnedEvidence(capacity,body,pin,nonce,now){
 if(capacity?.node_id!==pin.expected_node_id||
  capacity?.device_fingerprint!==pin.expected_fingerprint||
  capacity?.runtime!=='Evercraft Compute'||
  capacity?.attestation_supported!==true||
  !Array.isArray(capacity.supported_workloads)||
  capacity.supported_workloads.includes('saban.multiplier-assignment.v1')!==true)
  hold('capacity identity/runtime/workload mismatch');
 if(body?.ok!==true||!isObject(body.attestation)||!isObject(body.attestation.statement))
  hold('attestation response missing');
 const att=body.attestation,stmt=att.statement;
 const v=verifyNodeAttestation({attestation:att,expectedNonce:nonce,
  expectedNodeId:pin.expected_node_id,maxAgeMs:60000,now});
 if(v.ok!==true)hold('signature/nonce/age invalid: '+v.reason);
 const observed=fingerprintPublicKey(att.public_key_pem);
 if(observed!==pin.expected_fingerprint||v.device_fingerprint!==pin.expected_fingerprint)
  hold('public key NOT owner-pinned');
 if(stmt.runtime!=='Evercraft Compute'||stmt.field_claim!==false)
  hold('false runtime or self-claimed owner enrollment');
 if(!Array.isArray(stmt.placement_labels)||!Array.isArray(capacity.placement_labels)||
  JSON.stringify(stmt.placement_labels)!==JSON.stringify([...capacity.placement_labels].sort()))
  hold('signed placement labels differ from capacity');
 const expectedWorkloadHash=sha(JSON.stringify([...capacity.supported_workloads].map(String).sort()));
 if(stmt.supported_workloads_hash!==expectedWorkloadHash)
  hold('signed workload list does not match advertised capacity');
 if(typeof stmt.process_started_at!=='string'||!stmt.process_started_at)
  hold('missing process start');
 return {node_id:v.node_id,device_fingerprint:v.device_fingerprint,attested_at:v.observed_at,
  signed_runtime:'Evercraft Compute',nonce_matched:true,workload_manifest_matched:true,
  signed_process_started_at_present:true,boot_id_hash:v.boot_id_hash||null,
  field_claim_verified_false:true};
}
/** Query actual NodeSeed HTTP endpoints. Only a caller's independently
 * configured allowlist qualifies as owner PIN EVIDENCE. Even a green pair
 * cannot establish distinct physical hardware without a separate field gate.
 */
export async function probePinnedNodePair({nodes,tokenByNode={},fetcher=fetch,now=new Date()}={}){
 const pins=validateRegistry(nodes);
 if(!isObject(tokenByNode))hold('node token map invalid');
 const results=[];
 for(const pin of pins){
  const token=tokenByNode[pin.expected_node_id]||null;
  const capacity=await getJson(pin.endpoint+'/v1/capacity',{token,fetcher});
  const nonce=randomBytes(24).toString('hex');
  const evidence=await getJson(pin.endpoint+'/v1/attest',{token,nonce,fetcher});
  results.push(verifyPinnedEvidence(capacity,evidence,pin,nonce,now));
 }
 if(results[0].device_fingerprint===results[1].device_fingerprint||
    results[0].node_id===results[1].node_id)hold('same node tried to vote twice');
 return {
  schema:'evercraft.blackbox.pinned-nodeseed-pair-readonly.v1',
  observed_at:now.toISOString(),
  identities:results,
  two_distinct_pinned_keys_verified:true,
  challenge_response_observed:true,
  signed_supported_workloads_verified:true,
  observed_transport:'DIRECT_READ_ONLY_NODESEED_HTTP_PER_ENDPOINT',
  independent_owner_registry_supplied_by_caller:true,
  hardware_failure_domain_independence_verified:false,
  actual_owner_enrollment_receipts_verified:false,
  systemia_canonical_admission_verified:false,
  production_spider_service_invoked:false,
  external_provider_effect_verified:false,
  containment_release_authorized:false,
  execution_authority:'NONE_READ_ONLY'
 };
}
