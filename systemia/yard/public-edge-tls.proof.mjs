import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { inspectPublicEdgeTls } from '../network/public-edge-tls.mjs';
import { startPublicEdgeRuntime } from '../network/public-edge-runtime.mjs';

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

async function startUpstream(){
  const server=http.createServer((req,res)=>{
    const body=JSON.stringify({
      ok:true,
      service:'tls-proof-upstream',
      path:req.url,
      host:req.headers.host,
    });
    res.writeHead(200,{'content-type':'application/json','content-length':Buffer.byteLength(body)});
    res.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const address=server.address();
  return {
    origin:`http://127.0.0.1:${address.port}`,
    close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())),
  };
}

async function httpsJsonThroughLocalAddress(origin){
  const target=new URL(origin);
  return await new Promise((resolve,reject)=>{
    const req=https.request({
      hostname:'127.0.0.1',
      port:Number(target.port||443),
      path:'/health',
      method:'GET',
      servername:target.hostname,
      headers:{host:target.host},
      rejectUnauthorized:false,
    },(res)=>{
      const chunks=[];
      res.on('data',chunk=>chunks.push(chunk));
      res.on('end',()=>{
        try{
          resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))});
        }catch(error){reject(error);}
      });
    });
    req.on('error',reject);
    req.end();
  });
}

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-public-edge-tls-proof-'));
const key=path.join(root,'wildcard.key.pem');
const cert=path.join(root,'wildcard.cert.pem');
const domain='edge.evercraft.test';
const upstream=await startUpstream();
let edge=null;

try{
  execFileSync('openssl',[
    'req','-x509','-newkey','rsa:2048','-nodes',
    '-keyout',key,
    '-out',cert,
    '-days','10',
    '-subj',`/CN=*.${domain}`,
    '-addext',`subjectAltName=DNS:*.${domain}`,
  ],{stdio:'ignore'});

  const admission=inspectPublicEdgeTls({
    baseDomain:domain,
    tlsKeyPath:key,
    tlsCertPath:cert,
    minValidityMs:24*60*60*1000,
  });
  assert.equal(admission.ready,true);
  assert.equal(admission.base_domain,domain);
  assert.equal(admission.private_key_exposed,false);
  assert.equal(admission.certificate_bytes_exposed,false);
  assert.ok(admission.hostname_match);

  assert.throws(
    ()=>inspectPublicEdgeTls({
      baseDomain:'wrong.evercraft.test',
      tlsKeyPath:key,
      tlsCertPath:cert,
      minValidityMs:24*60*60*1000,
    }),
    /does_not_cover_wildcard_domain/
  );

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

  const edgeHealth=await fetch(edge.controlUrl+'/health').then(r=>r.json());
  assert.equal(edgeHealth.ok,true);
  assert.equal(edgeHealth.public_https,true);
  assert.equal(edgeHealth.public_listen_port,publicPort);
  assert.equal(edgeHealth.tls_admission.base_domain,domain);

  const lease=await fetch(edge.controlUrl+'/v1/public-route/leases',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      deployment_id:'tls-proof-specialist',
      deployment_receipt_hash:'sha256:'+'a'.repeat(64),
      instance_id:'tls-proof-instance',
      upstream_origin:upstream.origin,
      requested_hostname:'ibmi-rescue',
      requested_ttl_ms:120000,
    }),
  }).then(async r=>{
    const body=await r.json();
    if(!r.ok) throw new Error(JSON.stringify(body));
    return body;
  });

  assert.equal(lease.protocol,'evercraft.public-route.v1');
  assert.match(lease.origin,new RegExp('^https://ibmi-rescue-[a-f0-9]{10}\\.'+domain.replace(/\./g,'\\.')+':'+publicPort+'$'));
  assert.ok(lease.hostname.endsWith('.'+domain));

  const proxied=await httpsJsonThroughLocalAddress(lease.origin);
  assert.equal(proxied.status,200);
  assert.equal(proxied.body.ok,true);
  assert.equal(proxied.body.service,'tls-proof-upstream');
  assert.equal(proxied.body.path,'/health');

  const released=await fetch(
    edge.controlUrl+'/v1/public-route/leases/'+encodeURIComponent(lease.lease_id)+'/release',
    {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({reason:'proof_complete'}),
    }
  ).then(r=>r.json());
  assert.equal(released.released,true);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.public-edge.tls-proof.v1',
    wildcard_certificate_admission:true,
    certificate_hostname_match:true,
    https_listener_started:true,
    hostname_routing_proven:true,
    route_lease_release_proven:true,
    private_key_exposed:false,
    external_dns_verified:false,
    public_certificate_trust_verified:false,
    proof_scope:'local_tls_listener',
  },null,2));
} finally {
  if(edge) await edge.close();
  await upstream.close();
  fs.rmSync(root,{recursive:true,force:true});
}
