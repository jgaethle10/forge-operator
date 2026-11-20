// Owner-local Harbor receiver credential packaging, private X25519 ECDH +
// HKDF-SHA256 + AES-256-GCM only. No network, no broker writes, no token output.
// The actual one-time Harbor receive token is generated/approved elsewhere
// and must be encrypted to the independently pinned Harbor recipient.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const HARBOR_ENROLLMENT_SCHEMA='evercraft.harbor.receiver-enrollment.v1';
export const HARBOR_ENROLLMENT_FORMAT='x25519-hkdf-sha256-aes256gcm-v1';
const INFO=Buffer.from('evercraft.wing-courier.harbor.receiver-enrollment.v1');
const HEX=/^[0-9a-f]{64}$/;
const fail=s=>{throw Error('harbor_enrollment_package_'+s)};
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function ownedFile(file,{privateFile=false}={}){
 if(typeof file!=='string'||!path.isAbsolute(file))fail('absolute_file_required');
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||
    st.size>65536||(privateFile&&((st.mode&0o077)!==0||
    (typeof process.getuid==='function'&&st.uid!==process.getuid()))))
   fail('file_untrusted');
 return fs.readFileSync(file);
}
function sealedOutput(file){
 if(typeof file!=='string'||!path.isAbsolute(file))fail('absolute_output_required');
 const dir=path.dirname(file);
 let cur=path.parse(dir).root;
 for(const component of dir.slice(cur.length).split(path.sep).filter(Boolean)){
  cur=path.join(cur,component);
  const st=fs.lstatSync(cur);
  if(!st.isDirectory()||st.isSymbolicLink())fail('output_parent_symlink');
 }
 const st=fs.lstatSync(dir);
 if((st.mode&0o077)!==0||
    (typeof process.getuid==='function'&&st.uid!==process.getuid()))
   fail('output_parent_not_private');
 try{fs.lstatSync(file);fail('output_already_exists')}
 catch(e){if(e?.code!=='ENOENT')throw e}
}
function ensureToken(raw){
 if(raw.length<32||raw.length>512||!/^[\x21-\x7e]+$/.test(raw.toString('utf8')))
   fail('token_format_invalid');
 if(!raw.equals(Buffer.from(raw.toString('utf8'))))fail('token_encoding_invalid');
}
function privateKey(file){
 let key;try{key=crypto.createPrivateKey(ownedFile(file,{privateFile:true}))}
 catch{fail('recipient_private_key_invalid')}
 if(key.asymmetricKeyType!=='x25519')fail('recipient_key_wrong_type');
 return key;
}
function pubFingerprint(key){
 return sha(key.export({format:'der',type:'spki'}));
}
const aad=fp=>Buffer.from(HARBOR_ENROLLMENT_SCHEMA+':'+fp);

