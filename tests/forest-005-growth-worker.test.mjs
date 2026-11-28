import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {expandForestOnce} from '../research/forest-restoration/forest-005-growth-worker.mjs';
const at=Date.parse('2026-11-27T20:00:00Z');
const header='area_fips,own_code,industry_code,agglvl_code,size_code,year,qtr,disclosure_code,annual_avg_estabs,annual_avg_emplvl,total_annual_wages';
const csv=area=>Buffer.from(header+'\n'+area+',5,113,75,0,2025,A,,2,10,500000\n'+area+',5,115310,78,0,2025,A,N,0,0,0\n');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'forest-growth-'));fs.chmodSync(root,0o700);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root}
test('two invocations expand different counties, reusing verified receipts',async t=>{
 const root=fixture(t),calls=[],fetchCounty=async a=>{calls.push(a);return csv(a)};
 const a=await expandForestOnce({root,now:at,fetchCounty}),b=await expandForestOnce({root,now:at+300000,fetchCounty});
 assert.equal(a.state,'expanded');assert.equal(b.state,'expanded');assert.equal(b.verified_counties,2);assert.notEqual(a.area,b.area);assert.equal(calls.length,2);
 const p=JSON.parse(fs.readFileSync(path.join(root,a.area,'baseline.json')));
 assert.equal(p.result.total.annual_avg_emplvl.complete_total,null);assert.equal(p.result.total.annual_avg_emplvl.known_subtotal,10);assert.equal(p.result.incremental_jobs,null);
 assert.equal(a.publication_authorized,false);
});
test('wrong scope is held and skipped until retry interval',async t=>{
 const root=fixture(t);const a=await expandForestOnce({root,now:at,fetchCounty:async()=>csv('99999')});
 assert.equal(a.state,'source_or_validation_hold');assert.equal(a.new_counties,0);assert.equal(fs.existsSync(path.join(root,a.area)),false);
 const b=await expandForestOnce({root,now:at+300000,fetchCounty:async c=>csv(c)});assert.equal(b.state,'expanded');assert.notEqual(a.area,b.area);
});
test('existing corrupt receipt prevents further network work',async t=>{
 const root=fixture(t);const a=await expandForestOnce({root,now:at,fetchCounty:async c=>csv(c)});
 fs.appendFileSync(path.join(root,a.area,'source.csv'),'tamper');
 await assert.rejects(expandForestOnce({root,now:at+300000,fetchCounty:async()=>{throw Error('unexpected_fetch')}}),/receipt_integrity_hold/);
});
test('concurrent invocation cannot duplicate work',async t=>{
 const root=fixture(t);let release;const paused=new Promise(r=>{release=r});let ready;const entered=new Promise(r=>{ready=r});
 const first=expandForestOnce({root,now:at,fetchCounty:async c=>{ready();await paused;return csv(c)}});await entered;
 try{const b=await expandForestOnce({root,now:at,fetchCounty:async()=>{throw Error('unexpected_fetch')}});assert.equal(b.state,'held_busy')}finally{release()}
 assert.equal((await first).state,'expanded');
});
test('all 11 counties complete exactly once; no repeat fetch',async t=>{
 const root=fixture(t),calls=[];for(let i=0;i<11;i++)assert.equal((await expandForestOnce({root,now:at+i*300000,fetchCounty:async a=>{calls.push(a);return csv(a)}})).state,'expanded');
 const end=await expandForestOnce({root,now:at+12*300000,fetchCounty:async()=>{throw Error('unexpected_fetch')}});
 assert.equal(end.state,'coverage_complete');assert.equal(end.verified_counties,11);assert.equal(new Set(calls).size,11);
});

test('serial replays in the same heartbeat tick cannot expand twice',async t=>{
 const root=fixture(t);const a=await expandForestOnce({root,now:at,fetchCounty:async c=>csv(c)});
 assert.equal(a.state,'expanded');
 const b=await expandForestOnce({root,now:at+1000,fetchCounty:async()=>{throw Error('unexpected_fetch')}});
 assert.equal(b.state,'duplicate_tick');assert.equal(b.verified_counties,1);
});
