import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { PublicEdgeActivationWatcher } from './public-edge-activation-watch.mjs';
import { EvercraftIdentity } from '../identity/identity.mjs';
import { EvercraftPassport } from '../passport/passport.mjs';

async function freeUdpPort(){
  const socket=dgram.createSocket('udp4');
  await new Promise((resolve,reject)=>{
    socket.once('error',reject);
    socket.bind(0,'127.0.0.1',resolve);
  });
  const address=socket.address();
  const port=typeof address==='object'?address.port:0;
  await new Promise((resolve)=>socket.close(resolve));
  return port;
}

const root=fs.mkdtempSync(path.join(os.tmpdir(),'public-edge-watch-proof-'));
const announcePort=await freeUdpPort();
const token='watcher-proof-allocator-secret';
const stateDir=path.join(root,'watch');
const tlsDir=path.join(root,'tls');
fs.mkdirSync(tlsDir,{recursive:true});
const tlsKey=path.join(tlsDir,'edge.key.pem');
const tlsCert=path.join(tlsDir,'edge.cert.pem');
execFileSync('openssl',[
  'req','-x509','-newkey','rsa:2048','-nodes',
  '-keyout',tlsKey,
  '-out',tlsCert,
  '-days','10',
  '-subj','/CN=*.edge.evercraft.test',
  '-addext','subjectAltName=DNS:*.edge.evercraft.test',
],{stdio:'ignore'});

const previous={
  domain:process.env.EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN,
  key:process.env.EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH,
  cert:process.env.EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH,
  port:process.env.EVERCRAFT_PUBLIC_EDGE_PORT,
  identitySecret:process.env.EVERCRAFT_IDENTITY_SECRET,
  identityKeyId:process.env.EVERCRAFT_IDENTITY_KEY_ID,
  identityState:process.env.EVERCRAFT_IDENTITY_STATE_DIR,
  passportState:process.env.EVERCRAFT_PASSPORT_STATE_DIR,
};
process.env.EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN='edge.evercraft.test';
process.env.EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH=tlsKey;
process.env.EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH=tlsCert;
process.env.EVERCRAFT_PUBLIC_EDGE_PORT='443';

const discovery={
  bindAddress:'127.0.0.1',
  multicastAddress:'127.0.0.1',
  port:announcePort,
  timeoutMs:300,
  joinMulticast:false,
};

let seed=null;
let heldSeed=null;
let identityHeldSeed=null;
let watcher=null;
let restarted=null;

