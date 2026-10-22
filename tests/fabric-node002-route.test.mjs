import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';

test('full Fabric runtime admits shadow-only signed Node002 telemetry, rejects replay, keeps public health',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fabric-node002-route-'));
 const nonceDir=path.join(root,'nonces');
 fs.mkdirSync(nonceDir,{mode:0o700});
 const keyFile=path.join(root,'nextgen-public.pem');
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 fs.writeFileSync(keyFile,publicKey.export({format:'pem',type:'spki'}),{mode:0o600});
 const savedKey=process.env.EVERCRAFT_NODE002_PUBLIC_KEY_FILE;
 const savedNonce=process.env.EVERCRAFT_NODE002_NONCE_DIR;
 process.env.EVERCRAFT_NODE002_PUBLIC_KEY_FILE=keyFile;
 process.env.EVERCRAFT_NODE002_NONCE_DIR=nonceDir;
 let runtime;
 try{
   runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[]});
   const s={
     schema:'evercraft.node002.signed-telemetry.v1',
     node_id:'evercraft-node002-nextgen',
     node_key:'personal:hp-nextgen:node-002:v1',
     device_fingerprint:'sha256:f3d8d3ac5f9e96bf234db821b43c1c72379d6c763b25c6edc7a23f506ac24eaa',
     nonce:'11111111222222223333333344444444',
     observed_at_utc:new Date().toISOString(),
     sample:{memory_pct:20,uptime_seconds:1000},
   };
   const body=JSON.stringify({statement:s,signature:sign(null,Buffer.from(JSON.stringify(s)),privateKey).toString('base64')});
   const send=()=>fetch(runtime.url+'/api/node002/shadow-telemetry',{method:'POST',headers:{'content-type':'application/json'},body});
   const accepted=await send();
   assert.equal(accepted.status,200);
   const ack=await accepted.json();
   assert.equal(ack.ok,true);
   assert.equal(ack.schema,'evercraft.node002.shadow-ack.v1');
   assert.equal(ack.shadow,true);
   assert.equal(ack.execution_authorized,false);
   assert.equal(ack.lease_created,false);
   assert.ok(ack.sample_key);
   const replay=await send();
   assert.equal(replay.status,403);
   assert.equal((await replay.json()).reason,'nonce_replayed');
   const health=await fetch(runtime.url+'/health');
   assert.equal(health.status,200);
 }finally{
   if(runtime) await runtime.close();
   if(savedKey===undefined) delete process.env.EVERCRAFT_NODE002_PUBLIC_KEY_FILE;
   else process.env.EVERCRAFT_NODE002_PUBLIC_KEY_FILE=savedKey;
   if(savedNonce===undefined) delete process.env.EVERCRAFT_NODE002_NONCE_DIR;
   else process.env.EVERCRAFT_NODE002_NONCE_DIR=savedNonce;
   fs.rmSync(root,{recursive:true,force:true});
 }
});
