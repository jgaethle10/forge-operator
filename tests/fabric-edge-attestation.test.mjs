import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { loadOrCreateDeviceIdentity, createNodeAttestation, verifyNodeAttestation } from '../systemia/compute/device-identity.mjs';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';

test('public Fabric edge relays a nonce to local NodeSeed identity without exposing allocator authority',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fabric-edge-attestation-'));
  const nodeRoot=path.join(root,'node');
  const identity=loadOrCreateDeviceIdentity({root:nodeRoot,nodeId:'chromebook-proof'});
  const token='allocator-secret-proof';
  const tokenFile=path.join(root,'allocator-token');
  fs.writeFileSync(tokenFile,token+'\n',{mode:0o600});

  const nodeServer=http.createServer(async(req,res)=>{
    try{
      if(req.method!=='POST'||req.url!=='/v1/attest'){
        res.writeHead(404,{'content-type':'application/json'});
        return res.end(JSON.stringify({error:'not_found'}));
      }
      if(req.headers.authorization!=='Bearer '+token){
        res.writeHead(401,{'content-type':'application/json'});
        return res.end(JSON.stringify({error:'unauthorized'}));
      }
      const chunks=[]; for await(const chunk of req)chunks.push(chunk);
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
      const attestation=createNodeAttestation({
        identity,
        nonce:body.nonce,
        supportedWorkloads:['systemia.rivet-report-runtime.v1'],
        placementLabels:['personal-compute','public-edge'],
        processStartedAt:new Date().toISOString(),
        bootIdHash:'sha256:'+'b'.repeat(64),
      });
      res.writeHead(200,{'content-type':'application/json'});
      res.end(JSON.stringify({ok:true,attestation}));
    }catch(error){
      res.writeHead(500,{'content-type':'application/json'});
      res.end(JSON.stringify({error:String(error?.message||error)}));
    }
  });
  await new Promise((resolve,reject)=>{nodeServer.once('error',reject);nodeServer.listen(0,'127.0.0.1',resolve);});
  const addr=nodeServer.address();
  const nodeReceipt={
    schema:'evercraft.compute.nodeseed-receipt.v1',
    node_id:'chromebook-proof',
    device_fingerprint:identity.fingerprint,
    endpoint:'http://127.0.0.1:'+addr.port,
  };
  const receiptFile=path.join(root,'nodeseed-receipt.json');
  fs.writeFileSync(receiptFile,JSON.stringify(nodeReceipt));

  const fabric=await startFabricLocalRuntime({
    host:'127.0.0.1',
    port:0,
    nodeReceiptPath:receiptFile,
    allocatorTokenFile:tokenFile,
    catalog:[],
  });

  try{
    const health=await fetch(fabric.url+'/health').then(r=>r.json());
    assert.equal(health.edge_attestation_supported,true);
    assert.equal(health.edge_attestation_allocator_authority_exposed,false);

    const nonce='edge_'+('a'.repeat(36));
    const response=await fetch(fabric.url+'/.well-known/evercraft-edge-attestation',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({nonce}),
    });
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.ok,true);
    assert.equal(body.schema,'evercraft.operator-public-edge.attestation.v1');
    assert.equal(body.allocator_authority_exposed,false);
    assert.equal(body.allocator_authority_persisted,false);
    assert.equal(body.physical_field_claim,false);
    assert.equal(JSON.stringify(body).includes(token),false);

    const verified=verifyNodeAttestation({
      attestation:body.attestation,
      expectedNonce:nonce,
      expectedNodeId:'chromebook-proof',
      maxAgeMs:60000,
      now:new Date(),
    });
    assert.equal(verified.ok,true);
    assert.equal(verified.device_fingerprint,identity.fingerprint);
    assert.equal(verified.field_claim,false);
  }finally{
    await fabric.close();
    await new Promise(resolve=>nodeServer.close(()=>resolve()));
    fs.rmSync(root,{recursive:true,force:true});
  }
});
