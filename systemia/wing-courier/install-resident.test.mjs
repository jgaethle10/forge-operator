import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {evaluateWingResidentConfig,renderWingResidentUnit,installWingResident} from './install-resident.mjs';

function setup(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'wing-deploy-'));fs.chmodSync(root,0o700);
 const dir=n=>{const p=path.join(root,n);fs.mkdirSync(p,{mode:0o700});return p};
 const conf=dir('config'),keys=dir('keys'),media=dir('media'),intake=dir('intake'),passport=dir('passport');
 const secret=n=>{const f=path.join(keys,n);fs.writeFileSync(f,'TEST_DO_NOT_USE',{mode:0o600});return f};
 const token=secret('receive.token');
 const writeKey=(name,key,kind,privateFile)=>{
  const file=path.join(keys,name);
  fs.writeFileSync(file,key.export({type:kind,format:'pem'}),{mode:privateFile?0o600:0o644});
  return file;
 };
 const receiver=crypto.generateKeyPairSync('x25519');
 const ack=crypto.generateKeyPairSync('ed25519');
 const harbor=crypto.generateKeyPairSync('ed25519');
 const decrypt=writeKey('decrypt.key',receiver.privateKey,'pkcs8',true);
 const sign=writeKey('sign.key',ack.privateKey,'pkcs8',true);
 const sender=writeKey('harbor.sign.pub',harbor.publicKey,'spki',false);
 const file=path.join(conf,'fallen.json');
 const cfg={wing:'fallen',baseUrl:'https://fabric.systemiacommandcenters.com/api/internal/wing-courier',
  receiveTokenFile:token,receiverPrivateKeyFile:decrypt,receiverSigningKeyFile:sign,
  destinationDir:media,senderVerifyPublicKeys:{harbor:sender},
  intakeStateDir:intake,passportStateDir:passport};
 const write=()=>fs.writeFileSync(file,JSON.stringify(cfg),{mode:0o600});
 write();return {root,keys,file,cfg,write};
}
async function withFixture(fn){
 const fx=setup();try{await fn(fx)}finally{fs.rmSync(fx.root,{recursive:true,force:true})}
}
test('validated local install plan reveals no customer data or secret keys',()=>withFixture(async fx=>{
 const result=evaluateWingResidentConfig({configPath:fx.file});
 assert.equal(result.readyForLocalActivation,true);
 assert.equal(result.wing,'fallen');
 assert.equal(result.systemiaIngressConfigured,true);
 assert.equal(result.liveHttpsVerified,false);
 assert.equal(result.customerReleaseAuthorized,false);
 assert.equal(JSON.stringify(result).includes('TEST_DO_NOT_USE'),false);
 const dry=await installWingResident({configPath:fx.file});
 assert.equal(dry.mode,'DRY_RUN');
 assert.equal(dry.unitInstalled,false);
}));
test('unit binds exact Node binary and private resident config without shell invocation',()=>{
 const unit=renderWingResidentUnit({nodeBin:'/usr/bin/node',sourceRoot:'/home/coach/forge-operator',
   configPath:'/home/coach/.config/evercraft/wing/fallen.json'});
 assert.match(unit,/systemia\/wing-courier\/resident.mjs/);
 assert.match(unit,/NoNewPrivileges=true/);
 assert.match(unit,/UMask=0077/);
 assert.doesNotMatch(unit,/\/bin\/sh|bash -c|sudo/);
});
test('untrusted remote HTTP or embedded endpoint credentials are rejected',()=>withFixture(async fx=>{
 fx.cfg.baseUrl='http://example.com/';fx.write();
 assert.throws(()=>evaluateWingResidentConfig({configPath:fx.file}),/requires_owned_https/);
 fx.cfg.baseUrl='https://user:pass@example.com/';fx.write();
 assert.throws(()=>evaluateWingResidentConfig({configPath:fx.file}),/requires_owned_https/);
}));
test('receiver signing key is mandatory and must remain private',()=>withFixture(async fx=>{
 delete fx.cfg.receiverSigningKeyFile;fx.write();
 assert.throws(()=>evaluateWingResidentConfig({configPath:fx.file}),/absolute_file_required/);
 fx.cfg.receiverSigningKeyFile=path.join(fx.keys,'sign.key');fx.write();
 fs.chmodSync(fx.cfg.receiverSigningKeyFile,0o644);
 assert.throws(()=>evaluateWingResidentConfig({configPath:fx.file}),/untrusted_private_file/);
}));
test('symlinked config, unsafe intake directory or absent signer pin is rejected',()=>withFixture(async fx=>{
 const link=path.join(fx.root,'symbolic-config');
 fs.symlinkSync(fx.file,link);
 assert.throws(()=>evaluateWingResidentConfig({configPath:link}),/untrusted_private_file/);
 const old=fx.cfg.destinationDir, target=path.join(fx.root,'media-alias');
 fs.symlinkSync(old,target);
 fx.cfg.destinationDir=target;fx.write();
 assert.throws(()=>evaluateWingResidentConfig({configPath:fx.file}),/untrusted_private_directory/);
 fx.cfg.destinationDir=old;fx.cfg.senderVerifyPublicKeys={};fx.write();
 assert.throws(()=>evaluateWingResidentConfig({configPath:fx.file}),/trusted_senders_missing/);
}));
test('dangerous characters never enter systemd ExecStart arguments',()=>{
 assert.throws(()=>renderWingResidentUnit({nodeBin:'/usr/bin/node',
  sourceRoot:'/tmp/test;echo PWNED',configPath:'/tmp/config.json'}),/unsafe_service_argument/);
});