try{
  watcher=new PublicEdgeActivationWatcher({
    stateDir,
    releaseRef:'9f1999e968a4f7451b691687c5a8e42ce66d190c',
    discovery,
    allocatorTokenProvider:async()=>({
      allocatorTokens:{'watch-edge-node':token},
    }),
    edge:{
      mode:'proof_loopback',
      public_host:'127.0.0.1',
      public_port:0,
    },
    specialist:{
      gateway_url:'https://example.invalid/machine-commerce',
    },
    home:{
      enabled:true,
      requested_hostname:'home-proof',
      stable_hostname:true,
    },
    requiredPlacementLabels:['public-edge'],
    requestedHostname:'watched-specialists',
    endpointTimeoutMs:500,
    leaseTtlMs:120000,
    renewEveryMs:60000,
    intervalMs:30000,
    allowLoopbackProof:true,
  });

  const initial=await watcher.tick();
  assert.equal(initial.action,'hold');
  assert.equal(initial.reason,'no_compute_capacity_discovered');
  assert.equal(initial.discovered_count,0);
  assert.equal(initial.eligible_count,0);
  assert.equal(initial.founder_action_required,false);

  heldSeed=await startNodeSeed({
    root:path.join(root,'unadmitted-node'),
    nodeId:'watch-unadmitted-node',
    host:'127.0.0.1',
    port:0,
    advertiseHost:'127.0.0.1',
    allocatorToken:token,
    placementLabels:['general'],
    announce:true,
    announceAddress:'127.0.0.1',
    announcePort,
    announceIntervalMs:100,
  });
  await new Promise(resolve=>setTimeout(resolve,180));

  const admissionHold=await watcher.tick();
  assert.equal(admissionHold.action,'hold');
  assert.equal(admissionHold.reason,'field_or_tls_admission_pending');
  assert.equal(admissionHold.discovered_count,1);
  assert.equal(admissionHold.eligible_count,0);
  assert.equal(admissionHold.candidate_reason_counts.placement_label_missing,1);
  assert.equal(admissionHold.founder_action_required,false);

  await heldSeed.close();
  heldSeed=null;

  identityHeldSeed=await startNodeSeed({
    root:path.join(root,'identity-held-node'),
    nodeId:'watch-identity-held-node',
    host:'127.0.0.1',
    port:0,
    advertiseHost:'127.0.0.1',
    allocatorToken:token,
    placementLabels:['public-edge','gateway'],
    announce:true,
    announceAddress:'127.0.0.1',
    announcePort,
    announceIntervalMs:100,
  });
  await new Promise(resolve=>setTimeout(resolve,180));

  const identityHold=await watcher.tick();
  assert.equal(identityHold.action,'hold');
  assert.equal(identityHold.reason,'field_or_tls_admission_pending');
  assert.equal(identityHold.discovered_count,1);
  assert.equal(identityHold.eligible_count,0);
  assert.equal(identityHold.candidate_reason_counts.service_capability_not_ready,1);
  assert.equal(identityHold.founder_action_required,false);

  await identityHeldSeed.close();
  identityHeldSeed=null;

  const nodeRoot=path.join(root,'node');
  const identityState=path.join(nodeRoot,'identity');
  const passportState=path.join(nodeRoot,'passport');
  fs.mkdirSync(identityState,{recursive:true,mode:0o700});
  fs.mkdirSync(passportState,{recursive:true,mode:0o700});
  process.env.EVERCRAFT_IDENTITY_SECRET='activation-watch-home-secret-01234567890123456789';
  process.env.EVERCRAFT_IDENTITY_KEY_ID='activation-proof-key';
  process.env.EVERCRAFT_IDENTITY_STATE_DIR=identityState;
  process.env.EVERCRAFT_PASSPORT_STATE_DIR=passportState;
  const identity=new EvercraftIdentity({stateDir:identityState});
  const boot=identity.bootstrapOwner({
    subjectRef:'user:activation-watch-proof',
    login:'activation-owner',
    displayName:'Activation Owner',
    password:'activation watcher proof password 2026',
    authorityReceiptRef:'manual:activation-watch-proof',
  });
  const passport=new EvercraftPassport({stateDir:passportState});
  passport.issueGrant({
    idempotency_key:'activation-watch-home-owner',
    subject_ref:'user:activation-watch-proof',
    issuer_ref:'evercraft:identity-authority',
    product:'evercraft-home',
    scopes:['home.read','home.identity.sessions.manage'],
    starts_at:new Date(Date.now()-1000).toISOString(),
    ends_at:new Date(Date.now()+60*60*1000).toISOString(),
    max_delegation_depth:1,
    authority_state:'verified_identity_authority',
    authority_receipt_ref:boot.receipt.receipt_hash,
  });

  seed=await startNodeSeed({
    root:nodeRoot,
    nodeId:'watch-edge-node',
    host:'127.0.0.1',
    port:0,
    advertiseHost:'127.0.0.1',
    allocatorToken:token,
    placementLabels:['public-edge','gateway'],
    announce:true,
    announceAddress:'127.0.0.1',
    announcePort,
    announceIntervalMs:100,
  });

  await new Promise(resolve=>setTimeout(resolve,180));

  const activated=await watcher.tick();
  assert.equal(activated.action,'activated');
  assert.equal(activated.route_scope,'loopback_proof');
  assert.equal(activated.route_verified,false);
  assert.equal(activated.home_enabled,true);
  assert.equal(activated.home_route_scope,'loopback_proof');
  assert.equal(activated.home_route_verified,false);
  assert.match(activated.home_origin,/^http:\/\/127\.0\.0\.1:/);
  assert.equal(activated.selected_node_id,'watch-edge-node');
  assert.equal(activated.identity_attestation_required,true);
  assert.equal(activated.identity_verified,true);
  assert.ok(activated.device_fingerprint);
  assert.ok(activated.edge_attestation_receipt);
  assert.ok(activated.specialist_attestation_receipt);
  assert.ok(activated.specialist_identity_binding_receipt);
  assert.equal(activated.founder_action_required,false);

  const stateFile=path.join(stateDir,'public-edge-activation-watch.json');
  const persisted=fs.readFileSync(stateFile,'utf8');
  assert.equal(persisted.includes(token),false);
  assert.equal(JSON.parse(persisted).allocator_authority_persisted,false);

  watcher.stop();

  restarted=new PublicEdgeActivationWatcher({
    stateDir,
    releaseRef:'9f1999e968a4f7451b691687c5a8e42ce66d190c',
    discovery,
    allocatorTokenProvider:async()=>({
      allocatorTokens:{'watch-edge-node':token},
    }),
    edge:{
      mode:'proof_loopback',
      public_host:'127.0.0.1',
      public_port:0,
    },
    specialist:{
      gateway_url:'https://example.invalid/machine-commerce',
    },
    home:{
      enabled:true,
      requested_hostname:'home-proof',
      stable_hostname:true,
    },
    requiredPlacementLabels:['public-edge'],
    requestedHostname:'watched-specialists',
    endpointTimeoutMs:500,
    leaseTtlMs:120000,
    renewEveryMs:60000,
    intervalMs:30000,
    allowLoopbackProof:true,
  });

  const resumed=await restarted.tick();
  assert.equal(resumed.action,'healthy');
  assert.equal(resumed.route_scope,'loopback_proof');
  assert.equal(resumed.route_verified,false);
  assert.equal(resumed.home_enabled,true);
  assert.equal(resumed.home_route_scope,'loopback_proof');
  assert.equal(resumed.home_route_verified,false);
  assert.ok(resumed.home_origin);
  assert.ok(resumed.resume_receipt);

  const stopped=await restarted.close({stopManagedRuntime:true});
  assert.equal(stopped.action,'stopped');
  assert.ok(stopped.route_release_receipt);
  assert.ok(stopped.home_route_release_receipt);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.public-edge.activation-watch-proof.v1',
    zero_capacity_hold:true,
    field_or_tls_admission_hold:true,
    home_identity_readiness_hold:true,
    founder_action_required_on_hold:false,
    edge_ready_node_detected:true,
    automatic_activation:true,
    evercraft_home_automatic_activation:true,
    selected_node:'watch-edge-node',
    placement_label_filtering:true,
    device_identity_attested:true,
    same_device_binding:true,
    compute_identity_binding_receipt:true,
    controller_restart_resume:true,
    allocator_authority_persisted:false,
    clean_route_release:true,
    clean_runtime_teardown:true,
    public_https_verified:false,
    proof_scope:'loopback_only',
    initial_hold_receipt:initial.receipt_hash,
    admission_hold_receipt:admissionHold.receipt_hash,
    identity_hold_receipt:identityHold.receipt_hash,
    activation_receipt:activated.receipt_hash,
    resume_receipt:resumed.receipt_hash,
    stop_receipt:stopped.receipt_hash,
  },null,2));
}finally{
  try{watcher?.stop();}catch{}
  try{restarted?.stop();}catch{}
  try{await seed?.close();}catch{}
  try{await heldSeed?.close();}catch{}
  try{await identityHeldSeed?.close();}catch{}
  if(previous.domain===undefined) delete process.env.EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN;
  else process.env.EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN=previous.domain;
  if(previous.key===undefined) delete process.env.EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH;
  else process.env.EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH=previous.key;
  if(previous.cert===undefined) delete process.env.EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH;
  else process.env.EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH=previous.cert;
  if(previous.port===undefined) delete process.env.EVERCRAFT_PUBLIC_EDGE_PORT;
  else process.env.EVERCRAFT_PUBLIC_EDGE_PORT=previous.port;
  if(previous.identitySecret===undefined) delete process.env.EVERCRAFT_IDENTITY_SECRET;
  else process.env.EVERCRAFT_IDENTITY_SECRET=previous.identitySecret;
  if(previous.identityKeyId===undefined) delete process.env.EVERCRAFT_IDENTITY_KEY_ID;
  else process.env.EVERCRAFT_IDENTITY_KEY_ID=previous.identityKeyId;
  if(previous.identityState===undefined) delete process.env.EVERCRAFT_IDENTITY_STATE_DIR;
  else process.env.EVERCRAFT_IDENTITY_STATE_DIR=previous.identityState;
  if(previous.passportState===undefined) delete process.env.EVERCRAFT_PASSPORT_STATE_DIR;
  else process.env.EVERCRAFT_PASSPORT_STATE_DIR=previous.passportState;
  fs.rmSync(root,{recursive:true,force:true});
}
