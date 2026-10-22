import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { randomBytes,createHash } from 'node:crypto';
import {OwnedShipTransferGate} from './owned-transfer-gate.mjs';

const digest=b=>createHash('sha256').update(b).digest('hex');
const now={value:1000000000};
async function pilot(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'evercraft-ship-link-'));
 await import('node:fs/promises').then(fs=>fs.chmod(root,0o700));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const gate=await new OwnedShipTransferGate({root,operatorSecret:'test-only-operator-secret',
  encryptionKey:Buffer.from('0123456789abcdef'.repeat(4),'hex'),now:()=>now.value}).init();
 return {gate,root};
}
async function *blocks(buffer,step){for(let i=0;i<buffer.length;i+=step)yield buffer.subarray(i,i+step);}
const request=(bytes,overrides={})=>({
 original_size:bytes.length,original_sha256:digest(bytes),
 recipient_ref:'customer@example.test',authorization_ref:'owner-approved-20261021',ttl_ms:3600000,...overrides
});
test('12 MiB+3 file encrypted at rest and delivered as exact streamed bytes, without identity claims',async t=>{
 now.value=1000000000;const {gate,root}=await pilot(t);
 const data=randomBytes(12*1024*1024+3);
 const {id}=await gate.create(request(data));
 await assert.rejects(()=>gate.issue(id,'owner-approved-20261021'),/grant_not_authorized/);
 const uploaded=await gate.upload(id,blocks(data,1024*1024));
 assert.equal(uploaded.state,'source_verified');
 assert.equal(uploaded.encrypted_storage,true);
 const stored=await readFile(path.join(root,id+'.enc'));
 assert.equal(stored.length,data.length);assert.equal(Buffer.compare(stored,data)===0,false);
 const {access_token,delivery_state}=await gate.issue(id,'owner-approved-20261021');
 assert.equal(delivery_state,'not_sent');
 const chunks=[];let completed=false;
 const receipt=await gate.download(id,access_token,{write:async b=>{chunks.push(Buffer.from(b));},finish:async()=>{completed=true;}});
 assert.equal(Buffer.compare(Buffer.concat(chunks),data),0);
 assert.equal(receipt.download_response_completed,true);
 assert.equal(receipt.recipient_identity_verified,false);
 assert.equal(receipt.sender_delivery_proven,false);
 assert.equal(completed,true);
 const state=await gate.status(id);
 assert.equal(state.download_responses_completed,1);
 assert.equal(state.recipient_identity_verified,false);
 assert.equal(JSON.stringify(state).includes(access_token),false);
});
test('wrong token, wrong approval and expired grants cannot download',async t=>{
 now.value=1000000000;const {gate}=await pilot(t);
 const data=Buffer.from('private sample');
 const {id}=await gate.create(request(data,{ttl_ms:60000}));
 await gate.upload(id,blocks(data,5));
 await assert.rejects(()=>gate.issue(id,'wrong-approval'),/grant_not_authorized/);
 const {access_token}=await gate.issue(id,'owner-approved-20261021');
 await assert.rejects(()=>gate.download(id,'f'.repeat(64),{write:async()=>{},finish:async()=>{}}),/recipient_access_denied/);
 now.value+=60001;
 await assert.rejects(()=>gate.download(id,access_token,{write:async()=>{},finish:async()=>{}}),/recipient_access_denied/);
});
test('revocation blocks future downloads without falsely recalling completed responses',async t=>{
 now.value=1000000000;const {gate}=await pilot(t);
 const data=Buffer.from('important bytes');
 const {id}=await gate.create(request(data));await gate.upload(id,blocks(data,5));
 const {access_token}=await gate.issue(id,'owner-approved-20261021');
 await assert.rejects(()=>gate.revoke(id,'wrong'),/revoke_not_authorized/);
 const revoked=await gate.revoke(id,'owner-approved-20261021');
 assert.equal(revoked.future_access_blocked,true);
 assert.equal(revoked.in_flight_downloads_not_recalled,true);
 await assert.rejects(()=>gate.download(id,access_token,{write:async()=>{},finish:async()=>{}}),/recipient_access_denied/);
});
test('tampered ciphertext refuses disclosure before first plaintext byte',async t=>{
 now.value=1000000000;const {gate,root}=await pilot(t);
 const data=Buffer.from('confidential evidence parcel');
 const {id}=await gate.create(request(data));await gate.upload(id,blocks(data,4));
 const {access_token}=await gate.issue(id,'owner-approved-20261021');
 const encrypted=await readFile(path.join(root,id+'.enc'));encrypted[0]^=0xff;
 await writeFile(path.join(root,id+'.enc'),encrypted);
 let bytes=0;
 await assert.rejects(()=>gate.download(id,access_token,{write:async b=>{bytes+=b.length;},finish:async()=>{}}));
 assert.equal(bytes,0);
 assert.equal((await gate.status(id)).download_responses_completed,0);
});
test('invalid source or oversize aborts without a usable grant',async t=>{
 now.value=1000000000;const {gate,root}=await pilot(t);
 const data=Buffer.from('test me');
 const {id}=await gate.create(request(data));
 await assert.rejects(()=>gate.upload(id,blocks(Buffer.from('different'),3)),/upload_exceeds_reserved_size/);
 assert.equal((await gate.status(id)).state,'reserved');
 await assert.rejects(()=>gate.issue(id,'owner-approved-20261021'),/grant_not_authorized/);
 const remaining=await (await import('node:fs/promises')).readdir(root);assert.equal(remaining.some(x=>x.endsWith('.enc')),false);
 await assert.rejects(()=>gate.create(request(data,{original_size:512*1024*1024+1})),/invalid_transfer_request/);
 await assert.rejects(()=>gate.create(request(data,{authorization_ref:''})),/invalid_transfer_request/);
});
test('metadata and encrypted payload persist across vault restart',async t=>{
 now.value=1000000000;const {gate,root}=await pilot(t);
 const data=Buffer.from('can we restart without losing bytes');
 const {id}=await gate.create(request(data));await gate.upload(id,blocks(data,9));
 const token=(await gate.issue(id,'owner-approved-20261021')).access_token;
 const restarted=await new OwnedShipTransferGate({root,operatorSecret:'test-only-operator-secret',
  encryptionKey:Buffer.from('0123456789abcdef'.repeat(4),'hex'),now:()=>now.value}).init();
 let recovered=Buffer.alloc(0);
 await restarted.download(id,token,{write:async b=>{recovered=Buffer.concat([recovered,b]);},finish:async()=>{}});
 assert.deepEqual(recovered,data);
 assert.equal((await restarted.status(id)).download_responses_completed,1);
});