test('activation requires a separately confirmed owned NextGen machine and writes no service',()=>withFixture(async fx=>{
 const home=path.join(fx.root,'home');fs.mkdirSync(home,{mode:0o700});
 await assert.rejects(()=>installWingResident({configPath:fx.file,home,activate:true}),
  /confirm_owned_host_required/);
 assert.equal(fs.existsSync(path.join(home,'.config')),false);
}));
test('existing service is held without replacement or systemctl activation',()=>withFixture(async fx=>{
 const home=path.join(fx.root,'home'),units=path.join(home,'.config/systemd/user');
 fs.mkdirSync(units,{recursive:true,mode:0o700});
 const unit=path.join(units,'evercraft-wing-courier-fallen.service');
 const original='pre-existing operator service - must preserve';
 fs.writeFileSync(unit,original,{mode:0o600});
 await assert.rejects(()=>installWingResident({
  configPath:fx.file,home,activate:true,confirmOwnedHost:true,
 }),/existing_unit_requires_review/);
 assert.equal(fs.readFileSync(unit,'utf8'),original);
}));
test('symlinked systemd directory and dangling unit symlink fail closed',()=>withFixture(async fx=>{
 const home=path.join(fx.root,'home'),systemd=path.join(home,'.config/systemd');
 const other=path.join(fx.root,'other');fs.mkdirSync(other,{mode:0o700});
 fs.mkdirSync(path.join(home,'.config'),{recursive:true,mode:0o700});
 fs.symlinkSync(other,systemd);
 await assert.rejects(()=>installWingResident({
  configPath:fx.file,home,activate:true,confirmOwnedHost:true,
 }),/untrusted_service_directory/);
 fs.unlinkSync(systemd);fs.mkdirSync(path.join(systemd,'user'),{recursive:true,mode:0o700});
 const unit=path.join(systemd,'user','evercraft-wing-courier-fallen.service');
 fs.symlinkSync(path.join(fx.root,'missing.service'),unit);
 await assert.rejects(()=>installWingResident({
  configPath:fx.file,home,activate:true,confirmOwnedHost:true,
 }),/existing_unit_requires_review/);
 assert.equal(fs.lstatSync(unit).isSymbolicLink(),true);
}));

