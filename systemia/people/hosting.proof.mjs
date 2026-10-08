import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { EvercraftHostingControlPlane, validateEvercraftServiceSpec } from '../compute/hosting-control-plane.mjs';
import { YardOperator } from '../yard/operator.mjs';
import { peopleLayerServiceSpec } from './hosting.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'people-hosting-proof-'));
const computeRoot=path.join(root,'compute');
const yardState=path.join(root,'yard');
const hostingState=path.join(root,'hosting');
const stateRoot=path.join(computeRoot,'people-state');
const authorityFile=path.join(computeRoot,'people-authority');
const mailPublicKeyFile=path.join(computeRoot,'people-mail-public-keys.json');
const allocatorAuthority=randomBytes(32).toString('hex');
const operatorAuthority=randomBytes(32).toString('hex');

fs.mkdirSync(computeRoot,{recursive:true,mode:0o700});
fs.writeFileSync(authorityFile,operatorAuthority+'\n',{mode:0o600});
const mailKeys=generateKeyPairSync('ed25519');
fs.writeFileSync(mailPublicKeyFile,JSON.stringify({gmail_agent:mailKeys.publicKey.export({type:'spki',format:'pem'})}),{mode:0o600});

const oldState=process.env.PEOPLE_STATE_DIR;
const oldAuthority=process.env.PEOPLE_ADMIN_TOKEN_FILE;
const oldMailKeys=process.env.PEOPLE_MAIL_DELIVERY_PUBLIC_KEYS_FILE;
process.env.PEOPLE_STATE_DIR=stateRoot;
process.env.PEOPLE_ADMIN_TOKEN_FILE=authorityFile;
process.env.PEOPLE_MAIL_DELIVERY_PUBLIC_KEYS_FILE=mailPublicKeyFile;

const node=await startEvercraftComputeNode({
  root:computeRoot,
  nodeId:'people-hosting-proof-node',
  allocatorToken:allocatorAuthority,
});
const yard=new YardOperator({stateDir:yardState});
const hosting=new EvercraftHostingControlPlane({
  yard,
  stateDir:hostingState,
  allowLoopbackProof:true,
  defaultLeaseTtlMs:120000,
  defaultRenewEveryMs:60000,
});

try{
  const edge=await yard.deployRelease({
    deploymentId:'evercraft-public-edge',
    releaseRef:'e'.repeat(40),
    workloadClass:'systemia.public-edge.v1',
    capacityEndpoint:node.endpoint,
    allocatorToken:allocatorAuthority,
    input:{
      mode:'proof_loopback',
      control_host:'127.0.0.1',
      control_port:0,
      public_host:'127.0.0.1',
      public_port:0,
      base_domain:'',
      tls_key_path:'',
      tls_cert_path:'',
      allow_private_upstream:false,
    },
    rollbackTarget:'proof:edge-previous',
    leaseTtlMs:120000,
  });
  assert.equal(edge.state,'ready');

  const spec=peopleLayerServiceSpec('1'.repeat(40));
  assert.equal(validateEvercraftServiceSpec(spec),true);
  assert.equal(spec.input.admin_token_file,undefined);
  assert.equal(spec.input_env.admin_token_file,'PEOPLE_ADMIN_TOKEN_FILE');

  const hosted=await hosting.apply(spec);
  assert.equal(hosted.state,'ready');
  assert.equal(hosted.action,'created');
  assert.equal(hosted.health.ok,true);
  assert.equal(hosted.route.mode,'public_edge');
  assert.match(hosted.route.origin,/^http:\/\/127\.0\.0\.1:/);
  assert.equal(hosted.active_release_ref,'1'.repeat(40));
  assert.match(hosted.instance_id,/^people_/);

  const healthResponse=await fetch(new URL('/health',hosted.route.origin));
  assert.equal(healthResponse.status,200);
  const health=await healthResponse.json();
  assert.equal(health.ok,true);
  assert.equal(health.service,'evercraft-people-layer');
  assert.equal(health.base44_runtime_dependency,false);

  const uiResponse=await fetch(new URL('/people',hosted.route.origin));
  assert.equal(uiResponse.status,200);
  assert.match(await uiResponse.text(),/Evercraft People Layer/);

  const unchanged=await hosting.apply(spec);
  assert.equal(unchanged.action,'unchanged');

  const promoted=await hosting.apply(peopleLayerServiceSpec('2'.repeat(40)));
  assert.equal(promoted.action,'promoted');
  assert.equal(promoted.active_release_ref,'2'.repeat(40));
  assert.notEqual(promoted.active_deployment_id,hosted.active_deployment_id);

  const rolled=await hosting.rollback('people-layer-production');
  assert.equal(rolled.state,'ready');
  assert.equal(rolled.active_release_ref,'1'.repeat(40));

  const ledger=fs.readFileSync(path.join(hostingState,'hosting-receipts.jsonl'),'utf8');
  assert.equal(ledger.includes(operatorAuthority),false);
  assert.equal(ledger.includes(allocatorAuthority),false);

  await hosting.remove('people-layer-production',{reason:'proof_complete'});
  await yard.stopDeployment('evercraft-public-edge',{reason:'proof_complete'});

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.people.hosting-proof.v1',
    hosting:'Evercraft Hosting',
    runtime:'Evercraft Compute',
    public_edge_binding:true,
    stable_hostname_contract:'people',
    candidate_health_gate:true,
    blue_green_promotion:true,
    rollback:true,
    authority_material_in_receipts:false,
    base44_runtime_required:false,
    production_https_canary_required:true,
  },null,2));
}finally{
  try{await node.close();}catch{}
  if(oldState===undefined)delete process.env.PEOPLE_STATE_DIR;else process.env.PEOPLE_STATE_DIR=oldState;
  if(oldAuthority===undefined)delete process.env.PEOPLE_ADMIN_TOKEN_FILE;else process.env.PEOPLE_ADMIN_TOKEN_FILE=oldAuthority;
  if(oldMailKeys===undefined)delete process.env.PEOPLE_MAIL_DELIVERY_PUBLIC_KEYS_FILE;else process.env.PEOPLE_MAIL_DELIVERY_PUBLIC_KEYS_FILE=oldMailKeys;
  fs.rmSync(root,{recursive:true,force:true});
}
