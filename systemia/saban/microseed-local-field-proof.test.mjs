import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { bootstrapNativeMicroSeed } from './microseed-native-bootstrap.mjs';
import { loadMicroSeedDeviceIdentity } from './microseed-device-identity.mjs';
import { startMicroSeedNativeAgent } from './microseed-native-agent.mjs';
import { verifyMicroSeedExecutionReceipt } from './microseed-receipt-signature.mjs';
import { readSignedMicroSeedReceipt } from './microseed-signed-receipt-store.mjs';
import { reserveSignedMicroSeedExecution } from './microseed-execution-intent-store.mjs';
import { AmbientDeviceRegistry } from './ambient-device-registry.mjs';
import { normalizeMicroDeviceManifest } from './microseed-device-bridge.mjs';
import { inspectLocalMicroSeedEvidence } from './microseed-local-field-proof.mjs';

async function freePort(){
  const s=net.createServer();
  await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve)});
  const port=s.address().port;
  await new Promise((resolve,reject)=>s.close(e=>e?reject(e):resolve()));
  return port;
}
async function withNode(fn,{deviceId='test-node-002'}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-physical-proof-synthetic-'));
  let agent=null;
  try{
    const port=await freePort();
    const boot=bootstrapNativeMicroSeed({
      root,device_id:deviceId,device_class:'test-linux',
      authorization_ref:'synthetic-owner-authorization',
      endpoint:'http://127.0.0.1:'+port,
      supported_workloads:['systemia.content-hash.v1'],
      resources:{cpu_units:1,memory_mb:1024,storage_gb:1},
    });
    const manifest=JSON.parse(fs.readFileSync(boot.manifest_file,'utf8'));
    const identity=loadMicroSeedDeviceIdentity({
      root:boot.identity_dir,device_id:manifest.device_id,
    });
    const token=fs.readFileSync(boot.token_file,'utf8').trim();
    agent=await startMicroSeedNativeAgent({
      manifest,stateDir:boot.state_dir,host:'127.0.0.1',port,
      authorizationToken:token,
      receiptSigningPrivateKey:identity.private_key,
      receiptSigningKeyId:identity.identity.key_id,
      telemetryProvider:async()=>({
        primary_function_busy:false,cpu_utilization:0.1,
        memory_free_mb:2048,temperature_c:33,
        battery_percent:90,external_power:true,
        network_utilization:0.05,observed_at:new Date().toISOString(),
        max_age_ms:60000,
      }),
    });
    await fn({root,agent,boot,manifest,identity,token});
  }finally{
    if(agent)await agent.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
}
function approveDevice({root,manifest}){
  const registryRoot=path.join(root,'ambient-registry');
  const registry=new AmbientDeviceRegistry({root:registryRoot});
  registry.observe({device_id:manifest.device_id});
  registry.candidate({device_id:manifest.device_id,manifest});
  registry.authorize({
    device_id:manifest.device_id,
    approval_ref:'synthetic-operator-approval',
    expires_at:new Date(Date.now()+3600000).toISOString(),
    heartbeat_target_seconds:300,
    attestation_mode:'device',
    attestation_identity:manifest.attestation.device_identity,
  });
  registry.heartbeat({
    device_id:manifest.device_id,
    capability_manifest_hash:manifest.manifest_hash,
    attestation_identity:manifest.attestation.device_identity,
    observed_at:new Date().toISOString(),
  });
  return {registry,registryRoot};
}

test('read-only field check verifies signed local telemetry without executing work',()=>withNode(async({root,token,identity})=>{
  const methods=[];
  const report=await inspectLocalMicroSeedEvidence({
    root,fetchImpl:(url,options)=>{
      methods.push(options.method);
      return fetch(url,options);
    },
  });
  assert.equal(report.ok,true);
  assert.equal(report.signed_telemetry_verified,true);
  assert.equal(report.mode,'signed_telemetry_only');
  assert.equal(report.content_hash_probe_verified,false);
  assert.equal(report.private_signed_journal_reopened,false);
  assert.equal(report.actual_physical_hardware_attested,false);
  assert.equal(report.passport_access_verified,false);
  assert.equal(report.downstream_effect_verified,false);
  assert.deepEqual(methods,['GET','GET']);
  assert.equal(fs.existsSync(path.join(root,'state','signed-receipts')),false);
  assert.equal(JSON.stringify(report).includes(token),false);
  assert.equal(JSON.stringify(report).includes(identity.private_key),false);
}));

test('quarantined Node001 rejects on-node hash proof without any network call',()=>withNode(async({root})=>{
  let calls=0;
  await assert.rejects(inspectLocalMicroSeedEvidence({
    root,hashProbe:true,fetchImpl:async()=>{
      calls+=1;
      throw new Error('unexpected_network_request');
    },
  }),/field_proof_device_quarantined_pending_host_review/);
  assert.equal(calls,0);
  assert.equal(fs.existsSync(path.join(root,'state','signed-execution-intents')),false);
  assert.equal(fs.existsSync(path.join(root,'state','signed-receipts')),false);
},{deviceId:'evercraft-node001-penguin'}));

test('quarantined Node001 allows signed telemetry but blocks direct execution POST',()=>withNode(async({
  root,agent,token,manifest,
})=>{
  const healthResponse=await fetch(agent.url+'/health');
  assert.equal(healthResponse.status,200);
  assert.equal((await healthResponse.json()).execution_quarantined,true);
  const telemetryResponse=await fetch(agent.url+'/v1/telemetry',{
    headers:{authorization:'Bearer '+token},
  });
  assert.equal(telemetryResponse.status,200);
  assert.equal((await telemetryResponse.json()).schema,
    'evercraft.microseed.device-telemetry.v1');
  const check=await inspectLocalMicroSeedEvidence({root,hashProbe:false});
  assert.equal(check.signed_telemetry_verified,true);
  const response=await fetch(agent.url+'/v1/execute',{
    method:'POST',headers:{
      authorization:'Bearer '+token,
      'content-type':'application/json',
    },body:JSON.stringify({request:{
      device_id:manifest.device_id,
      workload_class:'systemia.content-hash.v1',
      idempotency_key:'quarantined-no-execution',
      payload:{value:'should never execute'},
    }}),
  });
  assert.equal(response.status,423);
  assert.equal((await response.json()).error,
    'microseed_device_quarantined_pending_host_review');
  assert.equal(fs.existsSync(path.join(root,'state','signed-execution-intents')),false);
  assert.equal(fs.existsSync(path.join(root,'state','signed-receipts')),false);
},{deviceId:'evercraft-node001-penguin'}));

test('hash probe refuses legacy agent without journal commit support before POST',()=>withNode(async({root})=>{
  const calls=[];
  await assert.rejects(inspectLocalMicroSeedEvidence({
    root,hashProbe:true,
    fetchImpl:async(url,options)=>{
      const route=new URL(url).pathname;
      calls.push({route,method:options.method});
      const response=await fetch(url,options);
      if(route!=='/health')return response;
      const body=await response.json();
      delete body.signed_journal_commit_before_ack;
      return new Response(JSON.stringify(body),{
        status:200,headers:{'content-type':'application/json'},
      });
    },
  }),/field_proof_signed_journal_protocol_unavailable/);
  assert.equal(calls.some(call=>call.method==='POST'),false);
  assert.equal(fs.existsSync(path.join(root,'state','idempotency')),false);
  assert.equal(fs.existsSync(path.join(root,'state','signed-receipts')),false);
}));

test('signed native execution uses only journal and replays exact signed bytes',()=>withNode(async({root,agent,token,manifest})=>{
  const request={
    device_id:manifest.device_id,
    workload_class:'systemia.content-hash.v1',
    idempotency_key:'signed-journal-first-test',
    payload:{value:'bounded synthetic fixture'},
    requested_memory_mb:0,
    requested_cpu_fraction:0,
  };
  const execute=async value=>fetch(agent.url+'/v1/execute',{
    method:'POST',headers:{
      authorization:'Bearer '+token,
      'content-type':'application/json',
    },body:JSON.stringify({request:value}),
  });
  const first=await execute(request);
  assert.equal(first.status,200);
  const one=await first.json();
  assert.equal(one.result.ok,true);
  assert.equal(fs.existsSync(path.join(root,'state','idempotency')),false);
  assert.equal(fs.existsSync(path.join(root,'state','signed-execution-intents','v1')),true);
  const durable=await readSignedMicroSeedReceipt({
    stateDir:path.join(root,'state'),
    device_id:manifest.device_id,idempotency_key:request.idempotency_key,
  });
  assert.equal(durable.receipt_hash,one.receipt_hash);
  const replay=await execute(request);
  assert.equal(replay.status,200);
  const two=await replay.json();
  assert.equal(two.receipt_hash,one.receipt_hash);
  assert.equal(two.device_signature.signature_base64,
    one.device_signature.signature_base64);
  assert.equal(two.completed_at,one.completed_at);
  const conflict=await execute({
    ...request,payload:{value:'different payload, same key'},
  });
  assert.equal(conflict.status,422);
  assert.equal((await conflict.json()).error,
    'microseed_signed_attempt_conflict_or_invalid');
  assert.equal(fs.existsSync(path.join(root,'state','idempotency')),false);
}));

test('signed journal write failure never publishes unsigned success cache',()=>withNode(async({root,agent,token,manifest})=>{
  const state=path.join(root,'state');
  fs.writeFileSync(path.join(state,'signed-receipts'),'blocked',{mode:0o600});
  const response=await fetch(agent.url+'/v1/execute',{
    method:'POST',headers:{
      authorization:'Bearer '+token,'content-type':'application/json',
    },body:JSON.stringify({request:{
      device_id:manifest.device_id,
      workload_class:'systemia.content-hash.v1',
      idempotency_key:'synthetic-journal-blocked',
      payload:{value:'no unsigned acknowledgement'},
    }}),
  });
  assert.notEqual(response.status,200);
  assert.equal(fs.existsSync(path.join(state,'idempotency')),false);
}));

test('signed agent holds a legacy unsigned attempt instead of reexecuting it',()=>withNode(async({root,agent,token,manifest})=>{
  const pending=path.join(root,'state','idempotency',manifest.device_id);
  fs.mkdirSync(pending,{recursive:true,mode:0o700});
  fs.writeFileSync(path.join(pending,'legacy-hold.json'),'{"unsigned":true}',{mode:0o600});
  const response=await fetch(agent.url+'/v1/execute',{
    method:'POST',headers:{
      authorization:'Bearer '+token,'content-type':'application/json',
    },body:JSON.stringify({request:{
      device_id:manifest.device_id,
      workload_class:'systemia.content-hash.v1',
      idempotency_key:'legacy-hold',
      payload:{value:'must not run'},
    }}),
  });
  assert.equal(response.status,422);
  assert.equal((await response.json()).error,
    'microseed_unsigned_legacy_attempt_requires_review');
  assert.equal(fs.existsSync(path.join(root,'state','signed-receipts')),false);
}));

test('interrupted signed attempt is held rather than silently executed after restart',()=>withNode(async({root,agent,token,manifest})=>{
  const idempotency_key='interrupted-before-signed-journal';
  const request={
    device_id:manifest.device_id,
    workload_class:'systemia.content-hash.v1',
    idempotency_key,
    payload:{value:'this must not re-execute'},
    requested_memory_mb:0,
    requested_cpu_fraction:0,
  };
  const { normalizeMicroSeedExecutionRequest }=await import('./microseed-executor.mjs');
  const normalized=normalizeMicroSeedExecutionRequest(request);
  await reserveSignedMicroSeedExecution({
    stateDir:path.join(root,'state'),
    device_id:manifest.device_id,
    idempotency_key,
    request_hash:normalized.request_hash,
    manifest_hash:manifest.manifest_hash,
    workload_class:normalized.workload_class,
  });
  const response=await fetch(agent.url+'/v1/execute',{
    method:'POST',headers:{
      authorization:'Bearer '+token,'content-type':'application/json',
    },body:JSON.stringify({request}),
  });
  assert.equal(response.status,422);
  assert.equal((await response.json()).error,'microseed_execution_intent_unresolved');
  assert.equal(fs.existsSync(path.join(root,'state','idempotency')),false);
  assert.equal(fs.existsSync(path.join(root,'state','signed-receipts')),false);
}));

test('explicit registered hash probe reopens and verifies actual signed local journal',()=>withNode(async({root,boot,manifest,identity,token})=>{
  const report=await inspectLocalMicroSeedEvidence({root,hashProbe:true});
  assert.equal(report.ok,true);
  assert.equal(report.mode,'one_registered_hash_and_signed_journal');
  assert.equal(report.signed_telemetry_verified,true);
  assert.equal(report.content_hash_probe_verified,true);
  assert.equal(report.private_signed_journal_reopened,true);
  assert.equal(report.ambient_registry_current_trust_verified,false);
  assert.equal(report.downstream_effect_verified,false);
  assert.equal(report.actual_physical_hardware_attested,false);
  const subdirs=fs.readdirSync(path.join(boot.state_dir,'signed-receipts','v1'));
  assert.equal(subdirs.length,1);
  const rows=fs.readdirSync(path.join(boot.state_dir,'signed-receipts','v1',subdirs[0]));
  assert.equal(rows.length,1);
  const receipt=JSON.parse(fs.readFileSync(path.join(boot.state_dir,'signed-receipts','v1',subdirs[0],rows[0]),'utf8'));
  assert.equal(verifyMicroSeedExecutionReceipt(receipt,{
    publicKey:identity.public_key,expected_device_id:manifest.device_id,
  }).verified,true);
  assert.equal(receipt.workload_class,'systemia.content-hash.v1');
  assert.equal(receipt.execution_location,'device');
  assert.equal(JSON.stringify(report).includes(token),false);
  assert.equal(JSON.stringify(report).includes(manifest.device_id),false);
}));

test('approved Ambient Registry is checked using existing device approval',()=>withNode(async({root,manifest})=>{
  const {registryRoot,registry}=approveDevice({root,manifest});
  const pass=await inspectLocalMicroSeedEvidence({root,ambientRegistryRoot:registryRoot});
  assert.equal(pass.ambient_registry_current_trust_verified,true);
  registry.revoke({
    device_id:manifest.device_id,approval_ref:'test-revoke',reason:'fixture',
  });
  await assert.rejects(inspectLocalMicroSeedEvidence({
    root,ambientRegistryRoot:registryRoot,
  }),/visual_ambient_trust_device_not_active/);
}));

test('wrong signed telemetry bytes cannot be passed by local proof',()=>withNode(async({root})=>{
  await assert.rejects(inspectLocalMicroSeedEvidence({
    root,fetchImpl:async(url,options)=>{
      const response=await fetch(url,options);
      if(String(url).endsWith('/v1/telemetry')){
        const body=await response.json();
        body.telemetry.memory_free_mb=999999;
        return new Response(JSON.stringify(body),{
          status:200,headers:{'content-type':'application/json'},
        });
      }
      return response;
    },
  }),/field_proof_telemetry_signature_invalid/);
}));

test('no arbitrary network endpoint allowed even with a valid manifest hash',()=>withNode(async({root})=>{
  const file=path.join(root,'manifest.json');
  const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
  const hostile=normalizeMicroDeviceManifest({
    ...manifest,endpoint:'http://192.0.2.1:8792',
  });
  fs.writeFileSync(file,JSON.stringify(hostile),{mode:0o600});
  await assert.rejects(inspectLocalMicroSeedEvidence({root}),/field_proof_loopback_only/);
}));

test('wrong local pinned identity fails closed before contacting native agent',()=>withNode(async({root})=>{
  const manifestFile=path.join(root,'manifest.json');
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  const {publicKey}=generateKeyPairSync('ed25519');
  const changed=normalizeMicroDeviceManifest({
    ...manifest,attestation:{
      ...manifest.attestation,
      receipt_public_key_pem:publicKey.export({type:'spki',format:'pem'}).toString(),
    },
  });
  fs.writeFileSync(manifestFile,JSON.stringify(changed),{mode:0o600});
  await assert.rejects(inspectLocalMicroSeedEvidence({root}),/field_proof_pinned_identity_mismatch/);
}));

test('no native service is reported as a completed on-node proof',()=>withNode(async({root,agent})=>{
  await agent.close();
  // Use a custom fetch to simulate connection failure without reusing a
  // closed service handler in fixture cleanup.
  await assert.rejects(inspectLocalMicroSeedEvidence({
    root,fetchImpl:async()=>{throw Error('offline')}
  }),/offline/);
  agent.close=async()=>{};
}));