test('cryptographic preflight rejects wrong key types even when permissions are correct',()=>withFixture(async fx=>{
 const pathToKey=fx.cfg.receiverPrivateKeyFile;
 const fake=crypto.generateKeyPairSync('ed25519');
 fs.writeFileSync(pathToKey,fake.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 assert.throws(()=>evaluateWingResidentConfig({configPath:fx.file}),/decrypt_key_invalid/);
 const receiver=crypto.generateKeyPairSync('x25519');
 fs.writeFileSync(pathToKey,receiver.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 fs.writeFileSync(fx.cfg.receiverSigningKeyFile,receiver.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 assert.throws(()=>evaluateWingResidentConfig({configPath:fx.file}),/signing_key_invalid/);
 const ack=crypto.generateKeyPairSync('ed25519');
 fs.writeFileSync(fx.cfg.receiverSigningKeyFile,ack.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 fs.writeFileSync(fx.cfg.senderVerifyPublicKeys.harbor,receiver.publicKey.export({type:'spki',format:'pem'}));
 assert.throws(()=>evaluateWingResidentConfig({configPath:fx.file}),/trusted_sender_key_invalid/);
}));
test('cryptographic preflight refuses mangled key contents without leaking key data',()=>withFixture(async fx=>{
 fs.writeFileSync(fx.cfg.receiverPrivateKeyFile,'PRIVATE_KEY_SYNTAX_SECRET',{mode:0o600});
 assert.throws(()=>evaluateWingResidentConfig({configPath:fx.file}),err=>{
  assert.match(err.message,/wing_resident_decrypt_key_invalid/);
  assert.doesNotMatch(err.message,/PRIVATE_KEY_SYNTAX_SECRET/);
  return true;
 });
}));
test('linked private receiver keys are rejected before service activation',()=>withFixture(async fx=>{
 const link=path.join(fx.keys,'receiver-key-second-name');
 fs.linkSync(fx.cfg.receiverSigningKeyFile,link);
 assert.throws(()=>evaluateWingResidentConfig({configPath:fx.file}),/untrusted_private_file/);
}));
test('Harbor receiver preflight uses its own wing and preserves the Fallen default',()=>withFixture(async fx=>{
 fx.cfg.wing='harbor';
 fx.cfg.senderVerifyPublicKeys={fallen:fx.cfg.senderVerifyPublicKeys.harbor};
 fx.write();
 assert.throws(()=>evaluateWingResidentConfig({configPath:fx.file}),/scope_mismatch/);
 const pre=evaluateWingResidentConfig({configPath:fx.file,wingExpected:'harbor'});
 assert.equal(pre.wing,'harbor');
 assert.equal(pre.readyForLocalActivation,true);
 assert.equal(pre.customerReleaseAuthorized,false);
 assert.equal(pre.liveHttpsVerified,false);
 const dry=await installWingResident({configPath:fx.file,wingExpected:'harbor'});
 assert.equal(dry.mode,'DRY_RUN');
 assert.equal(dry.unitInstalled,false);
 assert.doesNotMatch(JSON.stringify(dry),/TEST_DO_NOT_USE/);
}));
test('Harbor existing unit cannot be overwritten even with activation flags',()=>withFixture(async fx=>{
 fx.cfg.wing='harbor';
 fx.cfg.senderVerifyPublicKeys={fallen:fx.cfg.senderVerifyPublicKeys.harbor};
 fx.write();
 const home=path.join(fx.root,'home');
 const units=path.join(home,'.config/systemd/user');
 fs.mkdirSync(units,{recursive:true,mode:0o700});
 const unit=path.join(units,'evercraft-wing-courier-harbor.service');
 const source=Buffer.from('EXISTING_HARBOR_SERVICE_BYTE_FOR_BYTE');
 fs.writeFileSync(unit,source,{mode:0o600});
 await assert.rejects(()=>installWingResident({
  configPath:fx.file,home,wingExpected:'harbor',activate:true,confirmOwnedHost:true
 }),/existing_unit_requires_review/);
 assert.deepEqual(fs.readFileSync(unit),source);
 assert.equal(fs.existsSync(path.join(units,'evercraft-wing-courier-fallen.service')),false);
}));
test('Harbor cannot activate with Fallen config or unconfirmed owned host',()=>withFixture(async fx=>{
 const home=path.join(fx.root,'home');fs.mkdirSync(home,{mode:0o700});
 await assert.rejects(()=>installWingResident({
  configPath:fx.file,home,wingExpected:'harbor',activate:true,confirmOwnedHost:true
 }),/scope_mismatch/);
 fx.cfg.wing='harbor';
 fx.cfg.senderVerifyPublicKeys={fallen:fx.cfg.senderVerifyPublicKeys.harbor};
 fx.write();
 await assert.rejects(()=>installWingResident({
  configPath:fx.file,home,wingExpected:'harbor',activate:true
 }),/confirm_owned_host_required/);
 assert.equal(fs.existsSync(path.join(home,'.config')),false);
}));
test('Harbor config refuses overbroad/cross-wing trusted signers',()=>withFixture(async fx=>{
 fx.cfg.wing='harbor';
 fx.cfg.senderVerifyPublicKeys={harbor:fx.cfg.senderVerifyPublicKeys.harbor};
 fx.write();
 assert.throws(()=>evaluateWingResidentConfig({configPath:fx.file,wingExpected:'harbor'}),
  /trusted_senders_scope_mismatch/);
 fx.cfg.senderVerifyPublicKeys={
  fallen:fx.cfg.senderVerifyPublicKeys.harbor,
  unknown:fx.cfg.senderVerifyPublicKeys.harbor
 };
 fx.write();
 assert.throws(()=>evaluateWingResidentConfig({configPath:fx.file,wingExpected:'harbor'}),
  /trusted_senders_scope_mismatch/);
 const invalid=renderWingResidentUnit.bind(null,{
  nodeBin:'/usr/bin/node',sourceRoot:'/home/coach/forge-operator',
  configPath:'/home/coach/private.json',wing:'arbitrary'
 });
 assert.throws(invalid,/scope_mismatch/);
 const unit=renderWingResidentUnit({
  nodeBin:'/usr/bin/node',sourceRoot:'/home/coach/forge-operator',
  configPath:'/home/coach/private.json',wing:'harbor'
 });
 assert.match(unit,/Wing Courier harbor/);
 assert.match(unit,/NoNewPrivileges=true/);
 assert.doesNotMatch(unit,/curl|wget|sudo|bash -c/);
}));

test('private Systemia goal checkpoint is explicit Fallen-only opt-in and never creates directories',()=>withFixture(async fx=>{
 const dir=path.join(fx.root,'private-goals');fs.mkdirSync(dir,{mode:0o700});
 fx.cfg.goalStateDir=dir;fx.write();
 const pre=evaluateWingResidentConfig({configPath:fx.file});
 assert.equal(pre.privateGoalCheckpointConfigured,true);
 assert.equal(pre.liveHttpsVerified,false);
 assert.equal(pre.customerReleaseAuthorized,false);
 assert.equal(fs.readdirSync(dir).length,0);
 const dry=await installWingResident({configPath:fx.file});
 assert.equal(dry.mode,'DRY_RUN');
 assert.equal(dry.unitInstalled,false);
 fx.cfg.wing='harbor';
 fx.cfg.senderVerifyPublicKeys={fallen:fx.cfg.senderVerifyPublicKeys.harbor};
 fx.write();
 assert.throws(()=>evaluateWingResidentConfig({configPath:fx.file,wingExpected:'harbor'}),
  /goal_checkpoint_requires_fallen_passport_intake/);
 fx.cfg.wing='fallen';fx.cfg.senderVerifyPublicKeys={harbor:fx.cfg.senderVerifyPublicKeys.fallen};
 delete fx.cfg.passportStateDir;fx.write();
 assert.throws(()=>evaluateWingResidentConfig({configPath:fx.file}),
  /incomplete_systemia_intake/);
}));
test('world-readable or symlinked goal checkpoint directory fails before service install',()=>withFixture(async fx=>{
 const dir=path.join(fx.root,'private-goals');fs.mkdirSync(dir,{mode:0o700});
 fx.cfg.goalStateDir=dir;fx.write();
 fs.chmodSync(dir,0o755);
 assert.throws(()=>evaluateWingResidentConfig({configPath:fx.file}),
  /untrusted_private_directory/);
 fs.chmodSync(dir,0o700);
 const link=path.join(fx.root,'redirected-goals');fs.symlinkSync(dir,link);
 fx.cfg.goalStateDir=link;fx.write();
 assert.throws(()=>evaluateWingResidentConfig({configPath:fx.file}),
  /untrusted_private_directory/);
}));
