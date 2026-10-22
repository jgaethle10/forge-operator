import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash,randomBytes } from 'node:crypto';
import { OwnedShipTransferGate } from './owned-transfer-gate.mjs';
import { createOwnedShipTransferServer } from './owned-transfer-http.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const owner='test-only-owner-operator-key';
async function harness(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'evercraft-ship-gateway-'));
 await chmod(root,0o700);
 const gate=await new OwnedShipTransferGate({root,operatorSecret:owner,encryptionKey:randomBytes(32)}).init();
 const server=createOwnedShipTransferServer(gate);
 await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/v1/ship/transfers';
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});});
 const request=async(url,options={})=>fetch(url,{...options,headers:{'x-evercraft-operator-key':owner,...options.headers}});
 return {base,gate,request};
}
test('HTTP loopback end-to-end exact bytes, encryption and truthful download response state',async t=>{
 const {base,request}=await harness(t);
 const bytes=randomBytes(2*1024*1024+23);
 const create=await request(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
  original_size:bytes.length,original_sha256:sha(bytes),recipient_ref:'recipient@example.test',
  authorization_ref:'approval-doc-456',ttl_ms:60000
 })});
 assert.equal(create.status,201);
 const {id}=await create.json();
 const upload=await request(base+'/'+id+'/upload',{method:'PUT',body:bytes});
 assert.equal(upload.status,200);
 assert.equal((await upload.json()).encrypted_storage,true);
 const grant=await request(base+'/'+id+'/grant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({authorization_ref:'approval-doc-456'})});
 assert.equal(grant.status,201);
 const issued=await grant.json();
 assert.equal(issued.delivery_state,'not_sent');
 const denied=await fetch(base+'/'+id+'/download',{headers:{authorization:'Bearer '+('0'.repeat(64))}});
 assert.equal(denied.status,403);
 const got=await fetch(base+'/'+id+'/download',{headers:{authorization:'Bearer '+issued.access_token}});
 assert.equal(got.status,200);
 assert.equal(got.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(Buffer.from(await got.arrayBuffer()),bytes);
 const status=await request(base+'/'+id+'/status');
 assert.equal(status.status,200);
 const st=await status.json();
 assert.equal(st.download_responses_completed,1);
 assert.equal(st.recipient_identity_verified,false);
 assert.equal(st.provider_delivery_verified,false);
 assert.equal(JSON.stringify(st).includes(issued.access_token),false);
 const revoke=await request(base+'/'+id+'/revoke',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({authorization_ref:'approval-doc-456'})});
 assert.equal(revoke.status,200);
 const after=await fetch(base+'/'+id+'/download',{headers:{authorization:'Bearer '+issued.access_token}});
 assert.equal(after.status,403);
});
test('unauthenticated operators cannot upload, create or inspect records',async t=>{
 const {base,request}=await harness(t);
 const bad=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
 assert.equal(bad.status,403);
 const result=await request(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
  original_size:1,original_sha256:sha(Buffer.from('a')),recipient_ref:'one@example.test',authorization_ref:'signed-approval',ttl_ms:60000
 })});
 const {id}=await result.json();
 assert.equal((await fetch(base+'/'+id+'/status')).status,403);
 assert.equal((await fetch(base+'/'+id+'/upload',{method:'PUT',body:Buffer.from('a')})).status,403);
 assert.equal((await request(base+'/'+id+'/upload',{method:'PUT',headers:{'content-length':'2'},body:Buffer.from('aa')})).status,400);
 assert.equal((await request(base+'/'+id+'/status')).status,200);
});
test('bounded JSON metadata and route errors fail closed without leaking internals',async t=>{
 const {base,request}=await harness(t);
 const invalid=await request(base,{method:'POST',headers:{'content-type':'application/json'},body:'not-json'});
 assert.equal(invalid.status,400);
 const large=await request(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({padding:'x'.repeat(10000)})});
 assert.equal(large.status,400);
 const missing=await request(base+'/not-an-id/status');
 assert.equal(missing.status,404);
});
