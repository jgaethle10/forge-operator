import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyGemsPrivateDataset} from './private-dataset-integrity.mjs';
const id='gems-data-private-fixture-001';
const sha=s=>createHash('sha256').update(s).digest('hex');
const names={features:'features.tif',faults:'faults.tif',submission_template:'template.tif'};
function fixture(run){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-private-dataset-'));
 fs.chmodSync(root,0o700);
 const files={};
 for(const [role,name] of Object.entries(names)){
  const bytes=Buffer.from('synthetic GeoTIFF placeholder '+role);
  fs.writeFileSync(path.join(root,name),bytes);
  files[role]={name,sha256:sha(bytes)};
 }
 const record={dataset_id:id,source:'trusted_private_dataset_registry',
  root_dir:root,files};
 return Promise.resolve().then(()=>run(root,record)).finally(
  ()=>fs.rmSync(root,{recursive:true,force:true}));
}
test('fixed private registry files produce a path-free hashed integrity receipt',()=>fixture(async(root,registryRecord)=>{
 const r=await verifyGemsPrivateDataset({datasetId:id,registryRecord});
 assert.equal(r.state,'verified_read_only');assert.equal(r.verified,true);
 assert.equal(r.file_evidence.length,3);
 assert.equal(r.paths_in_receipt,false);
 assert.equal(r.worker_invoked,false);
 assert.equal(r.network_called,false);
 assert.equal(JSON.stringify(r).includes(root),false);
 const {receipt_sha256,...body}=r;
 assert.equal(receipt_sha256,sha(JSON.stringify(body)));
}));
test('changed bytes, missing required role and symlinked file fail closed',()=>fixture(async(root,registryRecord)=>{
 fs.appendFileSync(path.join(root,names.features),'bad');
 assert.equal((await verifyGemsPrivateDataset({datasetId:id,registryRecord})).reason,'dataset_hash_mismatch');
 const altered={...registryRecord,files:{...registryRecord.files}};
 delete altered.files.faults;
 assert.equal((await verifyGemsPrivateDataset({datasetId:id,registryRecord:altered})).state,'held');
 fs.unlinkSync(path.join(root,names.features));
 fs.symlinkSync('/etc/hosts',path.join(root,names.features));
 assert.equal((await verifyGemsPrivateDataset({datasetId:id,registryRecord})).state,'held');
}));
test('untrusted registry, unsafe path, oversize and wrong dataset id are denied',()=>fixture(async(root,record)=>{
 for(const altered of [
  {...record,source:'user_supplied'},
  {...record,files:{...record.files,features:{name:'../../secrets.tif',sha256:record.files.features.sha256}}},
  {...record,files:{...record.files,features:{name:'features.tif',sha256:'0'.repeat(64)}}}
 ]){
  assert.equal((await verifyGemsPrivateDataset({datasetId:id,registryRecord:altered})).state,'held');
 }
 assert.equal((await verifyGemsPrivateDataset({datasetId:'../bad',registryRecord:record})).state,'held');
 assert.equal((await verifyGemsPrivateDataset({datasetId:id,registryRecord:record,maxBytesPerFile:2})).state,'held');
}));
test('symlinked registry root and world-writable directory cannot pass',()=>fixture(async(root,record)=>{
 const symlink=root+'-alias';fs.symlinkSync(root,symlink);
 try{
  assert.equal((await verifyGemsPrivateDataset({datasetId:id,
   registryRecord:{...record,root_dir:symlink}})).state,'held');
 }finally{fs.unlinkSync(symlink)}
 fs.chmodSync(root,0o777);
 assert.equal((await verifyGemsPrivateDataset({datasetId:id,registryRecord:record})).state,'held');
}));
