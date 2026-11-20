import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareOwnerBrokerEnrollment,ENROLLMENT_SCHEMA} from './prepare-broker-enrollment.mjs';
import {evaluateWingBrokerConfig} from './install-broker.mjs';

function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wing-enroll-test-'));
  fs.chmodSync(dir,0o700);
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const create=(wing)=>{
    const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
    const file=path.join(dir,wing+'.pub');
    fs.writeFileSync(file,publicKey.export({format:'pem',type:'spki'}),{mode:0o600});
    const fp=crypto.createHash('sha256').update(publicKey.export({format:'der',type:'spki'})).digest('hex');
    return {file,fp,privateKey};
  };
  const harbor=create('harbor'),fallen=create('fallen');
  return {dir,root:path.join(dir,'broker-private'),harbor,fallen,
    args:{root:path.join(dir,'broker-private'),
      harborSignPublicFile:harbor.file,harborFingerprint:harbor.fp,
      fallenSignPublicFile:fallen.file,fallenFingerprint:fallen.fp}};
}
test('dry run verifies independently pinned signer identities without touching storage or network',t=>{
  const f=fixture(t),r=prepareOwnerBrokerEnrollment(f.args);
  assert.equal(r.schema,ENROLLMENT_SCHEMA);
  assert.equal(r.mode,'DRY_RUN');
  assert.equal(r.privateBrokerConfigPrepared,false);
  assert.equal(r.localTokensCreated,0);
  assert.equal(r.brokerStarted,false);
  assert.equal(r.fabricRouteActivated,false);
  assert.equal(r.secretMaterialReturned,false);
  assert.deepEqual(r.wings,['harbor','fallen']);
  assert.equal(fs.existsSync(f.root),false);
});
test('activation intent without local owned-host confirmation cannot provision',t=>{
  const f=fixture(t);
  assert.throws(()=>prepareOwnerBrokerEnrollment({...f.args,provision:true}),
    /owner_host_confirmation_required/);
  assert.equal(fs.existsSync(f.root),false);
});
test('owner-private broker config creates exactly four unique scoped tokens and two pinned key copies',t=>{
  const f=fixture(t);
  const r=prepareOwnerBrokerEnrollment({...f.args,provision:true,confirmOwnedHost:true});
  assert.equal(r.mode,'PRIVATE_CONFIG_PROVISIONED_NO_SERVICE');
  assert.equal(r.localTokensCreated,4);
  assert.equal(r.brokerInstallerDryRunVerified,true);
  const stat=fs.lstatSync(f.root);
  assert.equal(stat.mode&0o077,0);
  const conf=path.join(f.root,'broker.json');
  assert.equal(fs.statSync(conf).mode&0o077,0);
  const cfg=JSON.parse(fs.readFileSync(conf,'utf8'));
  assert.equal(cfg.port,8851);
  assert.deepEqual(cfg.wings.map(x=>x.wing),['harbor','fallen']);
  assert.deepEqual(cfg.wings.map(x=>x.allowedDestinations),[['fallen'],['harbor']]);
  const tokens=[];
  for(const row of cfg.wings){
    for(const p of [row.sendTokenFile,row.receiveTokenFile]){
      assert.equal(fs.lstatSync(p).mode&0o077,0);
      const token=fs.readFileSync(p,'utf8').trim();
      assert.match(token,/^[a-zA-Z0-9_-]{64}$/);
      tokens.push(token);
    }
    const pinned=fs.readFileSync(row.ackVerifyPublicKeyFile,'utf8');
    const source=row.wing==='harbor'?f.harbor.file:f.fallen.file;
    assert.equal(pinned,fs.readFileSync(source,'utf8'));
  }
  assert.equal(new Set(tokens).size,4);
  const proof=evaluateWingBrokerConfig({configPath:conf});
  assert.equal(proof.readyForOwnedLocalActivation,true);
  assert.equal(proof.unitInstalled,false);
  assert.equal(proof.publicRouteActivatedByThisTool,false);
  const output=JSON.stringify(r);
  for(const value of tokens)assert.ok(!output.includes(value));
  assert.throws(()=>prepareOwnerBrokerEnrollment({...f.args,provision:true,confirmOwnedHost:true}),
    /destination_already_exists/);
});
test('wrong asserted fingerprint, duplicate signer, or private PEM never enrolls',t=>{
  const f=fixture(t);
  assert.throws(()=>prepareOwnerBrokerEnrollment({...f.args,harborFingerprint:f.fallen.fp}),
    /trusted_key_fingerprint_mismatch/);
  assert.throws(()=>prepareOwnerBrokerEnrollment({...f.args,fallenSignPublicFile:f.harbor.file,fallenFingerprint:f.harbor.fp}),
    /receiver_signers_not_distinct/);
  const privateFile=path.join(f.dir,'private-key-instead-of-pub.pem');
  fs.writeFileSync(privateFile,f.harbor.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
  assert.throws(()=>prepareOwnerBrokerEnrollment({...f.args,harborSignPublicFile:privateFile}),
    /public_key_pem_required/);
  assert.equal(fs.existsSync(f.root),false);
});
test('symlinked public keys, linked files, world-writable keys and unsafe parent directories are denied',t=>{
  const f=fixture(t);
  const link=path.join(f.dir,'harbor-link.pub');
  fs.symlinkSync(f.harbor.file,link);
  assert.throws(()=>prepareOwnerBrokerEnrollment({...f.args,harborSignPublicFile:link}),/symlinked_component/);
  const hardlink=path.join(f.dir,'harbor-hardlink.pub');
  fs.linkSync(f.harbor.file,hardlink);
  assert.throws(()=>prepareOwnerBrokerEnrollment(f.args),/public_key_file_unsafe/);
  fs.unlinkSync(hardlink);
  fs.chmodSync(f.harbor.file,0o666);
  assert.throws(()=>prepareOwnerBrokerEnrollment(f.args),/public_key_file_unsafe/);
  fs.chmodSync(f.harbor.file,0o600);
  fs.chmodSync(f.dir,0o755);
  assert.throws(()=>prepareOwnerBrokerEnrollment(f.args),/private_parent_not_owner_only/);
  assert.equal(fs.existsSync(f.root),false);
});
test('no new service is enabled by enrollment and the node model remains Har/Fallen only',t=>{
  const f=fixture(t);
  const r=prepareOwnerBrokerEnrollment({...f.args,provision:true,confirmOwnedHost:true});
  assert.equal(r.customerMediaTouched,false);
  assert.equal(r.externalSenderCredentialDelivered,false);
  assert.equal(r.fallenRecipientX25519Enrolled,false);
  assert.equal(r.liveTransferVerified,false);
  assert.equal(r.paymentAuthorityGranted,false);
  assert.ok(!fs.existsSync(path.join(f.dir,'.config/systemd/user')));
});
