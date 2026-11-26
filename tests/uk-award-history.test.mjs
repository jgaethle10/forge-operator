import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runUkAwardHistory} from '../systemia/revenue-desk/uk-award-history.mjs';
const now=new Date('2026-11-26T06:30:00Z');
function setup(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'award-history-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 return directory;
}
function window({windowStart,windowEnd},coverage_complete=true){
 return {window_start:windowStart.toISOString(),window_end:windowEnd.toISOString(),coverage_complete,pages_observed:1,releases:[]};
}
test('complete windows persist and are not fetched twice',async t=>{
 const directory=setup(t);let calls=0;
 const collect=async args=>{calls++;return window(args)};
 const opts={directory,now,days:2,collect};
 const a=await runUkAwardHistory(opts),b=await runUkAwardHistory(opts),c=await runUkAwardHistory(opts);
 assert.equal(a.window,'2026-11-25');assert.equal(b.window,'2026-11-24');
 assert.equal(c.state,'inventory_windows_retained');assert.equal(calls,2);
 assert.equal(fs.statSync(a.artifact).mode&0o777,0o600);
});
test('partial retrieval remains held and is not repeated',async t=>{
 const directory=setup(t);let calls=0;
 const opts={directory,now,days:1,collect:async args=>{calls++;return window(args,false)}};
 const a=await runUkAwardHistory(opts);
 assert.equal(a.state,'hold_partial');
 await runUkAwardHistory(opts);
 assert.equal(calls,1);
 assert.equal(JSON.parse(fs.readFileSync(a.artifact,'utf8')).state,'hold_partial');
});
test('mismatched window is rejected without publishing receipt',async t=>{
 const directory=setup(t);
 await assert.rejects(runUkAwardHistory({directory,now,days:1,collect:async args=>({...window(args),window_start:'bad'})}),/history_window_identity_mismatch/);
 assert.deepEqual(fs.readdirSync(directory),[]);
});
test('existing lock excludes overlapping run',async t=>{
 const directory=setup(t);fs.writeFileSync(path.join(directory,'history.lock'),'{}',{mode:0o600});
 await assert.rejects(runUkAwardHistory({directory,now,days:1,collect:async()=>{throw Error('must not collect')}}),{code:'EEXIST'});
 assert.ok(fs.existsSync(path.join(directory,'history.lock')));
});
test('tampered retained plan fails closed',async t=>{
 const directory=setup(t);const opts={directory,now,days:1,collect:async args=>window(args)};
 const a=await runUkAwardHistory(opts);
 const receipt=JSON.parse(fs.readFileSync(a.artifact,'utf8'));receipt.plan.signals.push({fake:true});fs.writeFileSync(a.artifact,JSON.stringify(receipt));
 await assert.rejects(runUkAwardHistory(opts),/history_receipt_identity_mismatch/);
});
