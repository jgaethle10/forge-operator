import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {startWingCourierBroker} from './broker.mjs';
import {
 BROKER_PREFLIGHT_SCHEMA,BROKER_LOCAL_PROBE_SCHEMA,
 evaluateWingBrokerConfig,renderWingBrokerUnit,installWingBroker,observeLocalWingBroker,
} from './install-broker.mjs';

function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wing-broker-bootstrap-'));
  fs.chmodSync(dir,0o700);
  t.after(()=>fs.rmSync(dir,{force:true,recursive:true}));
  const keyDir=path.join(dir,'keys'),stateDir=path.join(dir,'state');
  fs.mkdirSync(keyDir,{mode:0o700});fs.mkdirSync(stateDir,{mode:0o700});
  const secret=(name,value)=>{
    const file=path.join(keyDir,name);
    fs.writeFileSync(file,value,{mode:0o600});
    return file;
  };
  const wings=['harbor','fallen'].map(wing=>{
    const {publicKey}=crypto.generateKeyPairSync('ed25519');
    const ackVerifyPublicKeyFile=path.join(keyDir,wing+'.ack.pub');
    fs.writeFileSync(ackVerifyPublicKeyFile,
      publicKey.export({format:'pem',type:'spki'}),{mode:0o644});
    const sendTokenFile=secret(wing+'.send',crypto.randomBytes(48).toString('base64url'));
    const receiveTokenFile=secret(wing+'.receive',crypto.randomBytes(48).toString('base64url'));
    return {wing,allowedDestinations:[wing==='harbor'?'fallen':'harbor'],
      ackVerifyPublicKeyFile,sendTokenFile,receiveTokenFile};
  });
  const configPath=path.join(dir,'broker.json');
  const cfg={stateDir,port:8791,wings};
  const write=()=>fs.writeFileSync(configPath,JSON.stringify(cfg),{mode:0o600});
  write();
  return {dir,keyDir,stateDir,configPath,cfg,wings,write};
}
test('owner-local broker dry-run verifies two scoped wing keys, no secrets or service writes',async t=>{
  const f=fixture(t);
  const plan=evaluateWingBrokerConfig({configPath:f.configPath});
  assert.equal(plan.schema,BROKER_PREFLIGHT_SCHEMA);
  assert.equal(plan.readyForOwnedLocalActivation,true);
  assert.equal(plan.mode,'DRY_RUN');
  assert.equal(plan.scope,'harbor<->fallen only');
  assert.equal(plan.separateTokens,4);
  assert.equal(plan.privateStorageChecked,true);
  assert.equal(plan.publicRouteEnabled,false);
  assert.equal(plan.customerAssetsTransferred,false);
  assert.doesNotMatch(JSON.stringify(plan),new RegExp(
    fs.readFileSync(f.wings[0].sendTokenFile,'utf8')));
  const home=path.join(f.dir,'home');
  fs.mkdirSync(home,{mode:0o700});
  const dry=await installWingBroker({configPath:f.configPath,home});
  assert.equal(dry.unitInstalled,false);
  assert.equal(fs.existsSync(path.join(home,'.config')),false);
});
test('systemd unit is loopback broker only, no root shell or Fabric activation',()=>{
  const unit=renderWingBrokerUnit({
    nodeBin:'/usr/bin/node',sourceRoot:'/home/operator/forge-operator',
    configPath:'/home/operator/private/wing-broker.json',
  });
  assert.match(unit,/systemia\/wing-courier\/broker\.mjs/);
  assert.match(unit,/NoNewPrivileges=true/);
  assert.match(unit,/UMask=0077/);
  assert.doesNotMatch(unit,/EVERCRAFT_WING_COURIER_ROUTE_ENABLED|sudo|bash -c|ExecStart=\/bin\/sh/);
  assert.throws(()=>renderWingBrokerUnit({
    nodeBin:'/usr/bin/node',sourceRoot:'/tmp/x;bad',
    configPath:'/tmp/private.json',
  }),/unsafe_service_argument/);
});
test('cannot activate without separately confirming actual owned machine',async t=>{
  const f=fixture(t);
  const home=path.join(f.dir,'home');fs.mkdirSync(home,{mode:0o700});
  await assert.rejects(()=>installWingBroker({
    configPath:f.configPath,home,activate:true,confirmOwnedHost:false,
  }),/confirm_owned_host_required/);
  assert.equal(fs.existsSync(path.join(home,'.config')),false);
});
test('wrong port, wing route and reused tokens fail closed',t=>{
  const f=fixture(t);
  f.cfg.port=8792;f.write();
  assert.throws(()=>evaluateWingBrokerConfig({configPath:f.configPath}),/config_or_port_invalid/);
  f.cfg.port=8791;f.cfg.wings[0].allowedDestinations=['fallen','outside'];f.write();
  assert.throws(()=>evaluateWingBrokerConfig({configPath:f.configPath}),/wing_scope_invalid/);
  f.cfg.wings[0].allowedDestinations=['fallen'];f.write();
  fs.writeFileSync(f.wings[1].sendTokenFile,fs.readFileSync(f.wings[0].sendTokenFile));
  assert.throws(()=>evaluateWingBrokerConfig({configPath:f.configPath}),/reused_bearer_token/);
});
test('private config, token and public-key identity checks reject bad setup',t=>{
  const f=fixture(t);
  fs.chmodSync(f.configPath,0o644);
  assert.throws(()=>evaluateWingBrokerConfig({configPath:f.configPath}),/untrusted_file/);
  fs.chmodSync(f.configPath,0o600);
  fs.chmodSync(f.wings[0].receiveTokenFile,0o644);
  assert.throws(()=>evaluateWingBrokerConfig({configPath:f.configPath}),/untrusted_file/);
  fs.chmodSync(f.wings[0].receiveTokenFile,0o600);
  f.wings[1].ackVerifyPublicKeyFile=f.wings[0].ackVerifyPublicKeyFile;
  f.write();
  assert.throws(()=>evaluateWingBrokerConfig({configPath:f.configPath}),/reused_ack_identity/);
  const symlink=path.join(f.dir,'alias.json');
  fs.symlinkSync(f.configPath,symlink);
  assert.throws(()=>evaluateWingBrokerConfig({configPath:symlink}),/untrusted_file/);
});
test('owned broker over real loopback denies uncredentialed send and receive',async t=>{
  const f=fixture(t);
  const credentials=f.wings.map(w=>({
    wing:w.wing,allowedDestinations:w.allowedDestinations,
    ackVerifyPublicKeyFile:w.ackVerifyPublicKeyFile,
    sendToken:fs.readFileSync(w.sendTokenFile,'utf8'),
    receiveToken:fs.readFileSync(w.receiveTokenFile,'utf8'),
  }));
  const broker=await startWingCourierBroker({stateDir:f.stateDir,
    wingCredentials:credentials,port:0});
  t.after(()=>broker.close());
  const url=new URL(broker.url);
  const result=await observeLocalWingBroker({port:Number(url.port)});
  assert.equal(result.schema,BROKER_LOCAL_PROBE_SCHEMA);
  assert.equal(result.loopbackObserved,true);
  assert.equal(result.unauthenticatedSendDenied,true);
  assert.equal(result.unauthenticatedReceiveDenied,true);
  assert.equal(result.externalTlsObserved,false);
  assert.equal(result.publicRouteEnabled,false);
  assert.deepEqual(fs.readdirSync(path.join(f.stateDir,'packages')),[]);
});
test('an impostor local HTTP service cannot pass the auth-denial canary',async t=>{
  const server=http.createServer((req,res)=>{
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify(req.url==='/health'?{
      schema:'evercraft.wing-broker.health.v1',ok:true,plaintextPresent:false,
      productionAuthority:false,externalDeliveryAuthority:false,
    }:{error:'not_authorized'}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const port=server.address().port;
  await assert.rejects(()=>observeLocalWingBroker({port}),
    /unauthenticated_send_not_denied/);
});
