// Harbor owner-local retrieval of one SHA256-pinned ENCRYPTED enrollment package.
// The signer and the expected digest/fingerprint must be verified through a
// separate owner-controlled channel. No customer assets, plaintext, or token
// values are displayed. Source code defaults to no network and no writes.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const HARBOR_ENROLLMENT_URL='https://fabric.systemiacommandcenters.com/api/internal/wing-enrollment/v1/harbor';
export const HARBOR_ENROLLMENT_RECEIPT='evercraft.wing-courier.harbor-bootstrap-retrieval.v1';
const HEX=/^[a-f0-9]{64}$/;
const NONCE=/^[a-f0-9]{48}$/;
const fail=x=>{throw Error('harbor_bootstrap_'+x)};

function requirePrivateFile(file){
 if(typeof file!=='string'||!path.isAbsolute(file))fail('absolute_signing_key_required');
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||
    (stat.mode&0o077)!==0||
    (typeof process.getuid==='function'&&stat.uid!==process.getuid()))
    fail('private_signing_key_unsafe');
 let key;try{key=crypto.createPrivateKey(fs.readFileSync(file))}
 catch{fail('signing_key_invalid')}
 if(key.asymmetricKeyType!=='ed25519')fail('signing_key_type_invalid');
 return key;
}
function validatePrivateOutput(output){
 if(typeof output!=='string'||!path.isAbsolute(output))fail('absolute_private_output_required');
 const parent=path.dirname(output);
 let cursor=path.parse(parent).root;
 for(const part of parent.slice(cursor.length).split(path.sep).filter(Boolean)){
  cursor=path.join(cursor,part);
  const st=fs.lstatSync(cursor);
  if(!st.isDirectory()||st.isSymbolicLink())fail('output_parent_symlink_or_invalid');
 }
 const st=fs.lstatSync(parent);
 if((st.mode&0o077)!==0||
    (typeof process.getuid==='function'&&st.uid!==process.getuid()))
    fail('output_parent_not_private');
 // Never follow, replace, truncate, or resume an earlier package.
 try{fs.lstatSync(output);fail('output_exists')}
 catch(e){if(e?.code!=='ENOENT')throw e}
}
async function boundedJson(res,max){
 const length=res.headers?.get?.('content-length');
 if(length!==null&&length!==undefined&&(!/^\d+$/.test(length)||Number(length)>max))
  fail('response_length_invalid');
 if(!res.body?.getReader)fail('response_body_not_streamed');
 const reader=res.body.getReader(),parts=[];let total=0;
 try{
  for(;;){
   const {done,value}=await reader.read();if(done)break;
   total+=value.byteLength;if(total>max)fail('response_oversized');
   parts.push(Buffer.from(value));
  }
 }finally{reader.releaseLock()}
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'))}
 catch{fail('response_not_json')}
}

export async function retrieveHarborBootstrap({
 signingKeyFile,outputFile,expectedSha256,recipientFingerprint,
 fetchImpl=fetch,now=()=>Date.now()
}={}){
 if(!HEX.test(expectedSha256||'')||!HEX.test(recipientFingerprint||''))
  fail('independent_sha_and_recipient_pins_required');
 // Verify local paths and private signer BEFORE sending any network request.
 const signer=requirePrivateFile(signingKeyFile);
 validatePrivateOutput(outputFile);
 const requestOptions={method:'GET',redirect:'manual',cache:'no-store',
  credentials:'omit',signal:AbortSignal.timeout(12000),headers:{accept:'application/json'}};
 const challengeResponse=await fetchImpl(HARBOR_ENROLLMENT_URL,requestOptions);
 if(challengeResponse.status!==200)fail('challenge_unavailable');
 const challenge=await boundedJson(challengeResponse,2048);
 const expiry=Date.parse(challenge?.expiresAt);
 if(challenge?.schema!=='evercraft.wing-courier.enrollment-challenge.v1'||
    !NONCE.test(challenge.nonce||'')||
    challenge.sha256!==expectedSha256||
    challenge.recipientFingerprint!==recipientFingerprint||
    !Number.isFinite(expiry)||expiry<now()||expiry>now()+121000)
   fail('challenge_pins_or_expiry_invalid');
 const claim=Buffer.from(JSON.stringify({
  schema:'evercraft.wing-courier.enrollment-claim.v1',
  nonce:challenge.nonce,sha256:expectedSha256,recipientFingerprint
 }));
 const signed=crypto.sign(null,claim,signer).toString('base64');
 const deliveryResponse=await fetchImpl(HARBOR_ENROLLMENT_URL,{
  method:'POST',redirect:'manual',cache:'no-store',credentials:'omit',
  headers:{accept:'application/json','content-type':'application/json'},
  body:JSON.stringify({nonce:challenge.nonce,signature:signed}),
  signal:AbortSignal.timeout(12000)
 });
 if(deliveryResponse.status!==200)fail('delivery_unavailable');
 const delivery=await boundedJson(deliveryResponse,135000);
 if(delivery?.schema!=='evercraft.wing-courier.enrollment-delivery.v1'||
    delivery.sha256!==expectedSha256||
    typeof delivery.payloadBase64!=='string'||
    delivery.payloadBase64.length>90000||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(delivery.payloadBase64))
    fail('delivery_schema_or_size_invalid');
 const bytes=Buffer.from(delivery.payloadBase64,'base64');
 if(bytes.length<1||bytes.length>65536||
    crypto.createHash('sha256').update(bytes).digest('hex')!==expectedSha256)
    fail('delivery_hash_invalid');
 let decoded;try{decoded=JSON.parse(bytes.toString('utf8'))}
 catch{fail('encrypted_package_invalid')}
 if(decoded?.schema!=='evercraft.harbor.receiver-enrollment.v1'||
    decoded.recipientFingerprint!==recipientFingerprint||
    decoded.format!=='x25519-hkdf-sha256-aes256gcm-v1'||
    Object.keys(decoded).sort().join(',')!==[
      'schema','format','recipientFingerprint','ephemeralPublicKeySpkiBase64',
      'saltBase64','nonceBase64','ciphertextBase64','tagBase64'
    ].sort().join(','))
    fail('encrypted_package_recipient_invalid');
 // Exclusive 0600 private ciphertext file; the owner decrypts separately.
 validatePrivateOutput(outputFile);
 fs.writeFileSync(outputFile,bytes,{flag:'wx',mode:0o600});
 return Object.freeze({
  schema:HARBOR_ENROLLMENT_RECEIPT,status:'PINNED_CIPHERTEXT_VERIFIED',
  sha256:expectedSha256,bytes:bytes.length,
  harborReceiveTokenInstalled:false,harborResidentActivated:false,
  remoteServiceAttested:false,customerFilesMoved:false,
  customerDeliveryAuthorized:false
 });
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [flag,signingKeyFile,outputFile,expectedSha256,recipientFingerprint]=process.argv.slice(2);
 if(flag!=='--fetch'){
  console.log('HELD: owner-only --fetch <private-harbor-sign.key> <new-private-output.enc.json> <independently-verified-package-sha256> <independently-verified-recipient-spki-sha256>');
 }else{
  retrieveHarborBootstrap({signingKeyFile,outputFile,expectedSha256,recipientFingerprint})
    .then(result=>console.log(JSON.stringify(result)))
    .catch(()=>{console.error('HOLD: harbor_signed_private_enrollment_unavailable');process.exitCode=2});
 }
}
