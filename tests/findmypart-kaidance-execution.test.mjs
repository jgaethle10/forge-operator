import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {runFindMyPartCycle} from '../systemia/organism/kaidance-findmypart-execution.mjs';
const now=new Date('2026-11-26T19:30:00Z');
const response=()=>new Response('<html>Parts and repair. Appliance services.</html>',{headers:{'content-type':'text/html'}});
test('one bounded public observation and a benchmark per fresh tick; no qualified buyer claim',async()=>{
 const outDir=fs.mkdtempSync(path.join(os.tmpdir(),'findmypart-cycle-'));
 const seen=[];
 const fetchImpl=async(url,opts)=>{seen.push(url);assert.equal(opts.redirect,'error');return response()};
 try{
  const run=(offset=0)=>runFindMyPartCycle({outDir,now:new Date(+now+offset),fetchImpl,network:true});
  const a=await run();
  assert.equal(a.engineering_benchmark_executed,true);
  assert.equal(a.real_world_recoveries_verified,0);
  assert.equal(a.source_poll_performed,true);
  assert.equal(a.observation.status,'service_fit_observed');
  assert.equal(a.buyers_qualified,0);
  assert.equal(a.observation.buyer_need_confirmed,false);
  assert.equal(a.outreach_authorized,false);
  const duplicate=await run(1000);
  assert.equal(duplicate.duplicate,true);
  assert.equal(duplicate.source_poll_performed,false);
  assert.equal(duplicate.engineering_benchmark_executed,false);
  for(let i=1;i<6;i++)await run(i*300000);
  assert.equal(new Set(seen).size,6);
  assert.equal(seen.length,6);
  const cooldown=await run(6*300000);
  assert.equal(cooldown.commercial_status,'source_cooldown');
  assert.equal(seen.length,6);
  assert.equal(fs.statSync(path.join(outDir,'latest.json')).mode&0o777,0o600);
  await assert.rejects(run(-300000),/clock_rollback/);
 }finally{fs.rmSync(outDir,{recursive:true,force:true})}
});
test('network disabled and source failures never mint qualified leads',async()=>{
 const outDir=fs.mkdtempSync(path.join(os.tmpdir(),'findmypart-cycle-'));
 let calls=0;
 const fetchImpl=async()=>{calls++;throw Error('timeout')};
 try{
  const a=await runFindMyPartCycle({outDir,now,fetchImpl});
  assert.equal(calls,0);assert.equal(a.commercial_status,'network_disabled');
  const b=await runFindMyPartCycle({outDir,now:new Date(+now+300000),network:true,fetchImpl});
  assert.equal(calls,1);assert.equal(b.commercial_status,'source_unavailable');
  assert.equal(b.buyers_qualified,0);assert.equal(b.outreach_authorized,false);
 }finally{fs.rmSync(outDir,{recursive:true,force:true})}
});
