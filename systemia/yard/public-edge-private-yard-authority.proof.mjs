import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { YardOperator } from './operator.mjs';
import { PublicEdgeActivationWatcher } from './public-edge-activation-watch.mjs';

async function freeUdpPort(){
  const socket=dgram.createSocket('udp4');
  await new Promise((resolve,reject)=>{
    socket.once('error',reject);
    socket.bind(0,'127.0.0.1',resolve);
  });
  const address=socket.address();
  const port=typeof address==='object'?address.port:0;
  await new Promise(resolve=>socket.close(resolve));
  return port;
}

const root=fs.mkdtempSync(path.join(os.tmpdir(),'private-yard-edge-authority-proof-'));
const seedRoot=path.join(root,'seed');
const canonicalYardState=path.join(root,'canonical-yard');
const watchState=path.join(root,'watch');
const originTarget=path.join(seedRoot,'git','bootstrap-origin.git');
const announcePort=await freeUdpPort();
const allocatorToken='private-yard-proof-allocator-secret';
const releaseRef='a'.repeat(40);

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

const seed=await startNodeSeed({
  root:seedRoot,
  nodeId:'private-yard-edge-node',
  host:'127.0.0.1',
  port:0,
  advertiseHost:'127.0.0.1',
  allocatorToken,
  placementLabels:['public-edge','gateway'],
  announce:true,
  announceAddress:'127.0.0.1',
  announcePort,
  announceIntervalMs:75,
});

let watcher=null;
const canonicalYard=new YardOperator({stateDir:canonicalYardState});

try{
  const bootstrap=await canonicalYard.deployRelease({
    deploymentId:'node001-existing-yard-deployment',
    releaseRef,
    workloadClass:'systemia.private-core-origin.v1',
    capacityEndpoint:seed.endpoint,
    allocatorToken,
    input:{target_path:originTarget},
    rollbackTarget:'proof:bootstrap-previous',
    leaseTtlMs:120000,
  });
  assert.equal(bootstrap.state,'ready');
  assert.equal(bootstrap.receipt.capacity_node_id,'private-yard-edge-node');

  const privateAuthority=canonicalYard.privateCapacityAuthorities();
  assert.equal(privateAuthority.schema,'evercraft.yard.private-capacity-authorities.v1');
  assert.equal(
    privateAuthority.allocatorTokens['private-yard-edge-node'],
    allocatorToken
  );

  await new Promise(resolve=>setTimeout(resolve,120));

  watcher=new PublicEdgeActivationWatcher({
    stateDir:watchState,
    releaseRef,
    discovery:{
      bindAddress:'127.0.0.1',
      multicastAddress:'127.0.0.1',
      port:announcePort,
      timeoutMs:350,
      joinMulticast:false,
    },
    allocatorTokenProvider:async()=>{
      const privateMap=canonicalYard.privateCapacityAuthorities();
      return {
        allocatorToken:'',
        allocatorTokens:privateMap.allocatorTokens,
      };
    },
    capacityGrantProvider:null,
    edge:{
      mode:'proof_loopback',
      public_host:'127.0.0.1',
      public_port:0,
    },
    specialist:{
      gateway_url:'https://example.invalid/machine-commerce',
    },
    requiredPlacementLabels:['public-edge'],
    requestedHostname:'private-yard-proof-specialists',
    endpointTimeoutMs:500,
    leaseTtlMs:120000,
    renewEveryMs:60000,
    intervalMs:30000,
    allowLoopbackProof:true,
  });

  const activated=await watcher.tick();
  assert.equal(activated.action,'activated');
  assert.equal(activated.selected_node_id,'private-yard-edge-node');
  assert.equal(activated.route_scope,'loopback_proof');
  assert.equal(activated.identity_verified,true);
  assert.equal(activated.allocator_authority_persisted,false);

  const stateFile=path.join(watchState,'public-edge-activation-watch.json');
  const stateRaw=fs.readFileSync(stateFile,'utf8');
  assert.equal(stateRaw.includes(allocatorToken),false);
  assert.equal(stateRaw.includes(seed.endpoint),false);

  const controllerState=fs.readFileSync(
    path.join(watchState,'controller','public-edge-controller.json'),
    'utf8'
  );
  assert.equal(controllerState.includes(allocatorToken),false);

  const stopped=await watcher.close({stopManagedRuntime:true});
  assert.equal(stopped.action,'stopped');
  await canonicalYard.stopDeployment(
    'node001-existing-yard-deployment',
    {reason:'proof_complete'}
  );

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.public-edge.private-yard-authority-proof.v1',
    prior_yard_deployment_supplies_authority:true,
    allocator_environment_required:false,
    local_capacity_discovery:true,
    automatic_edge_activation:true,
    allocator_authority_persisted:false,
    raw_capacity_endpoint_persisted_by_watch:false,
    identity_attested:true,
    founder_login_required:false,
    public_https_verified:false,
    proof_scope:'loopback_bootstrap_only',
    activation_receipt:activated.receipt_hash,
  },null,2));
}finally{
  try{watcher?.stop();}catch{}
  try{await seed.close();}catch{}
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
