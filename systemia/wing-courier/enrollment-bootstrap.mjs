// Owner-controlled, disabled-by-default bootstrap for one encrypted Fallen credential.
// No bearer token or plaintext credential is exposed by this module.
// A signed challenge proves possession of NextGen's enrolled Ed25519 identity.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
export const BOOTSTRAP_PATH='/api/internal/wing-enrollment/v1/fallen';
const EXPECTED_HOST='fabric.systemiacommandcenters.com';
const HEX=/^[a-f0-9]{64}$/;
const LIMIT=65536;
const deny=(res,status)=>{const body=Buffer.from(JSON.stringify({error:'enrollment_unavailable'}));res.writeHead(status,{'content-type':'application/json','content-length':body.length,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(body);};
function claimMarkerPath(stateDir,sha256){
 if(typeof stateDir!=='string'||!path.isAbsolute(stateDir))throw Error('absolute_claim_state_required');
 const dir=fs.lstatSync(stateDir);
 if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077))throw Error('claim_state_dir_not_private');
 return path.join(stateDir,'fallen-bootstrap-'+sha256+'.claimed');
}
function alreadyClaimed(marker){
 try{
  const stat=fs.lstatSync(marker);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077))throw Error('claim_marker_unsafe');
  return true;
 }catch(e){if(e.code==='ENOENT')return false;throw e;}
}
function consumeClaim(marker,nonce){
 // O_EXCL creates the marker atomically across processes and survives restarts.
 // Fail closed if a response is interrupted: never delete or retry automatically.
 const fd=fs.openSync(marker,'wx',0o600);
 try{
  fs.writeSync(fd,JSON.stringify({schema:'evercraft.wing-courier.bootstrap-claim.v1',nonceSha256:crypto.createHash('sha256').update(nonce).digest('hex'),claimedAt:new Date().toISOString()})+'\n');
  fs.fsyncSync(fd);
 }finally{fs.closeSync(fd);}
 const dirFd=fs.openSync(path.dirname(marker),'r');
 try{fs.fsyncSync(dirFd);}finally{fs.closeSync(dirFd);}
}
function checkedFile(file,max,privateRequired=false){
 if(typeof file!=='string'||!file.startsWith('/')||!file)throw Error('absolute_file_required');
 const s=fs.lstatSync(file);
 if(!s.isFile()||s.isSymbolicLink()||s.size>max||(privateRequired&&(s.mode&0o077)))throw Error('unsafe_file');
 return fs.readFileSync(file);
}
export function createFallenBootstrap({enabled=false,packageFile='',signerPublicKeyFile='',expectedSha256='',recipientFingerprint='',ttlMs=60000,maxClaims=1,claimStateDir='',now=()=>Date.now()}={}){
 if(!Number.isInteger(ttlMs)||ttlMs<1000||ttlMs>120000)throw Error('invalid_ttl');
 if(!Number.isInteger(maxClaims)||maxClaims!==1)throw Error('one_claim_only');
 const nonces=new Map();let claims=0;
 let marker=null;
 if(enabled){
  if(!HEX.test(expectedSha256)||!HEX.test(recipientFingerprint))throw Error('expected_pins_required');
  marker=claimMarkerPath(claimStateDir,expectedSha256);
  const publicKey=crypto.createPublicKey(checkedFile(signerPublicKeyFile,8192));
  if(publicKey.asymmetricKeyType!=='ed25519')throw Error('wrong_signer_key');
  const payload=checkedFile(packageFile,LIMIT,true);
  const digest=crypto.createHash('sha256').update(payload).digest('hex');
  if(digest!==expectedSha256)throw Error('enrollment_package_hash_mismatch');
  const parsed=JSON.parse(payload.toString('utf8'));
  if(parsed.schema!=='evercraft.fallen.receiver-enrollment.v1'||parsed.recipientFingerprint!==recipientFingerprint)
   throw Error('recipient_binding_invalid');
 }
 async function handle(req,res){
  const route=new URL(String(req.url||'/'),'http://fabric.local');
  if(route.pathname!==BOOTSTRAP_PATH)return false;
  if(!enabled)return deny(res,404),true;
  if(String(req.headers.host||'').toLowerCase().replace(/:\d+$/,'')!==EXPECTED_HOST||route.search)
   return deny(res,404),true;
  if(claims>=maxClaims||alreadyClaimed(marker))return deny(res,410),true;
  for(const [n,exp] of nonces)if(exp<now())nonces.delete(n);
  if(req.method==='GET'){
   if(nonces.size>=16)return deny(res,429),true;
   const nonce=crypto.randomBytes(24).toString('hex'),expires=now()+ttlMs;
   nonces.set(nonce,expires);
   const body=Buffer.from(JSON.stringify({schema:'evercraft.wing-courier.enrollment-challenge.v1',nonce,expiresAt:new Date(expires).toISOString(),sha256:expectedSha256,recipientFingerprint}));
   res.writeHead(200,{'content-type':'application/json','content-length':body.length,'cache-control':'no-store'});res.end(body);return true;
  }
  if(req.method!=='POST')return deny(res,405),true;
  let bytes=0,chunks=[];
  let stage='read_body';
  try{
   for await(const chunk of req){bytes+=chunk.length;if(bytes>2048)throw Error('oversized');chunks.push(chunk);}
   stage='parse_claim';
   const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(Object.keys(input).sort().join(',')!=='nonce,signature'||typeof input.nonce!=='string'||!nonceSafe(input.nonce)||typeof input.signature!=='string')throw Error('malformed');
   stage='find_challenge';
   const expiry=nonces.get(input.nonce);
   nonces.delete(input.nonce); // consume before verification, including failures
   if(!expiry||expiry<now())throw Error('nonce_expired');
   stage='verify_signature';
   const statement=Buffer.from(JSON.stringify({schema:'evercraft.wing-courier.enrollment-claim.v1',nonce:input.nonce,sha256:expectedSha256,recipientFingerprint}));
   const sig=Buffer.from(input.signature,'base64');
   if(sig.length!==64||!crypto.verify(null,statement,crypto.createPublicKey(checkedFile(signerPublicKeyFile,8192)),sig))throw Error('signature_invalid');
   // Re-read at claim time: a changed package cannot be delivered.
   stage='read_package';
   const payload=checkedFile(packageFile,LIMIT,true);
   if(crypto.createHash('sha256').update(payload).digest('hex')!==expectedSha256)throw Error('package_changed');
   stage='consume_durable_claim';
   consumeClaim(marker,input.nonce);
   claims++;
   nonces.clear();
   const body=Buffer.from(JSON.stringify({schema:'evercraft.wing-courier.enrollment-delivery.v1',sha256:expectedSha256,payloadBase64:payload.toString('base64')}));
   res.writeHead(200,{'content-type':'application/json','content-length':body.length,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(body);return true;
  }catch{
   // Fixed, nonsecret stage labels only. No nonce, signature, key, path, token or request body.
   // Public response deliberately remains indistinguishable across POST failures.
   console.error('fallen_bootstrap_claim_denied stage='+stage);
   return deny(res,403),true;
  }
 }
 return {handle};
}
function nonceSafe(n){return /^[0-9a-f]{48}$/.test(n);}
