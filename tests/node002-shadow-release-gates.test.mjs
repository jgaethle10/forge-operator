import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {node002ShadowHttpHandler} from '../systemia/compute/node002-shadow-ingest.mjs';

const fingerprint='sha256:f3d8d3ac5f9e96bf234db821b43c1c72379d6c763b25c6edc7a23f506ac24eaa';
const statement=()=>({
 schema:'evercraft.node002.signed-telemetry.v1',
 node_id:'evercraft-node002-nextgen',
 node_key:'personal:hp-nextgen:node-002:v1',
 device_fingerprint:fingerprint,
 nonce:'abcdabcdabcdabcdabcdabcdabcdabcd',
 observed_at_utc:new Date().toISOString(),
 sample:{memory_pct:42,uptime_seconds:1234},
});
async function withServer(options,fn){
 const server=http.createServer(node002ShadowHttpHandler(options));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{return await fn('http://127.0.0.1:'+server.address().port)}
 finally{await new Promise(resolve=>server.close(resolve))}
}
test('simultaneous replay permits exactly one accepted receipt',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'node002-concurrent-'));
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 try{
  const s=statement();
  const body=JSON.stringify({statement:s,signature:sign(null,Buffer.from(JSON.stringify(s)),privateKey).toString('base64')});
  await withServer({registeredPublicKeyPem:publicKey.export({type:'spki',format:'pem'}),nonceDirectory:dir},async url=>{
   const responses=await Promise.all(Array.from({length:12},()=>fetch(url,{method:'POST',headers:{'content-type':'application/json'},body})));
   assert.equal(responses.filter(r=>r.status===200).length,1);
   assert.equal(responses.filter(r=>r.status===403).length,11);
   for(const r of responses.filter(r=>r.status===403)){
    assert.equal((await r.json()).reason,'nonce_replayed');
   }
  });
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('nonce persistence survives a new receiver instance',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'node002-persist-'));
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const options={registeredPublicKeyPem:publicKey.export({type:'spki',format:'pem'}),nonceDirectory:dir};
 const s=statement();
 const body=JSON.stringify({statement:s,signature:sign(null,Buffer.from(JSON.stringify(s)),privateKey).toString('base64')});
 const send=url=>fetch(url,{method:'POST',headers:{'content-type':'application/json'},body});
 try{
  await withServer(options,async url=>assert.equal((await send(url)).status,200));
  await withServer(options,async url=>assert.equal((await send(url)).status,403));
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('missing receiver configuration returns 503 not success',async()=>{
 await withServer({},async url=>{
  const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(r.status,503);
  assert.equal((await r.json()).reason,'receiver_not_configured');
 });
});
test('oversized request is rejected without admission',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'node002-limit-'));
 const {publicKey}=generateKeyPairSync('ed25519');
 try{
  await withServer({registeredPublicKeyPem:publicKey.export({type:'spki',format:'pem'}),nonceDirectory:dir},async url=>{
   const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({junk:'x'.repeat(5000)})});
   assert.equal(r.status,413);
  });
 }finally{rmSync(dir,{recursive:true,force:true})}
});
