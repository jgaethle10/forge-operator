import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {openCreatorMediaStore} from './creator-media-store.mjs';

const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.from('synthetic-private-asset-content')]);
const webm=Buffer.concat([Buffer.from('1a45dfa3','hex'),Buffer.from('synthetic-webm')]);
const mp4=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.from('synthetic-mp4')]);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const owner={tenant_ref:'tenant:home',creator_ref:'creator:one'};
async function setup(t,max_bytes){
  const root=await mkdtemp(path.join(os.tmpdir(),'home-media-store-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  return {root,store:openCreatorMediaStore({root,...(max_bytes?{max_bytes}:{})})};
}
test('private bytes get a stable content hash and survive reopening the store',async t=>{
 const {root,store}=await setup(t);
 const receipt=await store.ingest({...owner,bytes:png,declared_mime:'image/png'});
 assert.equal(receipt.asset_ref,'asset:sha256:'+digest(png));
 assert.equal(receipt.byte_count,png.length);
 assert.equal(receipt.detected_mime,'image/png');
 assert.equal(receipt.public_url,null);assert.equal(receipt.malware_scanned,false);
 assert.equal(receipt.published,false);assert.equal(receipt.payout_authority,false);
 const recovered=await openCreatorMediaStore({root}).verify({...owner,asset_ref:receipt.asset_ref});
 assert.deepEqual(recovered,receipt);
});
test('streamed MP4 chunks are bound to their actual SHA-256',async t=>{
 const {store}=await setup(t);
 async function* chunks(){yield mp4.subarray(0,5);yield mp4.subarray(5,12);yield mp4.subarray(12);}
 const receipt=await store.ingest({...owner,bytes:chunks(),declared_mime:'video/mp4'});
 assert.equal(receipt.content_sha256,digest(mp4));assert.equal(receipt.detected_mime,'video/mp4');
});
test('streamed WebM and JPEG magic signatures are recognized',async t=>{
 const {store}=await setup(t);
 const a=await store.ingest({...owner,bytes:webm,declared_mime:'video/webm'});
 const b=await store.ingest({...owner,bytes:Buffer.concat([Buffer.from('ffd8ffe0','hex'),Buffer.alloc(20)]),declared_mime:'image/jpeg'});
 assert.equal(a.detected_mime,'video/webm');assert.equal(b.detected_mime,'image/jpeg');
});
test('same content is deduplicated for the same creator without widening its scope',async t=>{
 const {store}=await setup(t);
 const a=await store.ingest({...owner,bytes:png}),b=await store.ingest({...owner,bytes:png});
 assert.deepEqual(a,b);
 await assert.rejects(store.verify({...owner,creator_ref:'creator:two',asset_ref:a.asset_ref}),/media_asset_missing/);
 await assert.rejects(store.verify({...owner,tenant_ref:'tenant:other',asset_ref:a.asset_ref}),/media_asset_missing/);
});
test('claimed media type cannot override detected bytes',async t=>{
 const {store}=await setup(t);
 await assert.rejects(store.ingest({...owner,bytes:png,declared_mime:'video/mp4'}),/media_type_mismatch/);
 await assert.rejects(store.ingest({...owner,bytes:png,declared_mime:'text/html'}),/media_declared_type_invalid/);
});
test('unsupported text and executable bytes are rejected',async t=>{
 const {store}=await setup(t);
 await assert.rejects(store.ingest({...owner,bytes:Buffer.from('<script>alert(1)</script>')}),/media_type_mismatch/);
 await assert.rejects(store.ingest({...owner,bytes:Buffer.from('4d5a9000030000000000000000000000','hex')}),/media_type_mismatch/);
});
test('bounded intake rejects oversized content and removes pending temp file',async t=>{
 const {root,store}=await setup(t,32);
 const large=Buffer.concat([png,Buffer.alloc(33)]);
 await assert.rejects(store.ingest({...owner,bytes:large}),/media_limit_exceeded/);
 const tenantFolders=await readdir(root);assert.equal(tenantFolders.length,1);
 const creatorFolders=await readdir(path.join(root,tenantFolders[0]));
 const files=await readdir(path.join(root,tenantFolders[0],creatorFolders[0]));
 assert.deepEqual(files,[]);
});
test('invalid or empty inputs reject before any receipt',async t=>{
 const {store}=await setup(t);
 await assert.rejects(store.ingest({...owner,bytes:'not bytes'}),/media_bytes_required/);
 await assert.rejects(store.ingest({...owner,bytes:Buffer.alloc(0)}),/media_empty_or_truncated/);
 await assert.rejects(store.ingest({...owner,bytes:Buffer.from('89504e470d0a1a0a','hex')}),/media_empty_or_truncated/);
 await assert.rejects(store.ingest({...owner,bytes:[png]}),/media_bytes_required/);
});
test('malformed creator, tenant and asset references fail closed',async t=>{
 const {store}=await setup(t);
 await assert.rejects(store.ingest({...owner,creator_ref:'../<bad>',bytes:png}),/media_creator_ref_invalid/);
 await assert.rejects(store.ingest({...owner,tenant_ref:'tenant with spaces',bytes:png}),/media_tenant_ref_invalid/);
 await assert.rejects(store.verify({...owner,asset_ref:'asset:sha256:incorrect'}),/media_asset_ref_invalid/);
});
test('modified persisted media is detected on verification',async t=>{
 const {root,store}=await setup(t);
 const r=await store.ingest({...owner,bytes:png});
 const a=(await readdir(root))[0],b=(await readdir(path.join(root,a)))[0];
 const p=path.join(root,a,b,digest(png)+'.bin');
 await writeFile(p,Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.from('tampered-content-is-not-original')]));
 await assert.rejects(store.verify({...owner,asset_ref:r.asset_ref}),/media_integrity_invalid/);
});
test('two simultaneous same-content uploads have one durable identity',async t=>{
 const {store}=await setup(t);
 const r=await Promise.all([store.ingest({...owner,bytes:png}),store.ingest({...owner,bytes:png})]);
 assert.deepEqual(r[0],r[1]);
});
test('invalid store roots and unsafe limits are refused',()=>{
 assert.throws(()=>openCreatorMediaStore({root:'relative'}),/media_absolute_root_required/);
 assert.throws(()=>openCreatorMediaStore({root:'/tmp/test',max_bytes:12}),/media_limit_invalid/);
});
