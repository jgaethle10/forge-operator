import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { PublicEdgeActivationWatcher } from './public-edge-activation-watch.mjs';

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
  assert.equal(initial.reason,'no_edge_ready_compute_node');
  assert.equal(initial.discovered_count,0);
  assert.equal(initial.eligible_count,0);
  assert.equal(initial.founder_action_required,false);

  seed=await startNodeSeed({
    root:path.join(root,'node'),
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
  assert.equal(activated.selected_node_id,'watch-edge-node');
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
  assert.ok(resumed.resume_receipt);

  const stopped=await restarted.close({stopManagedRuntime:true});
  assert.equal(stopped.action,'stopped');
  assert.ok(stopped.route_release_receipt);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.public-edge.activation-watch-proof.v1',
    zero_capacity_hold:true,
    founder_action_required_on_hold:false,
    edge_ready_node_detected:true,
    automatic_activation:true,
    selected_node:'watch-edge-node',
    placement_label_filtering:true,
    controller_restart_resume:true,
    allocator_authority_persisted:false,
    clean_route_release:true,
    clean_runtime_teardown:true,
    public_https_verified:false,
    proof_scope:'loopback_only',
    initial_hold_receipt:initial.receipt_hash,
    activation_receipt:activated.receipt_hash,
    resume_receipt:resumed.receipt_hash,
    stop_receipt:stopped.receipt_hash,
  },null,2));
}finally{
  try{watcher?.stop();}catch{}
  try{restarted?.stop();}catch{}
  try{await seed?.close();}catch{}
  if(previous.domain===undefined) delete process.env.EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN;
  else process.env.EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN=previous.domain;
  if(previous.key===undefined) delete process.env.EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH;
  else process.env.EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH=previous.key;
  if(previous.cert===undefined) delete process.env.EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH;
  else process.env.EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH=previous.cert;
  if(previous.port===undefined) delete process.env.EVERCRAFT_PUBLIC_EDGE_PORT;
  else process.env.EVERCRAFT_PUBLIC_EDGE_PORT=previous.port;
  fs.rmSync(root,{recursive:true,force:true});
}
