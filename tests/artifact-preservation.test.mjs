import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {preserveArtifact,localFixtureAdapter,PRESERVATION_SCHEMA} from '../scripts/artifact-preservation.mjs';
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'ec-preserve-test-'));
function setup(){const dir=tmp();const src=path.join(dir,'sample.zip');fs.writeFileSync(src,Buffer.from([1,2,3,4,255]));return {dir,src,ledger:path.join(dir,'ledger'),vault:path.join(dir,'vault')};}
const cleanup=dir=>fs.rmSync(dir,{recursive:true,force:true});

test('explicit local fixture adapter performs copy-readback and leaves an auditable ledger',async()=>{
 const f=setup();try{const r=await preserveArtifact({source:f.src,project:'lightforge',version:'rc04',adapter:localFixtureAdapter(f.vault),custodyDir:f.ledger});
 assert.equal(r.schema,PRESERVATION_SCHEMA);assert.equal(r.state,'byte_verified');assert.equal(r.backup_roundtrip_attested,false);
 assert.equal(r.provider_authentication,'not_independently_attested');assert.equal(r.device_install,'unverified');
 assert.deepEqual(fs.readdirSync(r.receipt_directory),['00-preflight.json','01-upload.json','02-roundtrip.json']);
 const receipt=JSON.parse(fs.readFileSync(path.join(r.receipt_directory,'02-roundtrip.json'),'utf8'));
 assert.equal(receipt.state,'byte_verified');assert.equal(receipt.publication,'unverified');
 }finally{cleanup(f.dir);}
});

test('missing adapter is not silently replaced with local or cloud storage',async()=>{const f=setup();try{await assert.rejects(preserveArtifact({source:f.src,project:'abc',version:'v1',custodyDir:f.ledger}),/adapter required/);}finally{cleanup(f.dir)}});
test('invalid project and version are blocked',async()=>{const f=setup();try{const a=localFixtureAdapter(f.vault);await assert.rejects(preserveArtifact({source:f.src,project:'../secret',version:'v1',adapter:a,custodyDir:f.ledger}),/invalid project/);await assert.rejects(preserveArtifact({source:f.src,project:'project',version:'../bad',adapter:a,custodyDir:f.ledger}),/invalid version/);}finally{cleanup(f.dir)}});

test('adapter-returned metadata does not prove provider identity',async()=>{
 const f=setup();try{const a={async put(){return {provider:'google-drive',object_id:'some-file-id',account_scope:'claimed-only'}},async restore({destination}){fs.copyFileSync(f.src,destination)}};
 const r=await preserveArtifact({source:f.src,project:'unit-test',version:'v1',adapter:a,custodyDir:f.ledger});
 assert.equal(r.state,'byte_verified');assert.equal(r.backup_roundtrip_attested,false);assert.equal(r.provider_authentication,'not_independently_attested');
 }finally{cleanup(f.dir)}
});

test('tampered retrieved bytes fail closed and keep failure record',async()=>{
 const f=setup();try{const a={async put(){return {provider:'fake',object_id:'abc',account_scope:'private'}},async restore({destination}){fs.writeFileSync(destination,Buffer.from([1,2,3,4,254]))}};
 await assert.rejects(preserveArtifact({source:f.src,project:'unit-test',version:'v1',adapter:a,custodyDir:f.ledger}),/differ/);
 const d=path.join(f.ledger,fs.readdirSync(f.ledger)[0]);assert(fs.existsSync(path.join(d,'09-failure.json')));assert(!fs.existsSync(path.join(d,'02-roundtrip.json')));
 }finally{cleanup(f.dir)}
});

test('adapter failure produces non-sensitive failure record without fake verification',async()=>{
 const f=setup();try{const a={async put(){throw new Error('secret-token=abc1234')},async restore(){}};
 await assert.rejects(preserveArtifact({source:f.src,project:'unit-test',version:'v1',adapter:a,custodyDir:f.ledger}),/secret-token/);
 const folder=path.join(f.ledger,fs.readdirSync(f.ledger)[0]);const receipt=fs.readFileSync(path.join(folder,'09-failure.json'),'utf8');
 assert(!receipt.includes('abc1234'));assert.equal(JSON.parse(receipt).phase,'upload');
 }finally{cleanup(f.dir)}
});

test('invalid adapter handle fails before readback',async()=>{
 const f=setup();try{let called=false;const a={async put(){return {provider:'fake',object_id:null}},async restore(){called=true}};
 await assert.rejects(preserveArtifact({source:f.src,project:'unit-test',version:'v1',adapter:a,custodyDir:f.ledger}),/invalid object handle/);assert.equal(called,false);
 }finally{cleanup(f.dir)}
});

test('symlinked source is rejected',async()=>{
 const f=setup();try{const link=path.join(f.dir,'source-link.zip');fs.symlinkSync(f.src,link);
 await assert.rejects(preserveArtifact({source:link,project:'unit-test',version:'v1',adapter:localFixtureAdapter(f.vault),custodyDir:f.ledger}),/symlink/);
 }finally{cleanup(f.dir)}
});

test('symlinked restored artifact is rejected',async()=>{
 const f=setup();try{const a={async put(){return {provider:'fake',object_id:'id',account_scope:'private'}},async restore({destination}){fs.symlinkSync(f.src,destination)}};
 await assert.rejects(preserveArtifact({source:f.src,project:'unit-test',version:'v1',adapter:a,custodyDir:f.ledger}),/symlink/);
 }finally{cleanup(f.dir)}
});

test('source mutation during remote step fails closed',async()=>{
 const f=setup();try{const a={async put(){return {provider:'fake',object_id:'id',account_scope:'private'}},async restore({destination}){fs.copyFileSync(f.src,destination);fs.writeFileSync(f.src,'changed')}};
 await assert.rejects(preserveArtifact({source:f.src,project:'unit-test',version:'v1',adapter:a,custodyDir:f.ledger}),/source changed/);
 }finally{cleanup(f.dir)}
});


test('identical repeat preservation is idempotent in fixture adapter and receipts remain separate',async()=>{
 const f=setup();try{const adapter=localFixtureAdapter(f.vault);
 const a=await preserveArtifact({source:f.src,project:'unit-test',version:'v1',adapter,custodyDir:f.ledger});
 const b=await preserveArtifact({source:f.src,project:'unit-test',version:'v1',adapter,custodyDir:f.ledger});
 assert.equal(a.state,'byte_verified');assert.equal(b.state,'byte_verified');
 assert.notEqual(a.run_id,b.run_id);assert.equal(fs.readdirSync(f.vault).length,1);
 assert.equal(fs.readdirSync(f.ledger).length,2);
 }finally{cleanup(f.dir)}
});

test('symlinked custody ledger directory is forbidden',async()=>{
 const f=setup();try{const link=path.join(f.dir,'ledger-link');fs.mkdirSync(f.ledger);fs.symlinkSync(f.ledger,link);
 await assert.rejects(preserveArtifact({source:f.src,project:'unit-test',version:'v1',adapter:localFixtureAdapter(f.vault),custodyDir:link}),/symlink/);
 }finally{cleanup(f.dir)}
});


test('obvious credential filenames are rejected before adapter invocation',async()=>{
 const f=setup();try{const sensitive=path.join(f.dir,'.env');fs.writeFileSync(sensitive,'SECRET=not-for-upload');
 let called=false;const a={async put(){called=true},async restore(){}};
 await assert.rejects(preserveArtifact({source:sensitive,project:'unit-test',version:'v1',adapter:a,custodyDir:f.ledger}),/sensitive filename/);
 assert.equal(called,false);
 }finally{cleanup(f.dir)}
});
