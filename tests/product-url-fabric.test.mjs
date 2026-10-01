import assert from 'node:assert/strict';
import fs from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startChumPublicOrigin } from '../systemia/chum/public-origin-runtime.mjs';
import { startPublicEdgeRuntime } from '../systemia/network/public-edge-runtime.mjs';

async function freePort(){
  const server=net.createServer();
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const address=server.address();
  const port=typeof address==='object'&&address?address.port:0;
  await new Promise((resolve)=>server.close(()=>resolve()));
  return port;
}

function requestThroughEdge({port,hostname,pathname='/'}) {
  const hostHeader=port===443?hostname:`${hostname}:${port}`;
  return new Promise((resolve,reject)=>{
    const req=https.request({
      hostname:'127.0.0.1',
      port,
      path:pathname,
      method:'GET',
      servername:hostname,
      headers:{host:hostHeader},
      rejectUnauthorized:false,
    },(res)=>{
      const chunks=[];
      res.on('data',(chunk)=>chunks.push(chunk));
      res.on('end',()=>resolve({
        status:res.statusCode,
        headers:res.headers,
        body:Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error',reject);
    req.end();
  });
}

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-product-url-fabric-'));
const publicRoot=path.join(root,'public');
const productRoot=path.join(publicRoot,'chum','products','infinite-classroom');
const key=path.join(root,'wildcard.key.pem');
const cert=path.join(root,'wildcard.cert.pem');
const domain='evercraft.test';
fs.mkdirSync(productRoot,{recursive:true});
fs.writeFileSync(path.join(productRoot,'index.html'),'<h1>Infinite Classroom</h1>\n');
fs.writeFileSync(path.join(productRoot,'llms.txt'),'# Infinite Classroom\n');
fs.writeFileSync(path.join(productRoot,'ai-discovery.json'),JSON.stringify({
  product_key:'infinite-classroom',
  name:'Infinite Classroom',
})+'\n');
fs.mkdirSync(path.join(publicRoot,'chum'),{recursive:true});
fs.writeFileSync(path.join(publicRoot,'chum','index.html'),'<h1>Evercraft CHUM</h1>\n');

execFileSync('openssl',[
  'req','-x509','-newkey','rsa:2048','-nodes',
  '-keyout',key,
  '-out',cert,
  '-days','10',
  '-subj',`/CN=*.${domain}`,
  '-addext',`subjectAltName=DNS:*.${domain}`,
],{stdio:'ignore'});

const chum=await startChumPublicOrigin({
  publicRoot,
  host:'127.0.0.1',
  port:0,
  productDomain:domain,
});
let edge=null;

try{
  const publicPort=await freePort();
  edge=await startPublicEdgeRuntime({
    mode:'wildcard_https',
    controlHost:'127.0.0.1',
    controlPort:0,
    publicHost:'127.0.0.1',
    publicPort,
    baseDomain:domain,
    tlsKeyPath:key,
    tlsCertPath:cert,
  });

  const lease=await edge.createRouteLease({
    deployment_id:'chum-product-router',
    deployment_receipt_hash:'sha256:'+'a'.repeat(64),
    instance_id:'chum-product-router-instance',
    upstream_origin:chum.url,
    requested_hostname:'product-router-check',
    stable_hostname:true,
    wildcard_subdomains:true,
    requested_ttl_ms:120000,
  });

  assert.equal(lease.wildcard_subdomains,true);
  assert.equal(lease.wildcard_hostname,'*.'+domain);

  const classroomHost='infinite-classroom.'+domain;
  const rootResponse=await requestThroughEdge({
    port:publicPort,
    hostname:classroomHost,
    pathname:'/',
  });
  assert.equal(rootResponse.status,200);
  assert.match(rootResponse.body,/Infinite Classroom/);

  const llmsResponse=await requestThroughEdge({
    port:publicPort,
    hostname:classroomHost,
    pathname:'/llms.txt',
  });
  assert.equal(llmsResponse.status,200);
  assert.match(llmsResponse.body,/Infinite Classroom/);

  const discoveryResponse=await requestThroughEdge({
    port:publicPort,
    hostname:classroomHost,
    pathname:'/ai-discovery.json',
  });
  assert.equal(discoveryResponse.status,200);
  assert.equal(JSON.parse(discoveryResponse.body).product_key,'infinite-classroom');

  const unknownResponse=await requestThroughEdge({
    port:publicPort,
    hostname:'not-admitted.'+domain,
    pathname:'/',
  });
  assert.equal(unknownResponse.status,404);
  assert.match(unknownResponse.body,/unknown_product_host/);

  const multiLabelResponse=await requestThroughEdge({
    port:publicPort,
    hostname:'nested.not-admitted.'+domain,
    pathname:'/',
  });
  assert.equal(multiLabelResponse.status,404);
  assert.match(multiLabelResponse.body,/route_not_found/);

  const health=edge.health();
  assert.equal(health.active_routes,1);

  const released=await edge.releaseRouteLease(lease.lease_id,'proof_complete');
  assert.equal(released.released,true);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.product-url-fabric.e2e-proof.v1',
    single_wildcard_edge_lease:true,
    public_hostname_preserved:true,
    admitted_product_root_served:true,
    admitted_product_machine_surfaces_served:true,
    unknown_product_fails_closed:true,
    multi_label_host_fails_closed:true,
    base44_required:false,
    external_dns_verified:false,
    public_certificate_trust_verified:false,
    proof_scope:'local_end_to_end_tls_edge_to_chum',
  },null,2));
}finally{
  if(edge) await edge.close();
  await chum.close();
  fs.rmSync(root,{recursive:true,force:true});
}
