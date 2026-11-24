import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {researchCycle} from './research-cycle.mjs';
const now=new Date('2026-11-24T12:00:00Z');
function fixture(t){const outDir=fs.mkdtempSync(path.join(os.tmpdir(),'cemetery-proof-'));t.after(()=>fs.rmSync(outDir,{recursive:true,force:true}));return outDir;}
const response=()=>new Response(JSON.stringify({results:[{resource:{id:'fixture-1',name:'Synthetic catalog item'},permalink:'https://example.invalid'}]}));
test('first cycle retains candidate evidence; subsequent same-day cycle does not refetch',async t=>{
 const outDir=fixture(t);let calls=0;const fetcher=async()=>{calls++;return response()};
 const a=await researchCycle({outDir,now,fetcher});assert.equal(a.state,'complete');assert.equal(a.catalog_candidates,1);assert.equal(a.burial_records_imported,0);
 const b=await researchCycle({outDir,now:new Date(now.getTime()+300000),fetcher});assert.equal(b.executed_this_cycle,false);assert.equal(calls,1);
});
test('source outage remains held without replay in same day',async t=>{
 const outDir=fixture(t);let calls=0;const fetcher=async()=>{calls++;return new Response('',{status:503})};
 const a=await researchCycle({outDir,now,fetcher});assert.equal(a.state,'blocked');assert.equal(a.catalog_candidates,null);
 await researchCycle({outDir,now,fetcher});assert.equal(calls,1);
});
test('tampered evidence cannot qualify as completed research',async t=>{
 const outDir=fixture(t);await researchCycle({outDir,now,fetcher:async()=>response()});
 const file=path.join(outDir,'va-catalog-2026-11-24.evidence.json');const obj=JSON.parse(fs.readFileSync(file));obj.records=[];fs.writeFileSync(file,JSON.stringify(obj));
 await assert.rejects(researchCycle({outDir,now,fetcher:async()=>response()}),/evidence mismatch/);
});
test('invalid source schema does not imply zero cemetery coverage',async t=>{
 const a=await researchCycle({outDir:fixture(t),now,fetcher:async()=>new Response('{}')});assert.equal(a.state,'blocked');assert.equal(a.catalog_candidates,null);
});
