import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {node002ShadowHttpHandler} from '../systemia/compute/node002-shadow-ingest.mjs';

test('HTTP receiver accepts a signed shadow heartbeat once and rejects replay',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const dir=mkdtempSync(join(tmpdir(),'evercraft-node002-http-'));
 const server=http.createServer(node002ShadowHttpHandler({
  registeredPublicKeyPem:publicKey.export({type:'spki',format:'pem'}),
  nonceDirectory:dir,
 }));
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const statement={
   schema:'evercraft.node002.signed-telemetry.v1',
   node_id:'evercraft-node002-nextgen',
   node_key:'personal:hp-nextgen:node-002:v1',
   device_fingerprint:'sha256:f3d8d3ac5f9e96bf234db821b43c1c72379d6c763b25c6edc7a23f506ac24eaa',
   nonce:'fedcba0987654321fedcba0987654321',
   observed_at_utc:new Date().toISOString(),
   sample:{memory_pct:35.5,uptime_seconds:1000},
  };
  const body=JSON.stringify({statement,signature:sign(null,Buffer.from(JSON.stringify(statement)),privateKey).toString('base64')});
  const send=()=>fetch(origin,{method:'POST',headers:{'content-type':'application/json'},body});
  const first=await send();
  assert.equal(first.status,200);
  const ack=await first.json();
  assert.equal(ack.schema,'evercraft.node002.shadow-ack.v1');
  assert.equal(ack.execution_authorized,false);
  assert.equal(ack.lease_created,false);
  const again=await send();
  assert.equal(again.status,403);
  assert.equal((await again.json()).reason,'nonce_replayed');
  const get=await fetch(origin);
  assert.equal(get.status,405);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  rmSync(dir,{recursive:true,force:true});
 }
});
