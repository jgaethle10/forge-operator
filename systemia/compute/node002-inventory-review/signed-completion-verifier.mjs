/**
 * Node002 signed-completion ENVELOPE verifier, REVIEW HELD.
 * It authenticates only a device-signed claim under an externally pinned
 * public key. It does NOT authenticate physical execution, broker delivery,
 * source custody, issuer grants, active lease, revocation, or OS isolation.
 * No private keys and no remote execution capabilities appear here.
 */
import crypto from 'node:crypto';
import {NODE_ID,NODE_KEY,WORKLOAD_KEY} from './operator-inventory.mjs';

export const SCOPE='evercraft.node002.inventory.completion-envelope.v1';
const DOMAIN='EVERCRAFT-NODE002-INVENTORY-COMPLETION-V1\n';
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const fail=code=>{const err=new Error(code);err.code=code;throw err;};
const fixed=(o,keys)=>{
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype||
  Object.keys(o).sort().join('|')!==[...keys].sort().join('|'))fail('completion_fields_invalid');
};
const SHA=/^sha256:[a-f0-9]{64}$/;
const UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function canonical(o){
 const visited={n:0};
 function sort(v,depth=0){
  if(depth>9||++visited.n>70)fail('completion_complexity_invalid');
  if(v===null||typeof v==='string'||typeof v==='boolean')return v;
  if(typeof v==='number'&&Number.isFinite(v))return v;
  if(Array.isArray(v))return v.map(x=>sort(x,depth+1));
  if(!v||typeof v!=='object'||Object.getPrototypeOf(v)!==Object.prototype)fail('completion_type_invalid');
  const obj={};
  for(const key of Object.keys(v).sort()){
   if(['__proto__','prototype','constructor'].includes(key))fail('completion_key_forbidden');
   obj[key]=sort(v[key],depth+1);
  }
  return obj;
 }
 const s=JSON.stringify(sort(o));
 if(Buffer.byteLength(s)>4096)fail('completion_too_large');
 return s;
}
const sha=bytes=>'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
const stamp=s=>typeof s==='string'&&UTC.test(s)?Date.parse(s):NaN;

/**
 * A signed statement MAY be associated with a real job. It is only a signed
 * claim until independently checked against Systemia admissions and the
 * real HP's durable fence/OS attestation.
 */
export function verifyPinnedNode002Completion(envelope,{
  pinnedDevicePublicKeyPem,
  pinnedDeviceFingerprint,
  expectedJobId,
  expectedRequestId,
  expectedSourceSha256,
  expectedInventorySha256,
  expectedDeviceKeyId,
  expectedNonce,
  now=Date.now(),
}={}){
 if(!pinnedDevicePublicKeyPem||!pinnedDeviceFingerprint)fail('trusted_device_key_missing');
 if(typeof expectedJobId!=='string'||expectedJobId.length<8||
  typeof expectedRequestId!=='string'||expectedRequestId.length<8||
  typeof expectedNonce!=='string'||expectedNonce.length<16||
  typeof expectedDeviceKeyId!=='string'||!/^[-A-Za-z0-9_.:]{8,128}$/.test(expectedDeviceKeyId)||
  typeof expectedSourceSha256!=='string'||!SHA.test(expectedSourceSha256)||
  typeof expectedInventorySha256!=='string'||!SHA.test(expectedInventorySha256))fail('expected_job_scope_missing');
 if(!Number.isFinite(now))fail('clock_invalid');
 fixed(envelope,['statement','signature']);
 const s=envelope.statement,sig=envelope.signature;
 fixed(s,['schema','node_id','node_key','workload_key','job_id','request_id','source_sha256',
  'inventory_sha256','nonce','started_at','completed_at']);
 fixed(sig,['algorithm','key_id','value_base64','scope']);
 if(s.schema!==SCOPE||s.node_id!==NODE_ID||s.node_key!==NODE_KEY||s.workload_key!==WORKLOAD_KEY)
  fail('wrong_node_or_workload');
 if(s.job_id!==expectedJobId||s.request_id!==expectedRequestId||
  s.source_sha256!==expectedSourceSha256||s.inventory_sha256!==expectedInventorySha256||s.nonce!==expectedNonce||!SHA.test(s.inventory_sha256))
  fail('completion_binding_invalid');
 const started=stamp(s.started_at),completed=stamp(s.completed_at);
 if(!Number.isFinite(started)||!Number.isFinite(completed)||completed<started||
  completed-started>120000||completed>now+30000||now-completed>300000)fail('completion_time_invalid');
 if(sig.scope!==SCOPE||sig.algorithm!=='Ed25519'||sig.key_id!==expectedDeviceKeyId||
  typeof sig.value_base64!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(sig.value_base64))
  fail('completion_signature_fields_invalid');
 let pub;
 try{pub=crypto.createPublicKey(pinnedDevicePublicKeyPem)}catch{fail('trusted_device_key_invalid')}
 if(pub.asymmetricKeyType!=='ed25519')fail('trusted_device_key_invalid');
 const der=pub.export({format:'der',type:'spki'});
 // Fingerprint contract: SHA256(SPKI DER) only. Existing NodeSeed PEM-string
 // fingerprints and Raven key IDs are NOT interchangeable without an
 // independently verified, explicit identity mapping.
 if(sha(der)!==pinnedDeviceFingerprint)fail('trusted_device_fingerprint_mismatch');
 const signature=Buffer.from(sig.value_base64,'base64');
 if(signature.length!==64||signature.toString('base64')!==sig.value_base64)fail('signature_encoding_invalid');
 const statementBytes=Buffer.from(DOMAIN+canonical(s),'utf8');
 if(!crypto.verify(null,statementBytes,pub,signature))fail('completion_signature_invalid');
 return Object.freeze({
  schema:'evercraft.node002.signed-claim-verification.v1',
  envelope_signature_valid:true,
  device_public_key_pinned:true,
  statement_sha256:sha(statementBytes),
  physical_execution_verified:false,
  systemia_admission_verified:false,
  live_compute_lease_verified:false,
  revocation_and_atomic_fence_verified:false,
  os_sandbox_verified:false,
  production_completion_verified:false,
  authorization_granted:false,
 });
}
