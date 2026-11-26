import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {refreshDueSource} from '../systemia/revenue-desk/public-demand-source-refresh.mjs';
const flags={qualified:false,contact_authorized:false,execution_authorized:false,send_performed:false};
test('one registered source per six-hour slot; restart replay does not browse',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'refresh-proof-'));
 try{
  let calls=0;
  const observe=async({sourceKey,observationSlot})=>{calls++;return {source_key:sourceKey,state:'no_new_solicitation_pointers',added:0,...flags};};
  const now=new Date('2026-11-26T12:01:00Z');
  const first=await refreshDueSource({root,now,observe});
  const replay=await refreshDueSource({root,now:new Date(+now+300000),observe});
  assert.equal(replay.state,'not_due');assert.equal(replay.receipt_sha256,first.receipt_sha256);assert.equal(calls,1);
  const next=await refreshDueSource({root,now:new Date(+now+21600000),observe});
  assert.notEqual(next.source_key,first.source_key);assert.equal(calls,2);
  const failed=await refreshDueSource({root,now:new Date(+now+43200000),observe:async()=>{throw Error('network_failure');}});
  assert.equal(failed.state,'hold_source_refresh');assert.equal(failed.contact_authorized,false);
  assert.equal((await refreshDueSource({root,now:new Date(+now+43200000+300000),observe})).state,'not_due');
  assert.equal(calls,2);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('durable slot claim excludes a concurrent observer and an interrupted slot does not poison future slots',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'refresh-claim-proof-'));
 try{
  const now=new Date('2026-11-26T12:01:00Z');
  let release, entered, calls=0;
  const started=new Promise(resolve=>{entered=resolve;});
  const wait=new Promise(resolve=>{release=resolve;});
  const observe=async({sourceKey})=>{calls++;entered();await wait;return {source_key:sourceKey,state:'no_new_solicitation_pointers',added:0,...flags};};
  const first=refreshDueSource({root,now,observe});
  await started;
  const duplicate=await refreshDueSource({root,now,observe});
  assert.equal(duplicate.state,'hold_refresh_attempt_unresolved');
  assert.equal(calls,1);
  assert.equal(duplicate.contact_authorized,false);
  release();
  const completed=await first;
  assert.equal(completed.attempt_sha256,duplicate.attempt_sha256);
  assert.equal((await refreshDueSource({root,now,observe})).state,'not_due');
  const next=new Date(+now+21600000);
  const slot=Math.floor(+next/21600000);
  const dir=path.join(root,'source-refresh-receipts');
  const sourceKey=['yvl','susta'][slot%2];
  fs.writeFileSync(path.join(dir,'slot-'+slot+'.attempt.json'),JSON.stringify({schema:'evercraft.public-demand.source-refresh-attempt.v1',slot,source_key:sourceKey,started_at:next.toISOString(),...flags}),{mode:0o600});
  assert.equal((await refreshDueSource({root,now:next,observe})).state,'hold_refresh_attempt_unresolved');
  assert.equal(calls,1);
  const later=await refreshDueSource({root,now:new Date(+next+21600000),observe});
  assert.equal(later.state,'no_new_solicitation_pointers');
  assert.equal(calls,2);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
