import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyPrivateMediaImport, SCHEMA } from './verify-harbor-private-media-import.mjs';

const jpeg=Buffer.from([0xff,0xd8,0xff,0xe0,0,0,0,0,0,0]);
async function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harbor-import-'));
  const assets=path.join(dir,'assets');fs.mkdirSync(assets);
  const name='source-001.jpg';
  fs.writeFileSync(path.join(assets,name),jpeg);
  const sha=crypto.createHash('sha256').update(jpeg).digest('hex');
  const m={schema:SCHEMA,assets:[{filename:name,sha256:sha,bytes:jpeg.length,mediaType:'image/jpeg'}]};
  const manifestPath=path.join(dir,'private-manifest.json');
  fs.writeFileSync(manifestPath,JSON.stringify(m));
  return {dir,assets,manifestPath,name,m};
}
async function withFixture(fn){const f=await fixture();try{await fn(f)}finally{fs.rmSync(f.dir,{recursive:true,force:true})}}
async function rejectsMutation(mutator,error){
  await withFixture(async f=>{
    await mutator(f);
    await assert.rejects(
      verifyPrivateMediaImport({manifestPath:f.manifestPath,assetDir:f.assets,operatorRef:'human-operator',expectedCount:1}),
      new RegExp(error));
  });
}
const writeManifest=f=>fs.writeFileSync(f.manifestPath,JSON.stringify(f.m));
test('receiving host rehashes manifest bytes but does not authorize production',async()=>withFixture(async f=>{
  const r=await verifyPrivateMediaImport({manifestPath:f.manifestPath,assetDir:f.assets,operatorRef:'human-operator',expectedCount:1});
  assert.equal(r.state,'BYTES_REVERIFIED_ONLY');
  assert.equal(r.assetCount,1);
  assert.equal(r.boundaries.fallenProductionAccepted,false);
  assert.equal(r.boundaries.customerPreviewReleaseAllowed,false);
  assert.equal(r.assets[0].sha256,f.m.assets[0].sha256);
}));
test('denies wrong sha',()=>rejectsMutation(f=>{f.m.assets[0].sha256='0'.repeat(64);writeManifest(f)},'digest_mismatch'));
test('denies wrong byte count',()=>rejectsMutation(f=>{f.m.assets[0].bytes=100;writeManifest(f)},'asset_size'));
test('denies fake media label',()=>rejectsMutation(f=>{f.m.assets[0].mediaType='image/png';writeManifest(f)},'media_signature_mismatch'));
test('denies unsafe filename',()=>rejectsMutation(f=>{f.m.assets[0].filename='../source-001.jpg';writeManifest(f)},'unsafe_filename'));
test('denies symlinked asset',()=>rejectsMutation(f=>{fs.rmSync(path.join(f.assets,f.name));fs.symlinkSync(f.manifestPath,path.join(f.assets,f.name))},'asset_not_regular'));
test('denies extras',()=>rejectsMutation(f=>{fs.writeFileSync(path.join(f.assets,'unexpected'),'extra')},'directory_extra_or_missing_files'));
test('denies extra declared records',()=>rejectsMutation(f=>{f.m.assets.push({...f.m.assets[0],filename:'extra.jpg'});writeManifest(f)},'manifest_count_or_schema'));
test('denies missing operator',()=>withFixture(async f=>{await assert.rejects(verifyPrivateMediaImport({manifestPath:f.manifestPath,assetDir:f.assets,operatorRef:'',expectedCount:1}),/operator_missing/)}));
test('denies symlinked manifest',()=>withFixture(async f=>{
 const link=path.join(f.dir,'manifest-link');fs.symlinkSync(f.manifestPath,link);
 await assert.rejects(verifyPrivateMediaImport({manifestPath:link,assetDir:f.assets,operatorRef:'human-operator',expectedCount:1}),/manifest_not_regular/);
}));
