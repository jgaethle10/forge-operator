import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {File} from 'node:buffer';
import {createHash} from 'node:crypto';
import {MIB,createLargeParcel,restoreLargeParcel} from '../public/forensiscope/ship-proof/parcel-large-engine.js';
const html=fs.readFileSync('public/forensiscope/ship-proof/index.html','utf8');
test('showcase uses the actual engine and avoids delivery claims',()=>{
 assert.ok(html.includes("from './parcel-large-engine.js'"));
 assert.ok(html.includes('Not a remote-delivery demonstration.'));
 assert.ok(html.includes('No file transmitted')||html.includes('No file was transmitted')||html.includes('Nothing remotely sent'));
 assert.ok(html.toLowerCase().includes('illustrative 18 mib'));
 assert.ok(html.includes('MIME/base64 adds roughly one-third'));
 assert.ok(html.includes('not verified sendable'));
 assert.ok(html.includes('Download proof JSON'));
});
test('26 MiB original reassembles with expected SHA-256; substitution blocked',async()=>{
 const b=Buffer.alloc(MIB);for(let i=0;i<b.length;i++)b[i]=(i*17+31)%251;
 const f=new File(Array.from({length:26},()=>b),'inspection-demo.bin');
 const hash=createHash('sha256');for(let i=0;i<26;i++)hash.update(b);
 const expected=hash.digest('hex');
 assert.equal(expected,'608151433dba70bb51873d4a3472568307c5dd1a8f618c1b3d8bbb6c9bcad0cc');
 const packed=await createLargeParcel(f,16*MIB);assert.equal(packed.parts.length,2);
 const parts=packed.parts.map(p=>new File([p.blob],p.name));
 const restored=await restoreLargeParcel(packed.manifest,parts);
 assert.equal(restored.sha256,expected);assert.equal(restored.blob.size,f.size);
 const bad=parts.map((p,i)=>i===0?new File([Buffer.alloc(p.size,99)],p.name):p);
 await assert.rejects(()=>restoreLargeParcel(packed.manifest,bad),/Corrupted/);
});
