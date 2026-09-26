import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startNodeSeed } from './node-seed.mjs';
import { YardOperator } from '../yard/operator.mjs';

async function freePort(){
  const server=net.createServer();
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const address=server.address();
  const port=typeof address==='object'&&address?address.port:0;
  await new Promise(resolve=>server.close(()=>resolve()));
  return port;
}

function makeCert(key,cert,cn){
  execFileSync('openssl',[
    'req','-x509','-newkey','rsa:2048','-nodes',
    '-keyout',key,
    '-out',cert,
    '-days','10',
    '-subj','/CN=*.'+cn,
    '-addext','subjectAltName=DNS:*.'+cn,
  ],{stdio:'ignore'});
}

const root=fs.mkdtempSync(path.join(os.tmpdir(),'public-edge-admission-drift-'));
const computeRoot=path.join(root,'compute');
const yardState=path.join(root,'yard');
const tlsDir=path.join(root,'tls');
fs.mkdirSync(tlsDir,{recursive:true});
const key=path.join(tlsDir,'edge.key.pem');
const cert=path.join(tlsDir,'edge.cert.pem');
const token='edge-admission-drift-secret';
const domain='edge.evercraft.test';
const publicPort=await freePort();
makeCert(key,cert,domain);

const previous={
  domain:process.env.EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN,
  key:process.env.EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH,
  cert:process.env.EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH,
  port:process.env.EVERCRAFT_PUBLIC_EDGE_PORT,
};
process.env.EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN=domain;
process.env.EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH=key;
process.env.EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH=cert;
process.env.EVERCRAFT_PUBLIC_EDGE_PORT=String(publicPort);

const seed=await startNodeSeed({
  root:computeRoot,
  nodeId:'edge-admission-drift-node',
  host:'127.0.0.1',
  port:0,
  advertiseHost:'127.0.0.1',
  allocatorToken:token,
  placementLabels:['public-edge','gateway'],
  announce:false,
});
const yard=new YardOperator({stateDir:yardState});

try{
  const capacity=await fetch(seed.endpoint+'/v1/capacity').then(r=>r.json());
  const admittedFingerprint=
    capacity.capacity_hint.services.public_edge.certificate_fingerprint256;
  assert.equal(capacity.capacity_hint.services.public_edge.ready,true);
  assert.ok(admittedFingerprint);

  const first=await yard.deployRelease({
    deploymentId:'edge-cert-a',
    releaseRef:'a'.repeat(40),
    workloadClass:'systemia.public-edge.v1',
    capacityEndpoint:seed.endpoint,
    allocatorToken:token,
    input:{
      mode:'wildcard_https',
      control_host:'127.0.0.1',
      public_host:'127.0.0.1',
      public_port:publicPort,
    },
    rollbackTarget:'proof:previous-edge',
    leaseTtlMs:120000,
  });
  assert.equal(first.state,'ready');
  assert.equal(
    first.result.admitted_edge_certificate_fingerprint256,
    admittedFingerprint
  );
  await yard.stopDeployment('edge-cert-a',{reason:'rotate_cert_for_proof'});

  const keyB=path.join(tlsDir,'edge-b.key.pem');
  const certB=path.join(tlsDir,'edge-b.cert.pem');
  makeCert(keyB,certB,domain);
  fs.copyFileSync(keyB,key);
  fs.copyFileSync(certB,cert);

  await assert.rejects(
    yard.deployRelease({
      deploymentId:'edge-cert-b-without-readmission',
      releaseRef:'b'.repeat(40),
      workloadClass:'systemia.public-edge.v1',
      capacityEndpoint:seed.endpoint,
      allocatorToken:token,
      input:{
        mode:'wildcard_https',
        control_host:'127.0.0.1',
        public_host:'127.0.0.1',
        public_port:publicPort,
      },
      rollbackTarget:'proof:edge-cert-a',
      leaseTtlMs:120000,
    }),
    /public_edge_runtime_admission_drift/
  );

  const capacityAfter=await fetch(seed.endpoint+'/v1/capacity').then(r=>r.json());
  assert.equal(
    capacityAfter.capacity_hint.services.public_edge.certificate_fingerprint256,
    admittedFingerprint,
    'running NodeSeed admission snapshot must not silently follow changed files'
  );

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.compute.public-edge-admission-drift-proof.v1',
    admitted_certificate_started:true,
    changed_certificate_without_readmission_rejected:true,
    nodeseed_restart_required_after_cert_rotation:true,
    admitted_certificate_fingerprint256:admittedFingerprint,
    founder_login_required:false,
  },null,2));
}finally{
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
