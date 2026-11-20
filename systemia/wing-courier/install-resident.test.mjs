import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {evaluateWingResidentConfig,renderWingResidentUnit,installWingResident} from './install-resident.mjs';

function setup(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'wing-deploy-'));fs.chmodSync(root,0o700);
 const dir=n=>{const p=path.join(root,n);fs.mkdirSync(p,{mode:0o700});return p};
 const conf=dir('config'),keys=dir('keys'),media=dir('media'),intake=dir('intake'),passport=dir('passport');
 const secret=n=>{const f=path.join(keys,n);fs.writeFileSync(f,'TEST_DO_NOT_USE',{mode:0o600});return f};
 const token=secret('receive.token'),decrypt=secret('decrypt.key'),sign=secret('sign.key');
 const sender=path.join(keys,'harbor.sign.pub');fs.writeFileSync(sender,'NOT_A_REAL_PUBLIC_KEY',{mode:0o644});
 const file=path.join(conf,'fallen.json');
 const cfg={wing:'fallen',baseUrl:'https://courier.systemiacommandcenters.com/',
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
test('private resident supports exact shared Fabric /wing-courier mount but rejects arbitrary API paths',()=>withFixture(async fx=>{
 fx.cfg.baseUrl='https://fabric.systemiacommandcenters.com/wing-courier';fx.write();
 assert.equal(evaluateWingResidentConfig({configPath:fx.file}).readyForLocalActivation,true);
 fx.cfg.baseUrl='https://fabric.systemiacommandcenters.com/api/internal/wing-courier';fx.write();
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
