// Evercraft Black Box: role-separated, externally re-checkable LAB receipt chain.
// Deliberately no production authority. Four CI-created signing keys do not imply
// four actual independent services, actual delivery, Passport enrollment or live operations.
import {createHash,createPublicKey,createPrivateKey,sign,verify} from 'node:crypto';

export const LAB_CHAIN_SCHEMA='evercraft.blackbox.detached-lab-receipt-chain.v1';
export const LAB_PURPOSE='evercraft.blackbox.detached-lab-chain.v1';
export const LAB_STAGES=Object.freeze(['producer_lab','delivery_lab','consumer_lab','audit_lab']);
const HEX=/^[a-f0-9]{64}$/;
const IDENT=/^[a-zA-Z0-9_.:@/-]{1,160}$/;
const UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
function hold(message){throw new Error('BLACKBOX_DETACHED_CHAIN_HELD: '+message);}
function own(v){return v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);}
function exact(obj,required,label){
 if(!own(obj)||Object.keys(obj).length!==required.length||required.some(k=>!Object.hasOwn(obj,k)))hold(label+' fields mismatch');
}
function ident(x,label){if(typeof x!=='string'||!IDENT.test(x))hold(label+' invalid');}
function hash(x){return createHash('sha256').update(x).digest('hex');}
function timestamp(x){
 if(typeof x!=='string'||!UTC.test(x)||Number.isNaN(Date.parse(x))||new Date(x).toISOString().slice(0,19)!==x.slice(0,19))hold('invalid timestamp');
}
function signatureBytes(s){
 if(typeof s!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(s))hold('signature encoding invalid');
 const b=Buffer.from(s,'base64');
 if(b.length!==64||b.toString('base64')!==s)hold('noncanonical signature');
 return b;
}
const FIELDS=['schema','stage','chain_id','tenant_id','mission_id','incident_id',
 'artifact_sha256','previous_receipt_sha256','recorded_at','evidence_class',
 'operational_effects_verified','live_service_delivery_verified',
 'canonical_admission','execution_authority'];
const EXPECTED={producer_lab:'SOURCE_HASH_SIGNED_IN_LAB',delivery_lab:'LOCAL_HANDOFF_HASH_RECORDED_IN_LAB',
 consumer_lab:'LOCAL_CONSUMER_HASH_CHECKED_IN_LAB',audit_lab:'DETACHED_SIGNATURE_RECHECK_IN_LAB'};
function payloadOK(p){
 exact(p,FIELDS,'receipt payload');
 if(p.schema!==LAB_CHAIN_SCHEMA||!LAB_STAGES.includes(p.stage))hold('unsupported schema or stage');
 for(const field of ['chain_id','tenant_id','mission_id','incident_id'])ident(p[field],field);
 if(!HEX.test(p.artifact_sha256))hold('artifact digest invalid');
 if(p.previous_receipt_sha256!==null&&!HEX.test(p.previous_receipt_sha256))hold('previous digest invalid');
 timestamp(p.recorded_at);
 if(p.evidence_class!==EXPECTED[p.stage]||p.operational_effects_verified!==false||
   p.live_service_delivery_verified!==false||p.canonical_admission!=='NOT_ADMITTED'||
   p.execution_authority!=='NONE_READ_ONLY')hold('claims exceed lab authority');
}
/** Create a single role-scoped CI LAB receipt. A key cannot be used to assert live verification. */
export function signLabReceipt(payload,{key_id,private_key_pem}){
 payloadOK(payload);ident(key_id,'signer key id');
 if(typeof private_key_pem!=='string')hold('signer private key missing');
 const body=LAB_PURPOSE+'\n'+JSON.stringify(payload);
 let signature;
 try{signature=sign(null,Buffer.from(body),createPrivateKey(private_key_pem)).toString('base64');}
 catch{hold('lab signing failed');}
 return {key_id,purpose:LAB_PURPOSE,payload,signature};
}
function grantOK(grant){
 exact(grant,['public_key_pem','stage','tenant_id','mission_id'],'out-of-band grant');
 if(typeof grant.public_key_pem!=='string'||!LAB_STAGES.includes(grant.stage))hold('grant invalid');
 ident(grant.tenant_id,'grant tenant');ident(grant.mission_id,'grant mission');
}
/** One receipt authenticated against out-of-band read-only trust, never in-band signer keys. */
export function verifyLabReceipt(receipt,trust){
 exact(receipt,['key_id','purpose','payload','signature'],'signed lab receipt');
 if(receipt.purpose!==LAB_PURPOSE)hold('signature purpose mismatch');
 ident(receipt.key_id,'signer key id');
 if(!own(trust)||!Object.hasOwn(trust,receipt.key_id))hold('unknown signer key');
 const grant=trust[receipt.key_id];grantOK(grant);
 payloadOK(receipt.payload);
 if(receipt.payload.stage!==grant.stage||receipt.payload.tenant_id!==grant.tenant_id||
   receipt.payload.mission_id!==grant.mission_id)hold('signer scope or stage mismatch');
 const signed=LAB_PURPOSE+'\n'+JSON.stringify(receipt.payload);
 let good=false;
 try{good=verify(null,Buffer.from(signed),createPublicKey(grant.public_key_pem),signatureBytes(receipt.signature));}
 catch{hold('invalid grant key or signature encoding');}
 if(!good)hold('invalid signature');
 return {stage:receipt.payload.stage,receipt_sha256:hash(signed+'\n'+receipt.signature),key_id:receipt.key_id,
  artifact_sha256:receipt.payload.artifact_sha256,verified:'CONFIGURED_PUBLIC_KEY_SIGNATURE_ONLY'};
}
/**
 * The detached verifier needs only the read-only receipt bundle and out-of-band
 * public-key trust. It asserts key separation in this trust set, not independent
 * organizational key custody or independent live source verification.
 */
