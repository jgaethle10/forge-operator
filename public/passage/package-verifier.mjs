// Offline, browser-compatible verifier. Does not fetch keys, load scripts or transmit files.
// Trust must be established separately from a received Passage package.
export const PACKAGE_FORMAT='evercraft.passage.signed-text-package.v1';
export const MAX_PACKAGE_BYTES=1500000;
export const MAX_TEXT_BYTES=750000;
const allowedEnvelope=['format','signed_data','signature_base64','content_base64'];
const allowedSigned=['format','publisher','article_id','title','edition','issued_at','expires_at','content_type','filename','byte_length','sha256','rights','review_state'];
const timestamp=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;
const b64=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
function assert(condition,message){if(!condition)throw Error(message)}
function exactlyKeys(value,names,label){
 assert(value&&typeof value==='object'&&!Array.isArray(value),label+' must be an object');
 const keys=Object.keys(value);assert(keys.length===names.length&&keys.every(k=>names.includes(k)),label+' has unexpected or missing fields');
}
function decodeBase64(value,max,label){
 assert(typeof value==='string'&&value.length>0&&value.length<=Math.ceil(max/3)*4+4&&b64.test(value),label+' has invalid base64');
 const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 assert(bytes.length<=max&&btoa(binary)===value,label+' exceeds limits or is not canonical');
 return bytes;
}
function verifyMetadata(envelope,nowMs){
 exactlyKeys(envelope,allowedEnvelope,'Package');assert(envelope.format===PACKAGE_FORMAT,'Unsupported package format');
 const d=envelope.signed_data;exactlyKeys(d,allowedSigned,'Signed metadata');
 assert(d.format===PACKAGE_FORMAT,'Signed format mismatch');
 for(const k of ['publisher','title','rights'])assert(typeof d[k]==='string'&&d[k].length>0&&d[k].length<=500,'Invalid '+k);
 assert(typeof d.article_id==='string'&&/^[a-z0-9-]{1,60}$/.test(d.article_id),'Invalid article ID');
 assert(typeof d.edition==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d.edition),'Invalid edition');
 assert(d.content_type==='text/plain; charset=utf-8','Only plain text is allowed');
 assert(d.filename==='passage-'+d.article_id+'.txt','Filename is not permitted');
 assert(d.review_state==='demonstration-unverified','Unsupported editorial state');
 assert(Number.isSafeInteger(d.byte_length)&&d.byte_length>0&&d.byte_length<=MAX_TEXT_BYTES,'Content size invalid');
 assert(typeof d.sha256==='string'&&/^[a-f0-9]{64}$/.test(d.sha256),'Invalid SHA-256 format');
 for(const k of ['issued_at','expires_at'])assert(typeof d[k]==='string'&&timestamp.test(d[k])&&!Number.isNaN(Date.parse(d[k])),'Invalid '+k);
 const issued=Date.parse(d.issued_at),expires=Date.parse(d.expires_at);
 assert(expires>issued&&expires-issued<=31*86400000,'Invalid package lifetime');
 assert(issued<=nowMs+5*60000,'Package issued too far in the future');
 assert(nowMs<expires,'Package is expired');
 return d;
}
export async function verifySignedPackage(envelopeJson,trustedPublicKeyPem,nowMs=Date.now()){
 assert(typeof envelopeJson==='string'&&new TextEncoder().encode(envelopeJson).byteLength<=MAX_PACKAGE_BYTES,'Package too large');
 let envelope;try{envelope=JSON.parse(envelopeJson)}catch{throw Error('Invalid package JSON')}
 const data=verifyMetadata(envelope,nowMs);
 const content=decodeBase64(envelope.content_base64,MAX_TEXT_BYTES,'Content');
 assert(content.byteLength===data.byte_length,'Content byte length changed');
 const sig=decodeBase64(envelope.signature_base64,64,'Signature');assert(sig.length===64,'Invalid signature length');
 assert(typeof trustedPublicKeyPem==='string'&&trustedPublicKeyPem.length<=5000,'Trusted key is missing');
 const match=trustedPublicKeyPem.trim().match(/^-----BEGIN PUBLIC KEY-----\s*([A-Za-z0-9+/=\s]+)\s*-----END PUBLIC KEY-----$/);
 assert(match,'Provide a separately trusted PEM public key');
 const der=decodeBase64(match[1].replace(/\s+/g,''),2048,'Public key');
 if(!globalThis.crypto?.subtle)throw Error('WebCrypto verification is unavailable in this browser');
 let key;try{key=await globalThis.crypto.subtle.importKey('spki',der,{name:'Ed25519'},false,['verify'])}catch{throw Error('Trusted key is not a supported Ed25519 key')}
 const message=new TextEncoder().encode(JSON.stringify(data));
 const passed=await globalThis.crypto.subtle.verify({name:'Ed25519'},key,sig,message);
 assert(passed,'Signature failed: wrong trusted key or changed signed metadata');
 const digest=new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',content));
 const hex=[...digest].map(x=>x.toString(16).padStart(2,'0')).join('');
 assert(hex===data.sha256,'Content checksum failed');
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(content)}catch{throw Error('Content is not UTF-8 text')}
 const fingerprint=new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',der));
 return {metadata:data,text,fingerprint_sha256:[...fingerprint].map(x=>x.toString(16).padStart(2,'0')).join('')};
}
export function confirmPublisherFingerprint(verification,expected){
 if(typeof expected!=='string')throw Error('Independent publisher fingerprint is required');
 const cleaned=expected.replace(/[:\s]/g,'').toLowerCase();
 assert(/^[a-f0-9]{64}$/.test(cleaned),'Enter a 64-character SHA-256 fingerprint obtained separately');
 assert(verification&&typeof verification.fingerprint_sha256==='string','No successful signature verification');
 assert(cleaned===verification.fingerprint_sha256,'Independent publisher fingerprint does not match this key');
 return verification;
}