export function createEncryptedHarborEnrollment({
 receiveTokenFile,recipientPublicKeyFile,expectedRecipientFingerprint,outputFile,
}={}){
 if(!HEX.test(expectedRecipientFingerprint||''))fail('trusted_recipient_pin_required');
 sealedOutput(outputFile);
 const token=ownedFile(receiveTokenFile,{privateFile:true});
 ensureToken(token);
 let recipient;
 try{recipient=crypto.createPublicKey(ownedFile(recipientPublicKeyFile))}
 catch{fail('recipient_public_key_invalid')}
 if(recipient.asymmetricKeyType!=='x25519'||
    pubFingerprint(recipient)!==expectedRecipientFingerprint)
   fail('recipient_public_key_untrusted');
 const eph=crypto.generateKeyPairSync('x25519');
 const salt=crypto.randomBytes(16),nonce=crypto.randomBytes(12);
 const secret=crypto.diffieHellman({privateKey:eph.privateKey,publicKey:recipient});
 const key=Buffer.from(crypto.hkdfSync('sha256',secret,salt,INFO,32));
 try{
  const cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);
  cipher.setAAD(aad(expectedRecipientFingerprint));
  const ciphertext=Buffer.concat([cipher.update(token),cipher.final()]);
  const data={
   schema:HARBOR_ENROLLMENT_SCHEMA,format:HARBOR_ENROLLMENT_FORMAT,
   recipientFingerprint:expectedRecipientFingerprint,
   ephemeralPublicKeySpkiBase64:eph.publicKey.export({type:'spki',format:'der'}).toString('base64'),
   saltBase64:salt.toString('base64'),nonceBase64:nonce.toString('base64'),
   ciphertextBase64:ciphertext.toString('base64'),
   tagBase64:cipher.getAuthTag().toString('base64'),
  };
  const bytes=Buffer.from(JSON.stringify(data)+'\n','utf8');
  sealedOutput(outputFile);
  fs.writeFileSync(outputFile,bytes,{flag:'wx',mode:0o600});
  return Object.freeze({schema:'evercraft.wing-courier.harbor-enrollment-package-created.v1',
   sha256:sha(bytes),bytes:bytes.length,
   recipientFingerprint:expectedRecipientFingerprint,
   plaintextReturned:false,tokenInstalledOnHarbor:false,
   transferAttempted:false,serviceActivated:false});
 }finally{key.fill(0);secret.fill(0);token.fill(0)}
}
function strictB64(value,max){
 if(typeof value!=='string'||value.length>max||!value.length||
   !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
  fail('encrypted_fields_invalid');
 const v=Buffer.from(value,'base64');
 if(v.toString('base64')!==value)fail('base64_noncanonical');
 return v;
}
export function openEncryptedHarborEnrollment({
 packageFile,recipientPrivateKeyFile,expectedPackageSha256,
 expectedRecipientFingerprint,outputTokenFile
}={}){
 if(!HEX.test(expectedPackageSha256||'')||!HEX.test(expectedRecipientFingerprint||''))
  fail('independently_pinned_package_and_recipient_required');
 sealedOutput(outputTokenFile);
 const bytes=ownedFile(packageFile,{privateFile:true});
 if(sha(bytes)!==expectedPackageSha256)fail('package_digest_invalid');
 let v;try{v=JSON.parse(bytes.toString('utf8'))}
 catch{fail('package_json_invalid')}
 const keys=['schema','format','recipientFingerprint','ephemeralPublicKeySpkiBase64',
  'saltBase64','nonceBase64','ciphertextBase64','tagBase64'];
 if(!v||typeof v!=='object'||Array.isArray(v)||
    Object.keys(v).sort().join(',')!==keys.sort().join(',')||
    v.schema!==HARBOR_ENROLLMENT_SCHEMA||v.format!==HARBOR_ENROLLMENT_FORMAT||
    v.recipientFingerprint!==expectedRecipientFingerprint)
  fail('package_fields_invalid');
 const ephDer=strictB64(v.ephemeralPublicKeySpkiBase64,1024);
 const salt=strictB64(v.saltBase64,40),nonce=strictB64(v.nonceBase64,40);
 const ciphertext=strictB64(v.ciphertextBase64,1024),tag=strictB64(v.tagBase64,40);
 if(salt.length!==16||nonce.length!==12||tag.length!==16||
   ciphertext.length<32||ciphertext.length>512)
  fail('package_crypto_lengths_invalid');
 let eph;try{eph=crypto.createPublicKey({key:ephDer,format:'der',type:'spki'})}
 catch{fail('ephemeral_public_key_invalid')}
 if(eph.asymmetricKeyType!=='x25519')fail('ephemeral_key_type_invalid');
 const recipient=privateKey(recipientPrivateKeyFile);
 if(pubFingerprint(crypto.createPublicKey(recipient))!==expectedRecipientFingerprint)
  fail('private_key_recipient_mismatch');
 const secret=crypto.diffieHellman({privateKey:recipient,publicKey:eph});
 const key=Buffer.from(crypto.hkdfSync('sha256',secret,salt,INFO,32));
 let plaintext;
 try{
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,nonce);
  decipher.setAAD(aad(expectedRecipientFingerprint));decipher.setAuthTag(tag);
  plaintext=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
  ensureToken(plaintext);
  sealedOutput(outputTokenFile);
  fs.writeFileSync(outputTokenFile,plaintext,{flag:'wx',mode:0o600});
  return Object.freeze({schema:'evercraft.wing-courier.harbor-enrollment-opened.v1',
   status:'PRIVATE_SCOPED_CREDENTIAL_WRITTEN',
   packageSha256:expectedPackageSha256,
   recipientFingerprint:expectedRecipientFingerprint,
   tokenBytes:plaintext.length,tokenDisplayed:false,
   authenticatedBrokerVerified:false,residentActivated:false,
   customerMediaTransferred:false,customerDeliveryAuthorized:false});
 }catch(e){
  if(e?.message?.startsWith('harbor_enrollment_package_'))throw e;
  fail('cryptographic_authentication_failed');
 }finally{key.fill(0);secret.fill(0);plaintext?.fill(0)}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [action,...args]=process.argv.slice(2);
 try{
  if(action==='--prepare'&&args.length===4){
   console.log(JSON.stringify(createEncryptedHarborEnrollment({
    receiveTokenFile:args[0],recipientPublicKeyFile:args[1],
    expectedRecipientFingerprint:args[2],outputFile:args[3]
   })));
  }else if(action==='--open'&&args.length===5){
   console.log(JSON.stringify(openEncryptedHarborEnrollment({
    packageFile:args[0],recipientPrivateKeyFile:args[1],
    expectedPackageSha256:args[2],expectedRecipientFingerprint:args[3],
    outputTokenFile:args[4]
   })));
  }else{
   console.log('HELD: --prepare <private-receiver-token> <verified-harbor-x25519-public-key> <pinned-recipient-spki-sha256> <new-private-encrypted-package> OR --open <private-encrypted-package> <private-harbor-x25519-key> <pinned-package-sha256> <pinned-recipient-spki-sha256> <new-private-receiver-token-path>');
  }
 }catch{console.error('HOLD: harbor_enrollment_package_preflight_or_crypto_failed');process.exitCode=2}
}
