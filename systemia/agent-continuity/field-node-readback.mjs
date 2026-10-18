// Owner-device LOCAL READ-ONLY NodeSeed evidence capture. Safe to run from
// either founder machine after its OWN NodeSeed server is already available.
// Never enrolls an identity, creates NodeSeed keys, starts/restarts daemons,
// opens network listeners, dispatches work, or exports bearer/private keys.
import {randomBytes} from 'node:crypto';
import {fingerprintPublicKey,verifyNodeAttestation} from '../compute/device-identity.mjs';
const schema='evercraft.blackbox.local-nodeseed-field-candidate.v1';
function fail(s){throw Error('NODESEED_LOCAL_FIELD_HELD: '+s)}
function validateEndpoint(endpoint){
 let u;try{u=new URL(endpoint)}catch{fail('invalid loopback endpoint')}
 if(u.protocol!=='http:'||
  !['127.0.0.1','[::1]','localhost'].includes(u.hostname)||
  u.username||u.password||u.pathname!=='/'||u.search||u.hash)fail('local loopback HTTP only');
 return u.origin;
}
async function request(endpoint,method,token,nonce,fetcher){
 const h={accept:'application/json'};
 if(token)h.authorization='Bearer '+token;
 if(method==='POST')h['content-type']='application/json';
 let response;
 try{
  response=await fetcher(endpoint,{method,redirect:'error',headers:h,
   signal:AbortSignal.timeout(4000),
   ...(method==='POST'?{body:JSON.stringify({nonce})}:{})});
 }catch{fail('NodeSeed unavailable on configured local endpoint')}
 if(!response.ok)fail('NodeSeed denied local read-only request: '+response.status);
 const contentLength=Number(response.headers?.get?.('content-length')||0);
 if(contentLength>32768)fail('response oversized');
 const result=await response.json();
 if(!result||typeof result!=='object'||Array.isArray(result))fail('response invalid');
 return result;
}
export async function captureLocalNodeSeedIdentity({endpoint='http://127.0.0.1:42420',
 expectedNodeId,token='',fetcher=fetch,now=new Date(),nonceOverride=null}={}){
 const origin=validateEndpoint(endpoint);
 if(typeof expectedNodeId!=='string'||!/^[a-z0-9][a-z0-9._-]{2,95}$/.test(expectedNodeId))
  fail('expected exact registered node id required');
 const cap=await request(origin+'/v1/capacity','GET',token,null,fetcher);
 if(cap.node_id!==expectedNodeId||cap.runtime!=='Evercraft Compute'||
 cap.attestation_supported!==true)fail('wrong NodeSeed or attestation unavailable');
 const nonce=nonceOverride||randomBytes(24).toString('hex');
 if(!/^[a-f0-9]{48}$/.test(nonce))fail('nonce invalid');
 const response=await request(origin+'/v1/attest','POST',token,nonce,fetcher);
 const att=response.attestation;
 const validity=verifyNodeAttestation({attestation:att,expectedNonce:nonce,
  expectedNodeId,maxAgeMs:60000,now});
 if(!validity.ok)fail('invalid signed fresh attestation: '+validity.reason);
 if(validity.device_fingerprint!==cap.device_fingerprint||
  fingerprintPublicKey(att.public_key_pem)!==cap.device_fingerprint)
  fail('NodeSeed capacity and signed identity disagree');
 if(att.statement.runtime!=='Evercraft Compute'||att.statement.field_claim!==false)
  fail('attempted false field enrollment');
 return {
  schema,
  node_id:expectedNodeId,
  observed_at:now.toISOString(),
  device_fingerprint:validity.device_fingerprint,
  signed_attestation:att,
  local_client_challenge_nonce:nonce,
  host_endpoint_exported:false,
  bearer_token_exported:false,
  private_key_exported:false,
  source_kind:'LOCALLY_OBSERVED_OWNER_DEVICE_CANDIDATE',
  owner_control_plane_pinning_verified:false,
  independently_enrolled_device_verified:false,
  separate_physical_device_verified:false,
  systemia_admission_verified:false,
  remote_spider_action_authorized:false,
  execution_authority:'NONE_READ_ONLY'
 };
}
export function verifyFieldCandidatePacket(p,{expectedNodeId,expectedFingerprint,now=new Date()}={}){
 if(p?.schema!==schema||p.node_id!==expectedNodeId||
 p.device_fingerprint!==expectedFingerprint||
 p.execution_authority!=='NONE_READ_ONLY'||
 p.private_key_exported!==false||p.bearer_token_exported!==false||
 p.owner_control_plane_pinning_verified!==false||
 p.remote_spider_action_authorized!==false)
  fail('field packet identity/authority mismatch');
 const v=verifyNodeAttestation({attestation:p.signed_attestation,
 expectedNonce:p.local_client_challenge_nonce,expectedNodeId,maxAgeMs:60000,now});
 if(!v.ok||v.device_fingerprint!==expectedFingerprint)fail('field packet signature invalid or stale');
 return {node_id:expectedNodeId,device_fingerprint:expectedFingerprint,
  signed_attestation_verified:true,independent_owner_enrollment_verified:false,
  hardware_custody_verified:false,production_release_authorized:false};
}
