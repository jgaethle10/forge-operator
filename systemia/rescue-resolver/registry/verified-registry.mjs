/**
 * Evercraft Rescue Mesh owner-authorized registry prototype.
 * No owner key = no signed rescue; a mere claim of owning a domain is worthless.
 * This has no registrar, browser, network update, or mutation authority.
 */
import { createPublicKey, verify as edVerify, sign as edSign } from 'node:crypto';

const MANIFEST='evercraft.rescue.manifest.v1';
const REVOCATION='evercraft.rescue.revocation.v1';
const POLICY='evercraft.rescue.trust-anchor.v1';
const MAX_SECONDS=72*3600;
const MAX_PROBE_BYTES=1024*1024;
const LIMITS={ notice:400, marker:240 };
const b64url=/^[A-Za-z0-9_-]{80,200}$/;
const shaHost=/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const allowedKeys=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&
 Object.keys(obj).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(obj,k));
const text=(x,max)=>typeof x==='string'&&x.length>0&&x.length<=max&&!/[\u0000-\u001f\u007f]/.test(x);
const instant=(t)=>typeof t==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(t)&&
 Number.isFinite(Date.parse(t))&&new Date(Date.parse(t)).toISOString()===t;
function host(h){return typeof h==='string'&&h===h.toLowerCase()&&h.length<=253&&shaHost.test(h)&&!h.endsWith('.local');}
function exactHttps(value){
 try{
  const u=new URL(value);
  return u.href===value&&u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&
    !u.port&&host(u.hostname)&&u.pathname.startsWith('/');
 }catch{return false;}
}
function pinnedKey(key){
 try {
   if(typeof key!=='string'||!key.startsWith('-----BEGIN PUBLIC KEY-----'))return false;
   return createPublicKey(key).asymmetricKeyType==='ed25519';
 }catch{return false;}
}
function signingBytes(payload) {
 // Canonical fixed-schema serialization: all dictionary insertion orders equal.
 return Buffer.from(JSON.stringify(sortKeys(payload)),'utf8');
}
function sortKeys(v){return Array.isArray(v)?v.map(sortKeys):
 v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype?
 Object.fromEntries(Object.keys(v).sort().map(k=>[k,sortKeys(v[k])])):v;}
function verifySignature(envelope,key) {
 try{
  if(!allowedKeys(envelope,['payload','signature'])||!b64url.test(envelope.signature)||!pinnedKey(key))return false;
  return edVerify(null,signingBytes(envelope.payload),key,Buffer.from(envelope.signature,'base64url'));
 }catch{return false;}
}
function timeWindow(payload,now){
 if(!instant(payload.issued_at)||!instant(payload.expires_at))return false;
 const begin=Date.parse(payload.issued_at),end=Date.parse(payload.expires_at);
 return end>begin&&end-begin<=MAX_SECONDS*1000&&begin<=now&&now<end;
}
function mirrorsValid(mirrors,subject,approvedOrigins) {
 if(!Array.isArray(approvedOrigins)||approvedOrigins.length<1||approvedOrigins.length>8||
    approvedOrigins.some(origin=>{
      try{const u=new URL(origin);return u.protocol!=='https:'||u.origin!==origin||u.hostname===subject||!host(u.hostname);}catch{return true;}
    })||new Set(approvedOrigins).size!==approvedOrigins.length)return false;
 if(!Array.isArray(mirrors)||mirrors.length<1||mirrors.length>4)return false;
 const seen=new Set(),ranks=new Set();
 for(const m of mirrors) {
   if(!allowedKeys(m,['url','priority','markers']))return false;
   if(!exactHttps(m.url)||new URL(m.url).hostname===subject||
       !approvedOrigins.includes(new URL(m.url).origin)||seen.has(m.url))return false;
   if(!Number.isInteger(m.priority)||m.priority<1||m.priority>10||ranks.has(m.priority))return false;
   if(!Array.isArray(m.markers)||m.markers.length<1||m.markers.length>3||
      m.markers.some(t=>!text(t,LIMITS.marker)||t.length<8))return false;
   seen.add(m.url);ranks.add(m.priority);
 }
 return true;
}
function payloadValid(p,expectedHost,now,approvedOrigins){
 if(!allowedKeys(p,['schema','subject_host','revision','issued_at','expires_at','notice','mirrors']))return false;
 return p.schema===MANIFEST&&host(p.subject_host)&&p.subject_host===expectedHost&&
 Number.isSafeInteger(p.revision)&&p.revision>0&&timeWindow(p,now)&&
 text(p.notice,LIMITS.notice)&&p.notice.includes('independent')&&
 mirrorsValid(p.mirrors,p.subject_host,approvedOrigins);
}
function trustedPolicyValid(policy,expectedHost){
 return allowedKeys(policy,['schema','subject_host','owner_key_pem','authority_verified','minimum_revision','approved_mirror_origins'])&&
 policy.schema===POLICY&&policy.subject_host===expectedHost&&host(expectedHost)&&
 policy.authority_verified===true&&pinnedKey(policy.owner_key_pem)&&
 Number.isSafeInteger(policy.minimum_revision)&&policy.minimum_revision>=0&&
 Array.isArray(policy.approved_mirror_origins)&&policy.approved_mirror_origins.length>0;
}
function revocationValid(envelope,policy,now){
 const p=envelope?.payload;
 if(!allowedKeys(p,['schema','subject_host','revoked_through_revision','issued_at','expires_at']))return false;
 return p.schema===REVOCATION&&p.subject_host===policy.subject_host&&
 Number.isSafeInteger(p.revoked_through_revision)&&p.revoked_through_revision>=0&&
 timeWindow(p,now)&&verifySignature(envelope,policy.owner_key_pem);
}

