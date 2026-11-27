import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {observeLeilandSabanCycle} from '../systemia/leiland/observe-saban-sovereign-cycle.mjs';
import {runCompanyHeartbeat} from '../systemia/organism/kaidance-company-heartbeat-runner.mjs';
const now=new Date('2026-11-26T20:00:00Z'),tick=Math.floor(+now/300000);
const digest='sha256:'+'a'.repeat(64);
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'leiland-observe-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'leiland-sovereign-cycle.json');
 const body={schema:'evercraft.leiland.saban-cycle.v1',synthetic_input:true,
  external_actions_authorized:false,remote_dispatch_authorized:false,production_worker_verified:false,
  state:'completed',tick,lane:'findmypart',assignment_key:'leiland:findmypart:'+tick,
  assignment_attempted:true,inference_completed:1,quality_reviewed:false,
  provider_receipt:digest,output_digest:digest,authorization_digest:digest};
 function save(changes={}){
  const value={...body,...changes};
  fs.writeFileSync(file,JSON.stringify({...value,state_hash:'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex')}),{mode:0o600});
 }
 return {root,file,save};
}
test('not admitted or absent receipt is never reported as inference',t=>{
 const f=fixture(t);
 assert.equal(observeLeilandSabanCycle().state,'not_admitted');
 assert.equal(observeLeilandSabanCycle({root:f.root,now}).state,'no_receipt');
});
test('fresh and stale observations distinguish source completion from production availability',t=>{
 const f=fixture(t);f.save({private_fixture:'must-not-leak'});
 const r=observeLeilandSabanCycle({root:f.root,now});
 assert.equal(r.state,'reported_synthetic_completion');
 assert.equal(r.live_worker_verified,false);assert.equal(r.reported_inference_count,1);
 assert.equal(r.observed_this_tick,true);
 assert.doesNotMatch(JSON.stringify(r),/must-not-leak|provider_receipt|authorization_digest|output_digest/);
 assert.equal(observeLeilandSabanCycle({root:f.root,now:new Date(+now+3600000)}).state,'stale_receipt');
 assert.equal(observeLeilandSabanCycle({root:f.root,now:new Date(+now-300000)}).state,'held_receipt_invalid');
});
test('unresolved and conflicting authority receipts fail closed',t=>{
 const f=fixture(t);
 f.save({state:'pending'});assert.equal(observeLeilandSabanCycle({root:f.root,now}).state,'held_reconciliation_required');
 f.save({state:'held'});assert.equal(observeLeilandSabanCycle({root:f.root,now}).state,'held_reconciliation_required');
 f.save({external_actions_authorized:true});assert.equal(observeLeilandSabanCycle({root:f.root,now}).state,'held_receipt_invalid');
 f.save();const r=JSON.parse(fs.readFileSync(f.file,'utf8'));r.inference_completed=2;
 fs.writeFileSync(f.file,JSON.stringify(r));
 assert.equal(observeLeilandSabanCycle({root:f.root,now}).state,'held_receipt_invalid');
});
test('unsafe permissions and symlinks do not expose state',t=>{
 const f=fixture(t);f.save();fs.chmodSync(f.file,0o644);
 assert.equal(observeLeilandSabanCycle({root:f.root,now}).state,'held_source_unsafe');
 fs.renameSync(f.file,f.file+'.target');fs.symlinkSync(f.file+'.target',f.file);
 assert.equal(observeLeilandSabanCycle({root:f.root,now}).state,'held_source_unsafe');
});
test('existing company heartbeat reads only bounded receipt and preserves P0 work',t=>{
 const f=fixture(t);f.save();
 const result=runCompanyHeartbeat({root:'.',outDir:path.join(f.root,'company'),now,leilandSabanRoot:f.root});
 assert.equal(result.report.leiland_intelligence.state,'reported_synthetic_completion');
 assert.equal(result.report.findmypart.priority,1);
 assert.equal(result.report.findmypart.worker_dispatched,false);
 assert.ok(result.queue.candidates.some(x=>x.work_key==='findmypart:commercial-discovery'));
 assert.equal(result.report.leiland_intelligence.execution_authorized,false);
 const again=runCompanyHeartbeat({root:'.',outDir:path.join(f.root,'company'),now,leilandSabanRoot:f.root});
 assert.equal(again.duplicate,true);
});
