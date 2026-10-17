// Owner trust boundary for Black Box artifacts. Does not ingest private keys,
// grant Passport scopes, mint canonical admission, or authorize production.
//
// IMPORTANT: A signature verified against public keys INCLUDED IN THE ARTIFACT
// authenticates nothing outside that artifact. A separate owner-controlled
// trust bundle AND separately pinned digest are required to clear that HOLD.
import {createHash,createPublicKey,timingSafeEqual} from 'node:crypto';
import {verifyLabChain,LAB_STAGES} from './detached-receipt-chain.mjs';
import {consumeDetachedLabArtifact} from './detached-artifact-consumer.mjs';

const HEX=/^[a-f0-9]{64}$/;
function hold(reason){throw Error('BLACKBOX_OWNER_TRUST_HELD: '+reason);}
function own(v){return v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);}
const sha=x=>createHash('sha256').update(x).digest('hex');
function eqHash(a,b){
 if(!HEX.test(a)||!HEX.test(b))return false;
 return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
/** Deterministic fingerprint of an independently supplied role-grant set.
 * The caller MUST independently pin the result outside the untrusted artifact.
 */
export function fingerprintOwnerPublicTrust(trust){
 if(!own(trust)||Object.keys(trust).length!==4)hold('four independently configured role grants required');
 const entries=[];
 for(const role of LAB_STAGES){
  const grants=Object.entries(trust).filter(([,g])=>g?.stage===role);
  if(grants.length!==1)hold('exactly one grant per signing role required');
  const [key_id,g]=grants[0];
  if(!/^[a-zA-Z0-9_.:@/-]{1,160}$/.test(key_id)||
    !own(g)||Object.keys(g).sort().join(',')!=='mission_id,public_key_pem,stage,tenant_id'||
    g.tenant_id!=='evercraft'||g.mission_id!=='evercraft-agent-continuity-fabric-20261016')
    hold('grant scope invalid');
  let pub;
  try{
   const key=createPublicKey(g.public_key_pem);
   if(key.asymmetricKeyType!=='ed25519')hold('only Ed25519 role signing public keys accepted');
   pub=key.export({type:'spki',format:'der'}).toString('base64');
  }catch{hold('invalid owner public key');}
  entries.push({role,key_id,tenant_id:g.tenant_id,mission_id:g.mission_id,spki_der_b64:pub});
 }
 return sha(JSON.stringify({schema:'evercraft.blackbox.owner-trust-root-fingerprint.v1',entries}));
}
/**
 * Fail-closed owner-controlled trust preflight.
 * A successful fingerprint match establishes a pinned role trust set only,
 * not independent Passport issuance or production run/consumer health.
 */
export function assessOwnerTrustAnchor({artifact,configured_public_trust=null,owner_pinned_sha256=null}={}){
 const lab=consumeDetachedLabArtifact(artifact);
 const base={
  schema:'evercraft.blackbox.owner-trust-preflight.v1',
  incident_id:lab.incident_id,source_manifest_sha256:lab.source_event_hash_manifest_sha256,
  self_contained_lab_signature_check:'PASSED_NOT_OWNER_AUTHORIZATION',
  independently_pinned_trust_verified:false,independent_passport_issuer_verified:false,
  canonical_systemia_admission_verified:false,live_service_consumer_verified:false,
  provider_side_effect_verified:false,release_authorized:false,
  execution_authority:'NONE_READ_ONLY'
 };
 if(!owner_pinned_sha256||!HEX.test(owner_pinned_sha256))
  return {...base,state:'HELD_OWNER_TRUST_FINGERPRINT_NOT_CONFIGURED'};
 if(!configured_public_trust)
  return {...base,state:'HELD_SEPARATE_OWNER_PUBLIC_TRUST_NOT_CONFIGURED'};
 // Config must be independently provisioned in the consuming environment,
 // never derived from artifact.detached_public_trust.
 const observed=fingerprintOwnerPublicTrust(configured_public_trust);
 if(!eqHash(observed,owner_pinned_sha256))hold('independent owner-trust fingerprint mismatch');
 const scope={tenant_id:'evercraft',mission_id:'evercraft-agent-continuity-fabric-20261016',
   incident_id:artifact.source_incident_id,artifact_sha256:artifact.source_artifact_sha256};
 verifyLabChain(artifact.receipt_chain,configured_public_trust,scope);
 return {...base,state:'PINNED_SIGNATURE_SET_VERIFIED_LAB_ONLY',
  independently_pinned_trust_verified:true,
  owner_public_trust_sha256:observed,
  note:'Pinned public-key chain only: no issuer enrollment, canonical admission, live downstream consumer or effect authority.'};
}