export function verifyLabChain(bundle,trust,{tenant_id,mission_id,incident_id,artifact_sha256}={}){
 exact(bundle,['schema','receipts','claim'],'lab chain');
 if(bundle.schema!==LAB_CHAIN_SCHEMA||bundle.claim!=='FOUR_LAB_ROLES_NO_PRODUCTION_AUTHORITY')hold('chain label invalid');
 if(!Array.isArray(bundle.receipts)||bundle.receipts.length!==LAB_STAGES.length)hold('incomplete receipt chain');
 for(const field of ['tenant_id','mission_id','incident_id'])ident(({tenant_id,mission_id,incident_id})[field],field);
 if(!HEX.test(artifact_sha256))hold('expected artifact missing');
 const keys=new Set(),pubs=new Set();
 let previous=null;
 for(let i=0;i<LAB_STAGES.length;i++){
  const receipt=bundle.receipts[i];
  if(receipt?.payload?.stage!==LAB_STAGES[i])hold('chain stage order invalid');
  const verified=verifyLabReceipt(receipt,trust);
  if(keys.has(receipt.key_id))hold('reused signer role');
  keys.add(receipt.key_id);
  const publicKey=trust[receipt.key_id].public_key_pem;
  let fp;
  try{fp=hash(createPublicKey(publicKey).export({type:'spki',format:'der'}));}
  catch{hold('invalid signer public key');}
  if(pubs.has(fp))hold('two roles share same key material');
  pubs.add(fp);
  const p=receipt.payload;
  if(p.tenant_id!==tenant_id||p.mission_id!==mission_id||p.incident_id!==incident_id||
    p.artifact_sha256!==artifact_sha256)hold('chain identity/artifact mismatch');
  if(p.previous_receipt_sha256!==previous)hold('chain broken or reordered');
  previous=verified.receipt_sha256;
 }
 return Object.freeze({
   schema:'evercraft.blackbox.detached-lab-verification.v1',chain_length:4,
   chain_sha256:previous,source_artifact_sha256:artifact_sha256,
   signature_state:'FOUR_ROLE_KEYS_VERIFIED_OUT_OF_BAND_TRUST',
   same_artifact:true,role_keys_distinct:true,
   live_service_delivery_verified:false,provider_effect_verified:false,
   identity_passport_enrollment_verified:false,independent_organization_custody_verified:false,
   systemia_admission_verified:false,production_approval:false,
   execution_authority:'NONE_READ_ONLY'
 });
}
/** Lab packet preparation. Caller explicitly provides private CI test keys; no external action. */
export function assembleLabChain({tenant_id,mission_id,incident_id,chain_id,artifact_sha256,recorded_at,roles}){
 for(const id of [tenant_id,mission_id,incident_id,chain_id])ident(id,'packet scope');
 if(!HEX.test(artifact_sha256))hold('packet digest invalid');
 timestamp(recorded_at);
 if(!Array.isArray(roles)||roles.length!==4)hold('missing role lab keys');
 const receipts=[];let previous=null;
 for(let i=0;i<LAB_STAGES.length;i++){
  if(roles[i].stage!==LAB_STAGES[i])hold('signer stage assignment mismatch');
  const payload={schema:LAB_CHAIN_SCHEMA,stage:roles[i].stage,chain_id,tenant_id,mission_id,incident_id,
    artifact_sha256,previous_receipt_sha256:previous,recorded_at,
    evidence_class:EXPECTED[roles[i].stage],operational_effects_verified:false,
    live_service_delivery_verified:false,canonical_admission:'NOT_ADMITTED',execution_authority:'NONE_READ_ONLY'};
  const receipt=signLabReceipt(payload,roles[i]);
  receipts.push(receipt);
  previous=hash(LAB_PURPOSE+'\n'+JSON.stringify(receipt.payload)+'\n'+receipt.signature);
 }
 return {schema:LAB_CHAIN_SCHEMA,receipts,claim:'FOUR_LAB_ROLES_NO_PRODUCTION_AUTHORITY'};
}
