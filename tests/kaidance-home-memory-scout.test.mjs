import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {SOURCES,runHomeMemoryScout} from '../systemia/organism/kaidance-home-memory-scout.mjs';
const at=new Date('2026-11-26T16:00:00Z');
const next=n=>new Date(+at+n*300000);
const fixture=t=>{const out=fs.mkdtempSync(path.join(os.tmpdir(),'home-scout-'));t.after(()=>fs.rmSync(out,{recursive:true,force:true}));return out};
test('bounded source observation, no body or identity persists, same tick dedupes',async t=>{
 const outDir=fixture(t),calls=[];const fetcher=async(url,opts)=>{calls.push(url);assert.equal(opts.redirect,'error');return new Response('<html>private-looking name fixture</html>',{headers:{'content-type':'text/html'}})};
 const a=await runHomeMemoryScout({outDir,now:at,fetcher});
 assert.equal(a.requests,1);assert.equal(a.observed,1);assert.equal(a.changed,1);assert.equal(a.archive_items_ingested,0);
 assert.equal(a.candidates[0].source_url,SOURCES[0].url);assert.equal(a.candidates[0].publication_authorized,false);
 assert.equal((await runHomeMemoryScout({outDir,now:at,fetcher})).duplicate,true);
 assert.equal(calls.length,1);assert.ok(!fs.readFileSync(path.join(outDir,'state.json'),'utf8').includes('private-looking'));
 await runHomeMemoryScout({outDir,now:next(1),fetcher});assert.equal(calls[1],SOURCES[1].url);
 for(let i=2;i<5;i++)await runHomeMemoryScout({outDir,now:next(i),fetcher});
 assert.equal((await runHomeMemoryScout({outDir,now:next(5),fetcher})).requests,0);assert.equal(calls.length,5);
});
test('source failure holds; no fabricated source observation',async t=>{
 const r=await runHomeMemoryScout({outDir:fixture(t),now:at,fetcher:async()=>new Response('no',{status:403})});
 assert.equal(r.status,'held_source');assert.equal(r.observed,0);assert.equal(r.candidates[0].action,'reconcile_archive_source_availability');
});
test('rejects oversized response',async t=>{
 const r=await runHomeMemoryScout({outDir:fixture(t),now:at,fetcher:async()=>new Response('x'.repeat(512001),{headers:{'content-type':'text/html'}})});
 assert.equal(r.observed,0);assert.equal(r.status,'held_source');
});
test('rejects clock rollback',async t=>{
 const outDir=fixture(t),fetcher=async()=>new Response('ok',{headers:{'content-type':'text/html'}});
 await runHomeMemoryScout({outDir,now:next(1),fetcher});await assert.rejects(runHomeMemoryScout({outDir,now:at,fetcher}),/clock_rollback/);
});
