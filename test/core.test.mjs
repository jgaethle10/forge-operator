import test from 'node:test';
import assert from 'node:assert/strict';
import {MiB,checkBudget,classifyFile,safeFilename,createPlan,dot,cosine,pickEvidence,splitSentences,sha256,makeLosslessParts,reassemblePieces,verifyManifestShape,formatBytes} from '../src/core.mjs';
const f=(name,text,type='text/plain')=>new File([text],name,{type});
test('size and bad input are safe',()=>{
 assert.equal(formatBytes(0),'0 B');assert.equal(safeFilename('../../abc<bad>.txt'),'abc_bad_.txt');
 assert.throws(()=>checkBudget(0.01));assert.throws(()=>checkBudget(300));assert.equal(checkBudget(1),MiB);
 assert.equal(classifyFile(f('demo.txt','hello')),'text');
 assert.equal(classifyFile(new File([new Uint8Array([1,2])],'x.pdf',{type:'application/pdf'})),'binary');
});
test('plans distinguish exact original and lossy derivative',()=>{
 const file=f('test.txt','hello');
 assert.equal(createPlan(file,20,'exact').method,'original');
 assert.equal(createPlan(file,2,'exact').method,'lossless-parts');
 assert.equal(createPlan(file,50,'brief',false).method,'ai-not-ready');
 assert.equal(createPlan(file,50,'brief',true).lossy,true);
 assert.equal(createPlan(new File([new Uint8Array(100)],'p.png',{type:'image/png'}),20,'compact').method,'image-reencode');
});
test('embedding ranking preserves source order and is math-backed',()=>{
 assert.equal(dot([1,2],[3,4]),11); assert.ok(cosine([1,0],[0,1])<0.01);
 const selected=pickEvidence(['A original','B relevant','C relevant'],[[0,1],[1,0],[.9,.1]],[1,0],2);
 assert.deepEqual(selected.map(x=>x.index),[1,2]);
 assert.throws(()=>pickEvidence(['A'],[],[1,0]));
 assert.equal(splitSentences('One small. This sentence contains relevant information.\nAnd this sentence mentions timeline and support.').length,2);
});
test('lossless split and reassembly hash original bytes',async()=>{
 const bytes=new Uint8Array(3500);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
 const source=new File([bytes],'photo copy.pdf',{type:'application/pdf'});
 let progress=0;const r=await makeLosslessParts(source,1100,{onProgress:p=>{progress=p;}});
 assert.equal(r.pieces.length,4);assert.equal(progress,1);assert.equal(r.manifest.parts.length,4);
 assert.equal(r.manifest.original_sha256,await sha256(source));
 assert.ok(r.pieces.every(p=>p.size<=1100));
 assert.ok(verifyManifestShape(r.manifest,r.pieces.map(p=>p.name)));
 const reversed=r.pieces.toReversed().map(p=>new File([p.blob],p.name));
 const reassembled=await reassemblePieces(r.manifest,reversed);
 assert.equal(await sha256(reassembled.blob),await sha256(source));
 const corrupted=reversed.map((p,i)=>i===0?new File(['corrupted'],p.name):p);
 await assert.rejects(reassemblePieces(r.manifest,corrupted),/Wrong size|Checksum mismatch/);
 await assert.rejects(reassemblePieces(r.manifest,reversed.slice(1)),/missing|duplicated/i);
});
test('no false whole-original proof above threshold',async()=>{
 const source=new File([new Uint8Array(1025)],'sample.bin');
 const r=await makeLosslessParts(source,1024);assert.equal(r.pieces.length,2);
 r.manifest.original_sha256=null;r.manifest.original_sha256_state='not_computed_file_over_32_mib';
 assert.equal(verifyManifestShape(r.manifest,r.pieces.map(p=>p.name)),true);
});