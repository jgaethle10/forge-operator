import test from 'node:test'; import assert from 'node:assert/strict';
import {planRepairUnit,repairPressure,buildRepairUnitState,executableRepairItems} from './repair-unit.mjs';

test('active automatable incidents become bounded repair work',()=>{const [p]=planRepairUnit([{finding_key:'x',code:'github_workflow_failed'}]);assert.equal(p.authority,'bounded_autonomous');assert.equal(repairPressure(p,{attempts:0},new Date('2026-09-30T20:00:00Z')).next,'repair');});
test('human gates never auto mutate',()=>{const [p]=planRepairUnit([{finding_key:'x',code:'x',human_gate_required:true}]);assert.equal(repairPressure(p).state,'human_gate');});
test('repair budget quarantines repeated failure',()=>{const [p]=planRepairUnit([{finding_key:'x',code:'github_workflow_failed'}],{maxAttempts:3});const q=repairPressure(p,{attempts:3});assert.equal(q.state,'quarantined');assert.equal(q.next,'quarantine_and_escalate');});
test('repeat attempts back off instead of hammering production',()=>{const [p]=planRepairUnit([{finding_key:'x',code:'github_workflow_failed'}]);const w=repairPressure(p,{attempts:2,last_attempt_at:'2026-09-30T20:00:00Z'},new Date('2026-09-30T20:01:00Z'));assert.equal(w.state,'cooldown');assert.ok(w.next_eligible_at);});
test('disappearing incidents close only as verified green state',()=>{const s=buildRepairUnitState([],{items:[{finding_key:'x',state:'repairing',attempts:1}]},{now:new Date('2026-09-30T20:10:00Z')});assert.equal(s.recently_resolved[0].state,'verified_green');});
test('executor only receives authorized repair work',()=>{const s=buildRepairUnitState([{finding_key:'a',code:'github_workflow_failed'},{finding_key:'b',code:'unknown'}],{items:[]},{now:new Date('2026-09-30T20:10:00Z')});assert.deepEqual(executableRepairItems(s).map(x=>x.finding_key),['a']);});
