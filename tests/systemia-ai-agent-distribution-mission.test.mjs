import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { admitMission } from '../systemia/control-plane/control-plane.mjs';

const mission = JSON.parse(fs.readFileSync(
  'systemia/missions/ai-agent-distribution-first-paid-2026-10-08.json','utf8'
));
test('Systemia remains mission authority and does not silently grant execution or payment rights',()=>{
  const plan = admitMission({request:mission,now:new Date('2026-10-08T16:25:00Z')});
  assert.equal(plan.receipt.authority,'systemia-organism');
  assert.equal(plan.receipt.execution_authority_granted,false);
  assert.equal(plan.receipt.direct_specialist_dispatch_granted,false);
  assert.equal(plan.receipt.mission_key,mission.mission_key);
  assert.equal(plan.dispatch.length,mission.tasks.length);
  const paid = plan.dispatch.find(x=>x.work_key==='buyer-and-processor-proof');
  const send = plan.dispatch.find(x=>x.work_key==='partner-communications');
  assert.ok(paid && send);
  assert.equal(paid.execution_gate_required,true);
  assert.equal(paid.human_gate_required,true);
  assert.equal(paid.execution_authority_granted,false);
  assert.equal(send.relationship_preflight_required,true);
  assert.equal(send.human_gate_required,true);
  assert.equal(send.execution_authority_granted,false);
  assert.ok(plan.receipt.held_count>=2,'human gated commerce and outbound communications remain held');
});
