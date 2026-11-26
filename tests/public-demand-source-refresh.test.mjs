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
