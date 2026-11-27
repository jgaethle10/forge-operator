import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runLeilandSabanCycle} from '../systemia/leiland/saban-sovereign-cycle.mjs';
import {runRegisteredAssignment} from '../systemia/saban/registered-worker.mjs';
const now=new Date('2026-11-26T20:00:00Z');
const enabled={leilandLocalProofEnabled:true};
const digest='sha256:'+'a'.repeat(64);
function fixture(t){
 const stateDir=fs.mkdtempSync(path.join(os.tmpdir(),'leiland-saban-'));
 t.after(()=>fs.rmSync(stateDir,{recursive:true,force:true}));
 return {stateDir,now,executionContext:enabled};
}
function accepted({software,assignment}){
 return {schema:'evercraft.saban.registered-worker-receipt.v1',software_id:software,
  idempotency_key:assignment.idempotency_key,result:{schema:'evercraft.leiland.saban-proof.v1',
   state:'provider_reported_completed',lane:'findmypart',synthetic_input:true,
   inference_completed:1,inference_request_attempted:true,result_released:true,
   external_actions_authorized:false,authorization_digest:digest,
   receipts:[{lane:'findmypart',provider_receipt:digest,output_digest:digest,output_quality_verified:false,quality_profile:'findmypart-extraction-fixture-v1',synthetic_extraction_validated:true}]}};
}
test('default disabled writes nothing and calls no worker',async t=>{
 const f=fixture(t);
 const r=await runLeilandSabanCycle({...f,executionContext:null,registeredAssignment:()=>assert.fail()});
 assert.equal(r.state,'disabled');assert.deepEqual(fs.readdirSync(f.stateDir),[]);
});
test('registered worker without trusted operator binding holds',async()=>{
 const r=await runRegisteredAssignment({software:'leiland-sovereign-proof',
  assignment:{agent_id:'fixture',role:'synthetic_repair_evidence_review',work:{kind:'synthetic_review',key:'findmypart'}}});
 assert.equal(r.result.state,'held');assert.equal(r.result.inference_request_attempted,false);
});
test('one P0 synthetic assignment, durable checkpoint and hour cooldown',async t=>{
 const f=fixture(t);let calls=0;
 const run=opts=>runLeilandSabanCycle({...f,registeredAssignment:async a=>{
  calls++;assert.equal(a.assignment.work.key,'findmypart');
  const saved=JSON.parse(fs.readFileSync(path.join(f.stateDir,'leiland-sovereign-cycle.json'),'utf8'));
  assert.equal(saved.state,'pending');return accepted(a);
 },...opts});
 const first=await run();assert.equal(first.state,'completed');assert.equal(first.synthetic_extraction_validated,true);
 assert.equal((await run()).state,'cooldown');
 assert.equal((await run({now:new Date(+now+55*60000)})).state,'cooldown');
 assert.equal((await run({now:new Date(+now+60*60000)})).state,'completed');
 assert.equal(calls,2);
});
test('concurrent cycle cannot dispatch another assignment',async t=>{
 const f=fixture(t);
 let release,entered;const ready=new Promise(r=>entered=r);
 const gate=new Promise(r=>release=r);
 const pending=runLeilandSabanCycle({...f,registeredAssignment:async a=>{entered();await gate;return accepted(a)}});
 await ready;
 try{const duplicate=await runLeilandSabanCycle({...f,registeredAssignment:()=>assert.fail()});
  assert.equal(duplicate.state,'held_busy_or_unsafe');
 }finally{release();await pending}
});
test('uncertain outcomes do not retry on later ticks',async t=>{
 const f=fixture(t);const r=await runLeilandSabanCycle({...f,registeredAssignment:async()=>{throw Error('uncertain')}});
 assert.equal(r.state,'held');assert.equal(r.inference_completed,null);
 assert.equal((await runLeilandSabanCycle({...f,now:new Date(+now+3600000),
  registeredAssignment:()=>assert.fail()})).state,'held_unreconciled_checkpoint');
});
test('tampered checkpoint fails closed',async t=>{
 const f=fixture(t);await runLeilandSabanCycle({...f,registeredAssignment:accepted});
 const file=path.join(f.stateDir,'leiland-sovereign-cycle.json');
 const r=JSON.parse(fs.readFileSync(file,'utf8'));r.tick-=30;
 fs.writeFileSync(file,JSON.stringify(r));
 assert.equal((await runLeilandSabanCycle({...f,registeredAssignment:()=>assert.fail()})).state,'held_state_or_contract');
});

test('provider completion alone is not qualified extraction; hold without retry',async t=>{
 const f=fixture(t);
 const r=await runLeilandSabanCycle({...f,registeredAssignment:async a=>{
  const receipt=accepted(a);
  delete receipt.result.receipts[0].synthetic_extraction_validated;
  return receipt;
 }});
 assert.equal(r.state,'held');assert.equal(r.inference_completed,null);
 assert.equal((await runLeilandSabanCycle({...f,now:new Date(+now+3600000),
  registeredAssignment:()=>assert.fail()})).state,'held_unreconciled_checkpoint');
});