/**
 * Revocation requirement: callers MUST pass a fresh signed status envelope,
 * even if the revocation floor is zero. No network=fail closed.
 */
export function verifyRescueManifest({
 envelope,policy,revocationEnvelope,expectedHost,now=Date.now()
}={}) {
 const block=reason=>({verified:false,reason,mirrors:[],automatic_routing_authorized:false});
 if(!trustedPolicyValid(policy,expectedHost))return block('missing_verified_owner_trust_anchor');
 if(!payloadValid(envelope?.payload,expectedHost,now,policy.approved_mirror_origins))return block('invalid_or_expired_manifest');
 if(!verifySignature(envelope,policy.owner_key_pem))return block('invalid_owner_signature');
 if(!revocationValid(revocationEnvelope,policy,now))return block('missing_or_invalid_fresh_revocation_status');
 const floor=Math.max(policy.minimum_revision,revocationEnvelope.payload.revoked_through_revision);
 if(envelope.payload.revision<=floor)return block('revoked_or_replayed_revision');
 return {
  verified:true,reason:'owner_attestation_verified',
  revision:envelope.payload.revision,
  notice:envelope.payload.notice,
  mirrors:[...envelope.payload.mirrors].sort((a,b)=>a.priority-b.priority),
  // Even verified owner keys do not permit remote silent browser rewrites.
  automatic_routing_authorized:false,
  opt_in_user_review_required:true,
  original_domain_dns_control:false,
 };
}
export async function selectVerifiedHealthyMirror({
 verifiedResult,fetchImpl=fetch,timeoutMs=3500
}={}) {
 if(verifiedResult?.verified!==true)return {url:null,reason:'unverified_manifest'};
 for(const entry of verifiedResult.mirrors) {
  try{
   const response=await fetchImpl(entry.url,{
    method:'GET',redirect:'error',signal:AbortSignal.timeout(timeoutMs),
    headers:{accept:'text/html'}
   });
   if(response.status!==200||!(response.headers.get('content-type')||'').includes('text/html'))continue;
   const length=Number(response.headers.get('content-length')||0);
   if(length>MAX_PROBE_BYTES)continue;
   const html=await response.text();
   if(Buffer.byteLength(html)>MAX_PROBE_BYTES||html.includes('[APP UNAVAILABLE]'))continue;
   if(entry.markers.every(m=>html.includes(m))){
     return {url:entry.url,reason:'healthy_verified_mirror',priority:entry.priority};
   }
  }catch{/* a failed mirror never becomes a live redirect */}
 }
 return {url:null,reason:'all_verified_mirrors_unavailable'};
}
// For test fixtures only: use fresh throwaway signer keys, never commit any secret.
export function signTestEnvelope(payload,privateKey){
 const signature=edSign(null,signingBytes(payload),privateKey).toString('base64url');
 return {payload,signature};
}
export const REGISTRY_SCHEMAS=Object.freeze({MANIFEST,REVOCATION,POLICY});
