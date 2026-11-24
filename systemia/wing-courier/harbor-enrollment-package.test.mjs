import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createEncryptedHarborEnrollment,openEncryptedHarborEnrollment,
 HARBOR_ENROLLMENT_SCHEMA,HARBOR_ENROLLMENT_FORMAT} from './harbor-enrollment-package.mjs';

function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'wing-harbor-sealed-'));fs.chmodSync(root,0o700);
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const pair=crypto.generateKeyPairSync('x25519');
 const privateKey=path.join(root,'receiver.key'),pub=path.join(root,'receiver.pub');
 fs.writeFileSync(privateKey,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 fs.writeFileSync(pub,pair.publicKey.export({type:'spki',format:'pem'}),{mode:0o600});
 const recipientFingerprint=crypto.createHash('sha256').update(
  pair.publicKey.export({type:'spki',format:'der'})).digest('hex');
 const token='HARBOR_TEST_SCOPED_TOKEN_'+crypto.randomBytes(35).toString('hex');
 const tokenFile=path.join(root,'harbor-receive.token');
 fs.writeFileSync(tokenFile,token,{mode:0o600});
 const packageFile=path.join(root,'harbor-encrypted.enc.json');
 const opened=path.join(root,'installed-private.token');
 const prep=()=>createEncryptedHarborEnrollment({receiveTokenFile:tokenFile,
  recipientPublicKeyFile:pub,expectedRecipientFingerprint:recipientFingerprint,
  outputFile:packageFile});
 const open=(sha,options={})=>openEncryptedHarborEnrollment({
  packageFile,recipientPrivateKeyFile:privateKey,expectedPackageSha256:sha,
  expectedRecipientFingerprint:recipientFingerprint,outputTokenFile:opened,
  ...options
 });
 return {root,privateKey,pub,recipientFingerprint,token,tokenFile,packageFile,opened,prep,open};
}
test('complete local Harbor prepare/open roundtrip encrypts scoped token to pinned recipient',t=>{
 const fx=fixture(t);
 const created=fx.prep();
 assert.equal(created.plaintextReturned,false);
 assert.equal(created.transferAttempted,false);
 assert.equal(created.tokenInstalledOnHarbor,false);
 assert.equal(created.recipientFingerprint,fx.recipientFingerprint);
 assert.equal(fs.statSync(fx.packageFile).mode&0o077,0);
 const bytes=fs.readFileSync(fx.packageFile,'utf8');
 assert.equal(bytes.includes(fx.token),false);
 const parsed=JSON.parse(bytes);
 assert.equal(parsed.schema,HARBOR_ENROLLMENT_SCHEMA);
 assert.equal(parsed.format,HARBOR_ENROLLMENT_FORMAT);
 assert.equal(parsed.recipientFingerprint,fx.recipientFingerprint);
 assert.equal(Object.hasOwn(parsed,'token'),false);
 const opened=fx.open(created.sha256);
 assert.equal(opened.status,'PRIVATE_SCOPED_CREDENTIAL_WRITTEN');
 assert.equal(opened.authenticatedBrokerVerified,false);
 assert.equal(opened.residentActivated,false);
 assert.equal(opened.customerMediaTransferred,false);
 assert.equal(fs.statSync(fx.opened).mode&0o077,0);
 assert.equal(fs.readFileSync(fx.opened,'utf8'),fx.token);
 assert.doesNotMatch(JSON.stringify({created,opened}),new RegExp(fx.token));
 assert.throws(()=>fx.open(created.sha256),/output_already_exists/);
 assert.equal(fs.readFileSync(fx.opened,'utf8'),fx.token);
});
test('wrong recipient signing pin or wrong key type cannot encrypt token',t=>{
 const fx=fixture(t);
 assert.throws(()=>createEncryptedHarborEnrollment({
  receiveTokenFile:fx.tokenFile,recipientPublicKeyFile:fx.pub,
  expectedRecipientFingerprint:'0'.repeat(64),outputFile:fx.packageFile
 }),/recipient_public_key_untrusted/);
 assert.equal(fs.existsSync(fx.packageFile),false);
 const ed=crypto.generateKeyPairSync('ed25519');
 fs.writeFileSync(fx.pub,ed.publicKey.export({type:'spki',format:'pem'}));
 assert.throws(()=>fx.prep(),/recipient_public_key_untrusted/);
 assert.equal(fs.existsSync(fx.packageFile),false);
});
test('modified ciphertext and forged package hash refuse to write the scoped credential',t=>{
 const fx=fixture(t),p=fx.prep();
 assert.throws(()=>fx.open('a'.repeat(64)),/package_digest_invalid/);
 const obj=JSON.parse(fs.readFileSync(fx.packageFile,'utf8'));
 const raw=Buffer.from(obj.ciphertextBase64,'base64');raw[0]^=1;
 obj.ciphertextBase64=raw.toString('base64');
 fs.writeFileSync(fx.packageFile,JSON.stringify(obj)+'\n',{mode:0o600});
 const forgedSha=crypto.createHash('sha256').update(fs.readFileSync(fx.packageFile)).digest('hex');
 assert.throws(()=>fx.open(forgedSha),/cryptographic_authentication_failed/);
 assert.equal(fs.existsSync(fx.opened),false);
 assert.ok(p.sha256!==forgedSha);
});
test('wrong Harbor private key fails after independent recipient fingerprint validation',t=>{
 const fx=fixture(t),p=fx.prep();
 const other=crypto.generateKeyPairSync('x25519'),otherFile=path.join(fx.root,'other.key');
 fs.writeFileSync(otherFile,other.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 assert.throws(()=>fx.open(p.sha256,{recipientPrivateKeyFile:otherFile}),
  /private_key_recipient_mismatch/);
 assert.equal(fs.existsSync(fx.opened),false);
});
test('private key, token and destination symlink/permissions cannot be bypassed',t=>{
 const fx=fixture(t);
 fs.chmodSync(fx.tokenFile,0o644);
 assert.throws(()=>fx.prep(),/file_untrusted/);
 fs.chmodSync(fx.tokenFile,0o600);
 const parent=path.join(fx.root,'insecure');fs.mkdirSync(parent,{mode:0o755});
 assert.throws(()=>createEncryptedHarborEnrollment({
  receiveTokenFile:fx.tokenFile,recipientPublicKeyFile:fx.pub,
  expectedRecipientFingerprint:fx.recipientFingerprint,
  outputFile:path.join(parent,'encrypted.json')
 }),/output_parent_not_private/);
 const redirected=path.join(fx.root,'redirected');fs.symlinkSync(fx.root,redirected);
 assert.throws(()=>createEncryptedHarborEnrollment({
  receiveTokenFile:fx.tokenFile,recipientPublicKeyFile:fx.pub,
  expectedRecipientFingerprint:fx.recipientFingerprint,
  outputFile:path.join(redirected,'encrypted.json')
 }),/output_parent_symlink/);
 const p=fx.prep();
 fs.chmodSync(fx.privateKey,0o644);
 assert.throws(()=>fx.open(p.sha256),/recipient_private_key_invalid/);
 assert.equal(fs.existsSync(fx.opened),false);
});
test('unexpected key or malformed base64 in sealed package is rejected even with revised hash',t=>{
 const fx=fixture(t),p=fx.prep();
 const obj=JSON.parse(fs.readFileSync(fx.packageFile));
 obj.extraField='untrusted';
 fs.writeFileSync(fx.packageFile,JSON.stringify(obj)+'\n',{mode:0o600});
 let digest=crypto.createHash('sha256').update(fs.readFileSync(fx.packageFile)).digest('hex');
 assert.throws(()=>fx.open(digest),/package_fields_invalid/);
 delete obj.extraField;
 obj.tagBase64='@@@@';
 fs.writeFileSync(fx.packageFile,JSON.stringify(obj)+'\n',{mode:0o600});
 digest=crypto.createHash('sha256').update(fs.readFileSync(fx.packageFile)).digest('hex');
 assert.throws(()=>fx.open(digest),/encrypted_fields_invalid/);
 assert.equal(fs.existsSync(fx.opened),false);
});

test('broker-compatible private token with final newline is sealed and restored canonically',t=>{
 const fx=fixture(t);
 fs.writeFileSync(fx.tokenFile,fx.token+'\n',{mode:0o600});
 const created=fx.prep();
 assert.equal(created.plaintextReturned,false);
 const installed=fx.open(created.sha256);
 assert.equal(installed.status,'PRIVATE_SCOPED_CREDENTIAL_WRITTEN');
 assert.equal(fs.readFileSync(fx.opened,'utf8'),fx.token);
 assert.equal(fs.readFileSync(fx.packageFile,'utf8').includes(fx.token),false);
});
test('invalid broker-token characters and embedded whitespace refuse packaging',t=>{
 const fx=fixture(t);
 for(const candidate of [
  'Bearer '+fx.token,'bad!'+fx.token,fx.token+'\nEXTRA',
  fx.token+' \n','too-short',fx.token+'\n\n'
 ]){
  fs.writeFileSync(fx.tokenFile,candidate,{mode:0o600});
  assert.throws(()=>fx.prep(),/token_format_invalid/);
  assert.equal(fs.existsSync(fx.packageFile),false);
 }
});
test('private key PEM cannot be passed as recipient public key',t=>{
 const fx=fixture(t);
 const recipient=fs.readFileSync(fx.privateKey);
 fs.writeFileSync(fx.pub,recipient,{mode:0o600});
 assert.throws(()=>fx.prep(),/recipient_public_key_invalid/);
 assert.equal(fs.existsSync(fx.packageFile),false);
});
