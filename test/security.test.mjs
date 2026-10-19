import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyManifestShape,reassemblePieces,makeLosslessParts,safeFilename,checkBudget,createPlan,sha256} from '../src/core.mjs';
test('manifest rejects missing, duplicated and invented parts',async()=>{
 const f=new File([new Uint8Array(3400).fill(7)],'data.bin');
 const out=await makeLosslessParts(f,1024);
 assert.throws(()=>verifyManifestShape({...out.manifest,total_parts:777},[]),/Invalid/);
 assert.throws(()=>verifyManifestShape({...out.manifest,parts:[]},[]),/count/);
 assert.throws(()=>verifyManifestShape(out.manifest,['duplicate','duplicate']),/missing|duplicated/i);
 const bad={...out.manifest,parts:out.manifest.parts.map(x=>({...x}))};bad.parts[0].sha256='not-sha';
 assert.throws(()=>verifyManifestShape(bad),/Malformed/);
 const original=out.pieces.map(p=>new File([p.blob],p.name));
 const corrupt=original.map((x,i)=>i===2?new File([new Uint8Array(x.size).fill(1)],x.name):x);
 await assert.rejects(reassemblePieces(out.manifest,corrupt),/Checksum mismatch/);
});
test('user-selected size has hard bounds and route cannot mislabel lossy as exact',()=>{
 assert.throws(()=>checkBudget('Infinity'));
 assert.throws(()=>checkBudget(-1));
 assert.equal(safeFilename('/a/b/secret\\folder?.txt'),'folder_.txt');
 const x=new File([new Uint8Array(20000)],'sample.jpg',{type:'image/jpeg'});
 assert.equal(createPlan(x,1024,'exact').lossy,false);
 assert.equal(createPlan(x,1024,'compact').lossy,true);
 assert.equal(createPlan(x,1024,'brief',true).method,'brief-unavailable');
});
test('sha256 matches published NIST empty-string digest',async()=>{
 const digest=await sha256(new Uint8Array(0));
 assert.equal(digest,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});