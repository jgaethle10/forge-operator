import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {researchCycle} from './research-cycle.mjs';
import {sourceId,classifyMetadata,classifyNext} from './source-classification.mjs';
const now=new Date('2026-11-24T12:00:00Z');
async function fixture(t){
 const outDir=fs.mkdtempSync(path.join(os.tmpdir(),'cemetery-classify-'));
 t.after(()=>fs.rmSync(outDir,{recursive:true,force:true}));
 await researchCycle({outDir,now,fetcher:async()=>new Response(JSON.stringify({results:['abcd-1234','efgh-5678'].map(id=>({resource:{id,name:'Burial '+id},permalink:'https://www.data.va.gov/d/'+id}))}))});
 return outDir;
}
test('only exact VA dataset permalinks qualify',()=>{
 assert.equal(sourceId('https://www.data.va.gov/d/abcd-1234'),'abcd-1234');
 for(const url of ['https://evil.example/d/abcd-1234','https://www.data.va.gov/d/abcd-1234?x=1','http://www.data.va.gov/d/abcd-1234'])assert.equal(sourceId(url),null);
});
test('metadata is not download or reuse authority',()=>{
 const m=classifyMetadata({id:'abcd-1234',viewType:'tabular',licenseId:'public',columns:[{fieldName:'burial_date',dataTypeName:'text'}]},'abcd-1234');
 assert.equal(m.tabular_metadata,true);assert.deepEqual(m.possible_burial_fields,['burial_date']);assert.equal(m.ingestion_authorized,false);assert.equal(m.record_count,null);
 assert.throws(()=>classifyMetadata({id:'wrong'},'abcd-1234'),/identity/);
});
test('one new source per cycle, no repeats after exhaustion',async t=>{
 const outDir=await fixture(t),calls=[];
 const fetcher=async url=>{calls.push(url);return new Response(JSON.stringify({id:url.match(/([a-z0-9]{4}-[a-z0-9]{4})\.json$/)[1],viewType:'tabular',columns:[{fieldName:'latitude'}]}))};
 const a=await classifyNext({outDir,fetcher,now});assert.equal(a.classified,1);assert.equal(a.pending,1);
 const b=await classifyNext({outDir,fetcher,now});assert.equal(b.classified,2);
 const c=await classifyNext({outDir,fetcher,now});assert.equal(c.attempted_this_cycle,false);assert.equal(calls.length,2);assert.equal(new Set(calls).size,2);
});
test('unavailable source is held, not repeated',async t=>{
 const outDir=await fixture(t);let calls=0;const fetcher=async()=>{calls++;return new Response('',{status:503})};
 assert.equal((await classifyNext({outDir,fetcher,now})).held,1);
 assert.equal((await classifyNext({outDir,fetcher,now})).held,2);
 await classifyNext({outDir,fetcher,now});assert.equal(calls,2);
});
test('tampered catalog cannot trigger metadata fetch',async t=>{
 const outDir=await fixture(t);const file=path.join(outDir,'va-catalog-2026-11-24.evidence.json');const data=JSON.parse(fs.readFileSync(file));data.records=[];fs.writeFileSync(file,JSON.stringify(data));
 await assert.rejects(classifyNext({outDir,fetcher:async()=>{throw Error('unexpected fetch')},now}),/catalog evidence mismatch/);
});
