import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  inspectForensiScopeParcel,validateForensiScopeParcelManifest
} from './forensiscope-parcel-bridge.mjs';

const MiB=1024*1024;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(){
  const directory=await mkdtemp(path.join(os.tmpdir(),'evercraft-ship-bridge-'));
  const original=Buffer.alloc(8*MiB+31,0x6e);
  original[0]=91;original[original.length-1]=27;
  const sha=digest(original),id=sha.slice(0,16),size=8*MiB;
  const parts=[];
  for(let i=0;i<2;i++){
    const bytes=original.subarray(i*size,(i+1)*size);
    const name='ec-'+id+'-part-'+String(i+1).padStart(5,'0')+'.bin';
    await writeFile(path.join(directory,name),bytes);
    parts.push({name,size:bytes.length,sha256:digest(bytes)});
  }
  const manifest={format:'evercraft-parcel-large-v0.2',parcel_id:id,
    original_name:'Inspection.mov',original_size:original.length,
    original_sha256:sha,max_part_bytes:size,parts};
  const manifest_filename='ec-'+id+'-manifest.json';
  await writeFile(path.join(directory,manifest_filename),JSON.stringify(manifest));
  return {directory,manifest,manifest_filename,original};
}
async function withFixture(fn){const x=await fixture();try{return await fn(x);}finally{await rm(x.directory,{recursive:true,force:true});}}
test('exact-byte parcel becomes local VERIFIED, never SENT',()=>withFixture(async x=>{
 const r=await inspectForensiScopeParcel({directory:x.directory,manifest_filename:x.manifest_filename});
 assert.equal(r.state,'local_parcel_bytes_verified');
 assert.equal(r.original_sha256,'sha256:'+digest(x.original));
 assert.equal(r.part_count,2);
 assert.equal(r.trusted_source_anchor_verified,false);
 assert.equal(r.delivery_state,'not_verified');
 assert.equal(r.provider_send_performed,false);
 assert.equal(r.dispatch_authorized,false);
 assert.equal(r.recipient_open_verified,false);
}));
test('trusted anchor is explicit and must match',()=>withFixture(async x=>{
 const r=await inspectForensiScopeParcel({directory:x.directory,manifest_filename:x.manifest_filename,trusted_source_sha256:x.manifest.original_sha256});
 assert.equal(r.trusted_source_anchor_verified,true);
 await assert.rejects(inspectForensiScopeParcel({directory:x.directory,manifest_filename:x.manifest_filename,trusted_source_sha256:'a'.repeat(64)}),/trusted_source_hash_mismatch/);
}));
test('swapped bytes fail instead of admitting shipment',()=>withFixture(async x=>{
 const name=x.manifest.parts[0].name;
 const data=await readFile(path.join(x.directory,name));data[0]^=255;
 await writeFile(path.join(x.directory,name),data);
 await assert.rejects(inspectForensiScopeParcel(x),/part_digest_mismatch/);
}));
test('wrong manifest name and unexpected content fail closed',()=>withFixture(async x=>{
 await assert.rejects(inspectForensiScopeParcel({...x,manifest_filename:'../evil.json'}),/invalid_manifest_filename/);
 await writeFile(path.join(x.directory,'secret.txt'),'unrecognized data');
 await assert.rejects(inspectForensiScopeParcel(x),/unexpected_directory_entry/);
}));
test('symlink piece fails admission',()=>withFixture(async x=>{
 const name=x.manifest.parts[0].name;
 await rm(path.join(x.directory,name));
 await symlink(path.join(x.directory,x.manifest.parts[1].name),path.join(x.directory,name));
 await assert.rejects(inspectForensiScopeParcel(x),/file_not_regular/);
}));
test('path traversal and forged hashes are rejected before files are opened',()=>{
 const x={format:'evercraft-parcel-large-v0.2',parcel_id:'a'.repeat(16),original_name:'../evil',original_size:0,
  original_sha256:'a'.repeat(64),max_part_bytes:8*MiB,parts:[]};
 assert.throws(()=>validateForensiScopeParcelManifest(x),/unsupported_manifest/);
 assert.throws(()=>validateForensiScopeParcelManifest({...x,original_name:'safe.bin',original_size:1}),/invalid_part_count/);
 assert.throws(()=>validateForensiScopeParcelManifest({...x,original_name:'safe.bin',original_size:0,parts:[{name:'../other',size:0,sha256:'a'.repeat(64)}]}),/invalid_part_count/);
});
test('mutated manifest fails before shipment',()=>withFixture(async x=>{
 const altered={...x.manifest,original_size:x.manifest.original_size+1};
 await writeFile(path.join(x.directory,x.manifest_filename),JSON.stringify(altered));
 await assert.rejects(inspectForensiScopeParcel(x),/invalid_part_metadata/);
}));
